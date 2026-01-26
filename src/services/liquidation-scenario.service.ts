import { BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import type { IdlAccounts } from "@coral-xyz/anchor";
import type { Perpetuals } from "../idl/jupiter-perpetuals-idl";
import { getPerpetualsProgram } from "../utils/solana";
import {
  BPS_POWER,
  RATE_POWER,
  USDC_DECIMALS,
} from "../constants/index";
import { divCeil } from "../utils/math";
import { BNToUSDRepresentation, formatSide } from "../utils/formatting";
import { getOraclePriceForCustody } from "./oracle.service";
import { getCustodyData } from "./custody.service";

type Position = IdlAccounts<Perpetuals>["position"];
type Custody = IdlAccounts<Perpetuals>["custody"];

export interface LiquidationScenario {
  priceUsd: string;
  priceFormatted: string;
  priceChangePercent: string;
  pnlUsd: string;
  pnlFormatted: string;
  hasProfit: boolean;
  effectiveCollateralUsd: string;
  effectiveCollateralFormatted: string;
  marginLevelBps: string;
  marginLevelPercent: string;
  isLiquidated: boolean;
  distanceToLiquidationUsd: string;
  distanceToLiquidationFormatted: string;
}

export interface ScenarioAnalysisResult {
  positionPubkey: string;
  position: {
    owner: string;
    custody: string;
    collateralCustody: string;
    side: "long" | "short";
    sizeUsd: string;
    collateralUsd: string;
    entryPrice: string;
    leverage: string;
  };
  currentPrice: string;
  currentPriceFormatted: string;
  liquidationPrice: string;
  liquidationPriceFormatted: string;
  scenarios: LiquidationScenario[];
  safetyBuffer: {
    percentToLiquidation: string;
    priceMovementToLiquidation: string;
    currentMarginLevel: string;
    minMarginLevel: string;
  };
}

export interface ScenarioOptions {
  priceScenarios?: number[]; // Specific USD prices to analyze
  percentageScenarios?: number[]; // Price change percentages (e.g., [-20, -10, 0, 10, 20])
  timeHorizon?: number; // Hours to estimate borrow fee accumulation
}

// Default percentage scenarios based on position side
function getDefaultPercentageScenarios(isLong: boolean): number[] {
  if (isLong) {
    return [-50, -40, -30, -25, -20, -15, -10, -5, -2, 0, 2, 5, 10, 15, 20, 30];
  } else {
    return [-30, -20, -15, -10, -5, -2, 0, 2, 5, 10, 15, 20, 25, 30, 40, 50];
  }
}

// Calculate PnL at a given price
function calculatePnlAtPrice(
  position: Position,
  hypotheticalPrice: BN
): { hasProfit: boolean; pnl: BN } {
  const isLong = position.side.long !== undefined;

  const hasProfit = isLong
    ? hypotheticalPrice.gt(position.price)
    : position.price.gt(hypotheticalPrice);

  const priceDelta = hypotheticalPrice.sub(position.price).abs();
  const pnl = position.sizeUsd.mul(priceDelta).div(position.price);

  return { hasProfit, pnl };
}

// Calculate fees for closing a position
function calculateClosingFees(
  position: Position,
  custody: Custody,
  collateralCustody: Custody
): BN {
  // Price impact fee
  const priceImpactFeeBps = divCeil(
    position.sizeUsd.mul(BPS_POWER),
    custody.pricing.tradeImpactFeeScalar
  );
  const baseFeeBps = custody.decreasePositionBps;
  const totalFeeBps = baseFeeBps.add(priceImpactFeeBps);

  const closeFeeUsd = position.sizeUsd.mul(totalFeeBps).div(BPS_POWER);

  // Borrow fee
  const borrowFeeUsd = collateralCustody.fundingRateState.cumulativeInterestRate
    .sub(position.cumulativeInterestSnapshot)
    .mul(position.sizeUsd)
    .div(RATE_POWER);

  return closeFeeUsd.add(borrowFeeUsd);
}

// Calculate liquidation price for a position
function calculateLiquidationPriceInternal(
  position: Position,
  custody: Custody,
  collateralCustody: Custody
): BN {
  const totalFeeUsd = calculateClosingFees(position, custody, collateralCustody);

  // Max loss calculation (based on max leverage)
  const maxLossUsd = position.sizeUsd
    .mul(BPS_POWER)
    .div(custody.pricing.maxLeverage)
    .add(totalFeeUsd);

  const marginUsd = position.collateralUsd;

  let maxPriceDiff = maxLossUsd.sub(marginUsd).abs();
  maxPriceDiff = maxPriceDiff.mul(position.price).div(position.sizeUsd);

  const isLong = position.side.long !== undefined;

  if (isLong) {
    if (maxLossUsd.gt(marginUsd)) {
      return position.price.add(maxPriceDiff);
    } else {
      return position.price.sub(maxPriceDiff);
    }
  } else {
    if (maxLossUsd.gt(marginUsd)) {
      return position.price.sub(maxPriceDiff);
    } else {
      return position.price.add(maxPriceDiff);
    }
  }
}

// Analyze position at a hypothetical price
function analyzeAtPrice(
  position: Position,
  custody: Custody,
  collateralCustody: Custody,
  hypotheticalPrice: BN,
  currentPrice: BN
): LiquidationScenario {
  const { hasProfit, pnl } = calculatePnlAtPrice(position, hypotheticalPrice);

  // Calculate effective collateral after PnL
  const effectiveCollateralUsd = hasProfit
    ? position.collateralUsd.add(pnl)
    : position.collateralUsd.sub(pnl);

  // Calculate margin level (effective collateral / size * BPS_POWER)
  const marginLevelBps = effectiveCollateralUsd.mul(BPS_POWER).div(position.sizeUsd);

  // Calculate minimum margin level based on max leverage
  // Min margin = 1 / maxLeverage
  const minMarginLevelBps = BPS_POWER.mul(BPS_POWER).div(custody.pricing.maxLeverage);

  // Check if liquidated (margin level below minimum + fees)
  const totalFeeUsd = calculateClosingFees(position, custody, collateralCustody);
  const maxAllowedLoss = position.sizeUsd.mul(BPS_POWER).div(custody.pricing.maxLeverage);
  const threshold = maxAllowedLoss.add(totalFeeUsd);

  const isLiquidated = effectiveCollateralUsd.lt(threshold);

  // Distance to liquidation
  const distanceToLiquidationUsd = effectiveCollateralUsd.sub(threshold);

  // Price change percentage
  const priceChangePercent = hypotheticalPrice
    .sub(currentPrice)
    .mul(new BN(10000))
    .div(currentPrice)
    .toNumber() / 100;

  return {
    priceUsd: hypotheticalPrice.toString(),
    priceFormatted: BNToUSDRepresentation(hypotheticalPrice, USDC_DECIMALS),
    priceChangePercent: priceChangePercent.toFixed(2) + "%",
    pnlUsd: (hasProfit ? pnl : pnl.neg()).toString(),
    pnlFormatted: (hasProfit ? "+" : "-") + BNToUSDRepresentation(pnl, USDC_DECIMALS),
    hasProfit,
    effectiveCollateralUsd: effectiveCollateralUsd.toString(),
    effectiveCollateralFormatted: BNToUSDRepresentation(effectiveCollateralUsd, USDC_DECIMALS),
    marginLevelBps: marginLevelBps.toString(),
    marginLevelPercent: (marginLevelBps.toNumber() / 100).toFixed(2) + "%",
    isLiquidated,
    distanceToLiquidationUsd: distanceToLiquidationUsd.toString(),
    distanceToLiquidationFormatted: (distanceToLiquidationUsd.gtn(0) ? "+" : "") +
      BNToUSDRepresentation(distanceToLiquidationUsd.abs(), USDC_DECIMALS),
  };
}

// Main function to analyze liquidation scenarios
export async function analyzeLiquidationScenarios(
  positionPubkey: string,
  options: ScenarioOptions = {}
): Promise<ScenarioAnalysisResult> {
  const program = getPerpetualsProgram();
  const position = await program.account.position.fetch(new PublicKey(positionPubkey));

  if (position.sizeUsd.eqn(0)) {
    throw new Error("Position is closed (sizeUsd = 0)");
  }

  const custody = await getCustodyData(position.custody.toString());
  const collateralCustody = await getCustodyData(position.collateralCustody.toString());

  // Get current price
  const oraclePrice = await getOraclePriceForCustody(position.custody.toString());
  if (!oraclePrice) {
    throw new Error("Failed to fetch current oracle price");
  }
  const currentPrice = oraclePrice.price;

  // Calculate liquidation price
  const liquidationPrice = calculateLiquidationPriceInternal(position, custody, collateralCustody);

  // Determine scenarios to analyze
  const isLong = position.side.long !== undefined;
  let pricesToAnalyze: BN[] = [];

  if (options.priceScenarios && options.priceScenarios.length > 0) {
    // Use specific prices provided
    pricesToAnalyze = options.priceScenarios.map((p) => new BN(Math.round(p * 1_000_000)));
  } else {
    // Use percentage scenarios
    const percentages = options.percentageScenarios && options.percentageScenarios.length > 0
      ? options.percentageScenarios
      : getDefaultPercentageScenarios(isLong);

    pricesToAnalyze = percentages.map((pct) => {
      const multiplier = new BN(10000 + pct * 100);
      return currentPrice.mul(multiplier).div(new BN(10000));
    });
  }

  // Sort prices
  pricesToAnalyze.sort((a, b) => a.cmp(b));

  // Analyze each scenario
  const scenarios = pricesToAnalyze.map((price) =>
    analyzeAtPrice(position, custody, collateralCustody, price, currentPrice)
  );

  // Calculate safety buffer
  const percentToLiquidation = isLong
    ? currentPrice.sub(liquidationPrice).mul(new BN(10000)).div(currentPrice).toNumber() / 100
    : liquidationPrice.sub(currentPrice).mul(new BN(10000)).div(currentPrice).toNumber() / 100;

  const priceMovementToLiquidation = currentPrice.sub(liquidationPrice).abs();

  // Current margin level
  const currentMarginLevelBps = position.collateralUsd.mul(BPS_POWER).div(position.sizeUsd);
  const minMarginLevelBps = BPS_POWER.mul(BPS_POWER).div(custody.pricing.maxLeverage);

  // Calculate leverage
  const leverage = position.sizeUsd.mul(new BN(100)).div(position.collateralUsd).toNumber() / 100;

  return {
    positionPubkey,
    position: {
      owner: position.owner.toString(),
      custody: position.custody.toString(),
      collateralCustody: position.collateralCustody.toString(),
      side: formatSide(position.side),
      sizeUsd: BNToUSDRepresentation(position.sizeUsd, USDC_DECIMALS),
      collateralUsd: BNToUSDRepresentation(position.collateralUsd, USDC_DECIMALS),
      entryPrice: BNToUSDRepresentation(position.price, USDC_DECIMALS),
      leverage: leverage.toFixed(2) + "x",
    },
    currentPrice: currentPrice.toString(),
    currentPriceFormatted: BNToUSDRepresentation(currentPrice, USDC_DECIMALS),
    liquidationPrice: liquidationPrice.toString(),
    liquidationPriceFormatted: BNToUSDRepresentation(liquidationPrice, USDC_DECIMALS),
    scenarios,
    safetyBuffer: {
      percentToLiquidation: percentToLiquidation.toFixed(2) + "%",
      priceMovementToLiquidation: BNToUSDRepresentation(priceMovementToLiquidation, USDC_DECIMALS),
      currentMarginLevel: (currentMarginLevelBps.toNumber() / 100).toFixed(2) + "%",
      minMarginLevel: (minMarginLevelBps.toNumber() / 100).toFixed(2) + "%",
    },
  };
}
