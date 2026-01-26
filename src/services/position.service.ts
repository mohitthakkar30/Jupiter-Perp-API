import { BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3";
import type { IdlAccounts } from "@coral-xyz/anchor";
import type { Perpetuals } from "../idl/jupiter-perpetuals-idl";
import { getPerpetualsProgram, getConnection } from "../utils/solana";
import {
  JUPITER_PERPETUALS_PROGRAM_ID,
  BPS_POWER,
  RATE_POWER,
  USDC_DECIMALS,
} from "../constants/index";
import { divCeil } from "../utils/math";
import { BNToUSDRepresentation, formatSide } from "../utils/formatting";
import { getOraclePriceForCustody } from "./oracle.service";
import { getCustodyData } from "./custody.service";
import type {
  Position,
  PositionResponse,
  PnlResponse,
  LiquidationPriceResponse,
} from "../types/index";

export async function getPositionData(positionPubkey: string): Promise<Position> {
  const program = getPerpetualsProgram();
  return program.account.position.fetch(new PublicKey(positionPubkey));
}

export async function getAllOpenPositions(): Promise<PositionResponse[]> {
  const program = getPerpetualsProgram();
  const connection = getConnection();

  const gpaResult = await connection.getProgramAccounts(program.programId, {
    commitment: "confirmed",
    filters: [{ memcmp: program.coder.accounts.memcmp("position") }],
  });

  const positions = gpaResult.map((item) => ({
    publicKey: item.pubkey,
    account: program.coder.accounts.decode(
      "position",
      item.account.data
    ) as IdlAccounts<Perpetuals>["position"],
  }));

  // Filter for open positions (sizeUsd > 0)
  const openPositions = positions.filter((p) => p.account.sizeUsd.gtn(0));

  return openPositions.map((p) => formatPositionResponse(p.publicKey.toString(), p.account));
}

export async function getPositionsForWallet(
  walletAddress: string
): Promise<PositionResponse[]> {
  const program = getPerpetualsProgram();
  const connection = getConnection();

  const gpaResult = await connection.getProgramAccounts(program.programId, {
    commitment: "confirmed",
    filters: [
      {
        memcmp: {
          bytes: new PublicKey(walletAddress).toBase58(),
          offset: 8, // owner field offset
        },
      },
      { memcmp: program.coder.accounts.memcmp("position") },
    ],
  });

  const positions = gpaResult.map((item) => ({
    publicKey: item.pubkey,
    account: program.coder.accounts.decode(
      "position",
      item.account.data
    ) as IdlAccounts<Perpetuals>["position"],
  }));

  // Filter for open positions
  const openPositions = positions.filter((p) => p.account.sizeUsd.gtn(0));

  return openPositions.map((p) => formatPositionResponse(p.publicKey.toString(), p.account));
}

export async function getPositionByPubkey(
  positionPubkey: string
): Promise<PositionResponse | null> {
  try {
    const position = await getPositionData(positionPubkey);
    return formatPositionResponse(positionPubkey, position);
  } catch {
    return null;
  }
}

function formatPositionResponse(publicKey: string, position: Position): PositionResponse {
  return {
    publicKey,
    owner: position.owner.toString(),
    pool: position.pool.toString(),
    custody: position.custody.toString(),
    collateralCustody: position.collateralCustody.toString(),
    openTime: position.openTime.toNumber(),
    updateTime: position.updateTime.toNumber(),
    side: formatSide(position.side),
    price: position.price.toString(),
    sizeUsd: position.sizeUsd.toString(),
    collateralUsd: position.collateralUsd.toString(),
    realisedPnlUsd: position.realisedPnlUsd.toString(),
    lockedAmount: position.lockedAmount.toString(),
  };
}

// Calculate position PnL
export async function calculatePositionPnl(
  positionPubkey: string,
  currentPrice?: BN
): Promise<PnlResponse> {
  const position = await getPositionData(positionPubkey);

  // If no current price provided, fetch from oracle
  if (!currentPrice) {
    const oraclePrice = await getOraclePriceForCustody(position.custody.toString());
    if (!oraclePrice) {
      throw new Error("Failed to fetch oracle price");
    }
    currentPrice = oraclePrice.price;
  }

  const hasProfit = position.side.long
    ? currentPrice.gt(position.price)
    : position.price.gt(currentPrice);

  const priceDelta = currentPrice.sub(position.price).abs();
  const pnl = position.sizeUsd.mul(priceDelta).div(position.price);

  return {
    positionPubkey,
    pnlUsd: BNToUSDRepresentation(hasProfit ? pnl : pnl.neg(), USDC_DECIMALS),
    hasProfit,
    entryPrice: BNToUSDRepresentation(position.price, USDC_DECIMALS),
    currentPrice: BNToUSDRepresentation(currentPrice, USDC_DECIMALS),
    sizeUsd: BNToUSDRepresentation(position.sizeUsd, USDC_DECIMALS),
  };
}

// Calculate liquidation price
export async function calculateLiquidationPrice(
  positionPubkey: string
): Promise<LiquidationPriceResponse> {
  const position = await getPositionData(positionPubkey);
  const custody = await getCustodyData(position.custody.toString());
  const collateralCustody = await getCustodyData(position.collateralCustody.toString());

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

  const totalFeeUsd = closeFeeUsd.add(borrowFeeUsd);

  // Max loss calculation
  const maxLossUsd = position.sizeUsd
    .mul(BPS_POWER)
    .div(custody.pricing.maxLeverage)
    .add(totalFeeUsd);

  const marginUsd = position.collateralUsd;

  let maxPriceDiff = maxLossUsd.sub(marginUsd).abs();
  maxPriceDiff = maxPriceDiff.mul(position.price).div(position.sizeUsd);

  let liquidationPrice: BN;

  if (position.side.long) {
    if (maxLossUsd.gt(marginUsd)) {
      liquidationPrice = position.price.add(maxPriceDiff);
    } else {
      liquidationPrice = position.price.sub(maxPriceDiff);
    }
  } else {
    if (maxLossUsd.gt(marginUsd)) {
      liquidationPrice = position.price.sub(maxPriceDiff);
    } else {
      liquidationPrice = position.price.add(maxPriceDiff);
    }
  }

  // Get current price
  const oraclePrice = await getOraclePriceForCustody(position.custody.toString());

  return {
    positionPubkey,
    liquidationPrice: BNToUSDRepresentation(liquidationPrice, USDC_DECIMALS),
    currentPrice: oraclePrice
      ? BNToUSDRepresentation(oraclePrice.price, USDC_DECIMALS)
      : "N/A",
    marginUsd: BNToUSDRepresentation(marginUsd, USDC_DECIMALS),
    maxLossUsd: BNToUSDRepresentation(maxLossUsd, USDC_DECIMALS),
  };
}

// Calculate borrow fee for a position
export async function calculateBorrowFee(
  positionPubkey: string
): Promise<{ borrowFeeUsd: string }> {
  const position = await getPositionData(positionPubkey);
  const collateralCustody = await getCustodyData(position.collateralCustody.toString());

  if (position.sizeUsd.eqn(0)) {
    return { borrowFeeUsd: "0" };
  }

  const currentTime = new BN(Math.floor(Date.now() / 1000));
  const interval = currentTime.sub(collateralCustody.fundingRateState.lastUpdate);

  // Calculate current funding rate
  const hourlyRate = getHourlyBorrowRate(collateralCustody);
  const currentFundingRate = divCeil(hourlyRate.mul(interval), new BN(3600));

  const cumulativeInterest =
    collateralCustody.fundingRateState.cumulativeInterestRate.add(currentFundingRate);

  const positionInterest = cumulativeInterest.sub(position.cumulativeInterestSnapshot);
  const borrowFee = divCeil(positionInterest.mul(position.sizeUsd), RATE_POWER);

  return {
    borrowFeeUsd: BNToUSDRepresentation(borrowFee, USDC_DECIMALS),
  };
}

function getHourlyBorrowRate(custody: any): BN {
  const DBPS_POWER = new BN(100_000);
  const owned = custody.assets.owned;
  const locked = custody.assets.locked;

  if (owned.eqn(0) || locked.eqn(0)) {
    return new BN(0);
  }

  const hourlyFundingRate = custody.fundingRateState.hourlyFundingDbps
    .mul(RATE_POWER)
    .div(DBPS_POWER);

  return divCeil(locked.mul(hourlyFundingRate), owned);
}
