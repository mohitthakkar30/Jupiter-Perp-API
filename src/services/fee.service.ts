import { BN } from "@coral-xyz/anchor";
import { getPerpetualsProgram } from "../utils/solana";
import { BPS_POWER, USDC_DECIMALS, TOKEN_TO_CUSTODY } from "../constants";
import { divCeil, getAssetAmountUsd, checkedDecimalMul } from "../utils/math";
import { BNToUSDRepresentation } from "../utils/formatting";
import { getCustodyData } from "./custody.service";
import { getPoolData, getFeeBps, collectSwapFees } from "./pool.service";
import { getOraclePriceForCustody, getOraclePrices } from "./oracle.service";
import type { Custody, Pool, OraclePrice } from "../types";

const ORACLE_EXPONENT_SCALE = -9;
const ORACLE_PRICE_SCALE = new BN(1_000_000_000);

// Get base open/close position fees for all custodies
export async function getOpenCloseBaseFees(): Promise<{
  custodies: {
    name: string;
    custody: string;
    openFeeBps: string;
    closeFeeBps: string;
  }[];
}> {
  const program = getPerpetualsProgram();
  const custodies = await program.account.custody.all();

  return {
    custodies: custodies.map((c) => ({
      name: c.account.mint.toString(),
      custody: c.publicKey.toString(),
      openFeeBps: c.account.increasePositionBps.toString(),
      closeFeeBps: c.account.decreasePositionBps.toString(),
    })),
  };
}

// Get open position fee for a specific custody
export async function getOpenFeeForCustody(
  custodyOrToken: string,
  tradeSizeUsd: string
): Promise<{
  baseFeeBps: string;
  feeUsd: string;
  feeUsdFormatted: string;
}> {
  const custodyPubkey = TOKEN_TO_CUSTODY[custodyOrToken.toUpperCase()] || custodyOrToken;
  const custody = await getCustodyData(custodyPubkey);

  const tradeSizeBN = new BN(tradeSizeUsd);
  const baseFeeBps = custody.increasePositionBps;
  const feeUsd = tradeSizeBN.mul(baseFeeBps).div(BPS_POWER);

  return {
    baseFeeBps: baseFeeBps.toString(),
    feeUsd: feeUsd.toString(),
    feeUsdFormatted: BNToUSDRepresentation(feeUsd, USDC_DECIMALS),
  };
}

// Get close position fee for a specific custody
export async function getCloseFeeForCustody(
  custodyOrToken: string,
  tradeSizeUsd: string
): Promise<{
  baseFeeBps: string;
  feeUsd: string;
  feeUsdFormatted: string;
}> {
  const custodyPubkey = TOKEN_TO_CUSTODY[custodyOrToken.toUpperCase()] || custodyOrToken;
  const custody = await getCustodyData(custodyPubkey);

  const tradeSizeBN = new BN(tradeSizeUsd);
  const baseFeeBps = custody.decreasePositionBps;
  const feeUsd = tradeSizeBN.mul(baseFeeBps).div(BPS_POWER);

  return {
    baseFeeBps: baseFeeBps.toString(),
    feeUsd: feeUsd.toString(),
    feeUsdFormatted: BNToUSDRepresentation(feeUsd, USDC_DECIMALS),
  };
}

// Calculate price impact fee
export function getLinearPriceImpactFeeBps(
  tradeSizeUsd: BN,
  tradeImpactFeeScalar: BN
): BN {
  return tradeImpactFeeScalar.eqn(0)
    ? new BN(0)
    : divCeil(tradeSizeUsd.mul(BPS_POWER), tradeImpactFeeScalar);
}

// Get price impact fee for a trade
export async function calculatePriceImpactFee(
  custodyOrToken: string,
  tradeSizeUsd: string,
  isIncrease: boolean
): Promise<{
  linearImpactFeeBps: string;
  totalFeeBps: string;
  feeUsd: string;
  feeUsdFormatted: string;
}> {
  const custodyPubkey = TOKEN_TO_CUSTODY[custodyOrToken.toUpperCase()] || custodyOrToken;
  const custody = await getCustodyData(custodyPubkey);

  const tradeSizeBN = new BN(tradeSizeUsd);
  const baseFeeBps = isIncrease ? custody.increasePositionBps : custody.decreasePositionBps;

  const linearImpactFeeBps = getLinearPriceImpactFeeBps(
    tradeSizeBN,
    custody.pricing.tradeImpactFeeScalar
  );

  const totalFeeBps = linearImpactFeeBps.add(baseFeeBps);
  const feeUsd = divCeil(tradeSizeBN.mul(totalFeeBps), BPS_POWER);

  return {
    linearImpactFeeBps: linearImpactFeeBps.toString(),
    totalFeeBps: totalFeeBps.toString(),
    feeUsd: feeUsd.toString(),
    feeUsdFormatted: BNToUSDRepresentation(feeUsd, USDC_DECIMALS),
  };
}

// Calculate swap price between two tokens
function getSwapPrice(
  tokenInPrice: OraclePrice,
  tokenOutPrice: OraclePrice
): OraclePrice {
  return {
    price: tokenInPrice.price.mul(ORACLE_PRICE_SCALE).div(tokenOutPrice.price),
    exponent: tokenInPrice.exponent + ORACLE_EXPONENT_SCALE - tokenOutPrice.exponent,
  };
}

// Calculate swap amount (before fees)
function getSwapAmount(
  tokenInPrice: OraclePrice,
  tokenOutPrice: OraclePrice,
  custodyIn: Custody,
  custodyOut: Custody,
  amountIn: BN
): BN {
  const swapPrice = getSwapPrice(tokenInPrice, tokenOutPrice);

  return checkedDecimalMul(
    amountIn,
    -custodyIn.decimals,
    swapPrice.price,
    swapPrice.exponent,
    -custodyOut.decimals
  );
}

// Get swap fee BPS
export function getSwapFeeBps({
  custodyIn,
  custodyOut,
  tokenPriceIn,
  tokenPriceOut,
  pool,
  swapUsdAmount,
}: {
  custodyIn: Custody;
  custodyOut: Custody;
  tokenPriceIn: OraclePrice;
  tokenPriceOut: OraclePrice;
  pool: Pool;
  swapUsdAmount: BN;
}): BN {
  let baseFeeBps: BN;
  let taxFeeBps: BN;
  let multiplier: BN;

  const isStableSwap = custodyIn.isStable && custodyOut.isStable;

  if (isStableSwap) {
    baseFeeBps = pool.fees.stableSwapBps;
    taxFeeBps = pool.fees.stableSwapTaxBps;
    multiplier = pool.fees.stableSwapMultiplier;
  } else {
    baseFeeBps = pool.fees.swapBps;
    taxFeeBps = pool.fees.taxBps;
    multiplier = pool.fees.swapMultiplier;
  }

  const inputFeeBps = getFeeBps({
    custody: custodyIn,
    sizeUsdDelta: swapUsdAmount,
    baseFeeBps,
    taxFeeBps,
    multiplier,
    increment: true,
    pool,
    tokenPrice: tokenPriceIn,
  });

  const outputFeeBps = getFeeBps({
    custody: custodyOut,
    sizeUsdDelta: swapUsdAmount,
    baseFeeBps,
    taxFeeBps,
    multiplier,
    increment: false,
    pool,
    tokenPrice: tokenPriceOut,
  });

  return BN.max(inputFeeBps, outputFeeBps);
}

// Calculate swap fee and output amount
export async function calculateSwapFee(params: {
  inputToken: string;
  outputToken: string;
  amountIn: string;
}): Promise<{
  feeBps: string;
  feePercentage: string;
  amountIn: string;
  amountOut: string;
  amountOutAfterFees: string;
  inputToken: string;
  outputToken: string;
}> {
  const { inputToken, outputToken, amountIn } = params;

  const inputCustodyPubkey = TOKEN_TO_CUSTODY[inputToken.toUpperCase()];
  const outputCustodyPubkey = TOKEN_TO_CUSTODY[outputToken.toUpperCase()];

  if (!inputCustodyPubkey || !outputCustodyPubkey) {
    throw new Error(`Invalid token: ${inputToken} or ${outputToken}`);
  }

  const [custodyIn, custodyOut, pool, oraclePrices] = await Promise.all([
    getCustodyData(inputCustodyPubkey),
    getCustodyData(outputCustodyPubkey),
    getPoolData(),
    getOraclePrices(),
  ]);

  const inputPriceData = oraclePrices[inputCustodyPubkey];
  const outputPriceData = oraclePrices[outputCustodyPubkey];

  if (!inputPriceData || !outputPriceData) {
    throw new Error("Failed to fetch oracle prices");
  }

  const tokenPriceIn: OraclePrice = {
    price: inputPriceData.price,
    exponent: inputPriceData.expo,
  };
  const tokenPriceOut: OraclePrice = {
    price: outputPriceData.price,
    exponent: outputPriceData.expo,
  };

  const amountInBN = new BN(amountIn);

  // Calculate swap amount before fees
  const amountOut = getSwapAmount(
    tokenPriceIn,
    tokenPriceOut,
    custodyIn,
    custodyOut,
    amountInBN
  );

  // Calculate USD value of swap
  const swapUsdAmount = getAssetAmountUsd(
    tokenPriceIn,
    amountInBN,
    custodyIn.decimals
  );

  // Calculate fee
  const feeBps = getSwapFeeBps({
    custodyIn,
    custodyOut,
    tokenPriceIn,
    tokenPriceOut,
    pool,
    swapUsdAmount,
  });

  // Apply fees
  const amountOutAfterFees = collectSwapFees({
    tokenAmount: amountOut,
    feeBps,
  });

  return {
    feeBps: feeBps.toString(),
    feePercentage: (feeBps.toNumber() / 100).toFixed(2),
    amountIn,
    amountOut: amountOut.toString(),
    amountOutAfterFees: amountOutAfterFees.toString(),
    inputToken: inputToken.toUpperCase(),
    outputToken: outputToken.toUpperCase(),
  };
}

// ===== ADVANCED PRICE IMPACT WITH DELTA IMBALANCE =====

export enum TradePoolType {
  Increase = "Increase",
  Decrease = "Decrease",
}

// Calculate base fee in USD
export function getBaseFeeUsd(baseFeeBps: BN, amount: BN): BN {
  if (amount.eqn(0)) {
    return new BN(0);
  }
  return amount.mul(baseFeeBps).div(BPS_POWER);
}

// Calculate delta imbalance from 60-second rolling window
export function calculateDeltaImbalance(
  priceImpactBuffer: {
    openInterest: BN[];
    lastUpdated: BN;
    feeFactor: BN;
    maxFeeBps: BN;
    exponent: number;
    deltaImbalanceThresholdDecimal: BN;
  },
  currentTime: number,
  newOpenInterest: BN,
  tradeType: TradePoolType
): BN {
  const currentIdx = currentTime % 60;
  const lastUpdatedIdx = priceImpactBuffer.lastUpdated.toNumber() % 60;

  const amount =
    tradeType === TradePoolType.Increase
      ? newOpenInterest
      : newOpenInterest.neg();

  const updatedOpenInterest = [...priceImpactBuffer.openInterest];

  // No values OR more than 1 minute
  if (
    priceImpactBuffer.lastUpdated.lten(0) ||
    new BN(currentTime).sub(priceImpactBuffer.lastUpdated).gten(60)
  ) {
    return amount;
  }

  if (lastUpdatedIdx === currentIdx) {
    updatedOpenInterest[currentIdx] = updatedOpenInterest[currentIdx].add(amount);
  } else {
    updatedOpenInterest[currentIdx] = amount;
  }

  // Set outdated values to 0
  if (currentIdx > lastUpdatedIdx) {
    // Clean from last_updated_idx+1 to current_idx
    for (let i = lastUpdatedIdx + 1; i < currentIdx; i++) {
      updatedOpenInterest[i] = new BN(0);
    }
  } else if (currentIdx < lastUpdatedIdx) {
    // Clean from last_updated_idx+1 to end
    for (let i = lastUpdatedIdx + 1; i < updatedOpenInterest.length; i++) {
      updatedOpenInterest[i] = new BN(0);
    }
    // Clean from start to current_idx
    for (let i = 0; i < currentIdx; i++) {
      updatedOpenInterest[i] = new BN(0);
    }
  }

  // Calculate the sum of all values in the array
  return updatedOpenInterest.reduce((acc, val) => acc.add(val), new BN(0));
}

// Advanced price impact fee with delta imbalance
export function getAdvancedPriceImpactFeeBps(
  baseFeeBps: BN,
  amount: BN,
  tradePoolType: TradePoolType,
  custody: Custody,
  curtime: BN
): {
  positionFeeUsd: BN;
  priceImpactFeeUsd: BN;
  baseFeeUsd: BN;
  linearImpactFeeUsd: BN;
  deltaImbalanceFeeUsd: BN;
  totalFeeBps: BN;
  isCapped: boolean;
} {
  if (amount.eqn(0)) {
    return {
      positionFeeUsd: new BN(0),
      priceImpactFeeUsd: new BN(0),
      baseFeeUsd: new BN(0),
      linearImpactFeeUsd: new BN(0),
      deltaImbalanceFeeUsd: new BN(0),
      totalFeeBps: new BN(0),
      isCapped: false,
    };
  }

  const priceImpactBuffer = custody.priceImpactBuffer;
  const linearImpactFeeCoefficientBps = getLinearPriceImpactFeeBps(
    amount,
    custody.pricing.tradeImpactFeeScalar
  );
  const totalBaseFeeBps = linearImpactFeeCoefficientBps.add(baseFeeBps);
  const linearImpactFeeUsd = divCeil(
    amount.mul(linearImpactFeeCoefficientBps),
    BPS_POWER
  );
  const baseFeeUsd = getBaseFeeUsd(baseFeeBps, amount);
  let positionFeeUsd = divCeil(amount.mul(totalBaseFeeBps), BPS_POWER);

  // If no delta imbalance tracking, return simple calculation
  if (!priceImpactBuffer || priceImpactBuffer.feeFactor.eq(new BN(0))) {
    return {
      positionFeeUsd,
      priceImpactFeeUsd: linearImpactFeeUsd,
      baseFeeUsd,
      linearImpactFeeUsd,
      deltaImbalanceFeeUsd: new BN(0),
      totalFeeBps: totalBaseFeeBps,
      isCapped: false,
    };
  }

  const deltaImbalanceDecimal = calculateDeltaImbalance(
    priceImpactBuffer,
    curtime.toNumber(),
    amount,
    tradePoolType
  ).abs();

  // If delta imbalance is below threshold, return simple calculation
  if (deltaImbalanceDecimal.lte(priceImpactBuffer.deltaImbalanceThresholdDecimal)) {
    return {
      positionFeeUsd,
      priceImpactFeeUsd: linearImpactFeeUsd,
      baseFeeUsd,
      linearImpactFeeUsd,
      deltaImbalanceFeeUsd: new BN(0),
      totalFeeBps: totalBaseFeeBps,
      isCapped: false,
    };
  }

  // Calculate delta imbalance fee using exponent scaling
  // Simplified calculation without Decimal library
  const ratio = deltaImbalanceDecimal
    .mul(new BN(10000))
    .div(priceImpactBuffer.deltaImbalanceThresholdDecimal);

  // Apply exponent (simplified - using square for exponent=2)
  let deltaImbalanceAmount: BN;
  if (priceImpactBuffer.exponent === 2) {
    deltaImbalanceAmount = ratio.mul(ratio).div(new BN(10000));
  } else {
    deltaImbalanceAmount = ratio;
  }

  const priceImpactFeeBps = divCeil(
    deltaImbalanceAmount,
    priceImpactBuffer.feeFactor
  );
  const totalFeeBps = totalBaseFeeBps.add(priceImpactFeeBps);
  const isCapped = totalFeeBps.gt(priceImpactBuffer.maxFeeBps);
  const cappedTotalFeeBps = BN.min(totalFeeBps, priceImpactBuffer.maxFeeBps);

  positionFeeUsd = divCeil(amount.mul(cappedTotalFeeBps), BPS_POWER);
  const deltaImbalanceFeeUsd = positionFeeUsd.sub(baseFeeUsd).sub(linearImpactFeeUsd);

  return {
    positionFeeUsd,
    priceImpactFeeUsd: positionFeeUsd.sub(baseFeeUsd),
    baseFeeUsd,
    linearImpactFeeUsd,
    deltaImbalanceFeeUsd: BN.max(deltaImbalanceFeeUsd, new BN(0)),
    totalFeeBps: cappedTotalFeeBps,
    isCapped,
  };
}

// Detailed price impact fee breakdown
export async function calculateDetailedPriceImpact(
  custodyOrToken: string,
  tradeSizeUsd: string,
  tradeType: "increase" | "decrease"
): Promise<{
  baseFeeUsd: string;
  baseFeeFormatted: string;
  linearImpactFeeUsd: string;
  linearImpactFormatted: string;
  deltaImbalanceFeeUsd: string;
  deltaImbalanceFormatted: string;
  totalFeeUsd: string;
  totalFeeFormatted: string;
  totalFeeBps: string;
  isCapped: boolean;
  maxFeeBps: string;
  breakdown: {
    baseFeePercentage: string;
    linearImpactPercentage: string;
    deltaImbalancePercentage: string;
    totalPercentage: string;
  };
}> {
  const custodyPubkey = TOKEN_TO_CUSTODY[custodyOrToken.toUpperCase()] || custodyOrToken;
  const custody = await getCustodyData(custodyPubkey);

  const tradeSizeBN = new BN(tradeSizeUsd);
  const tradePoolType =
    tradeType === "increase" ? TradePoolType.Increase : TradePoolType.Decrease;
  const baseFeeBps =
    tradeType === "increase"
      ? custody.increasePositionBps
      : custody.decreasePositionBps;

  const curtime = new BN(Math.floor(Date.now() / 1000));

  const result = getAdvancedPriceImpactFeeBps(
    baseFeeBps,
    tradeSizeBN,
    tradePoolType,
    custody,
    curtime
  );

  const maxFeeBps = custody.priceImpactBuffer?.maxFeeBps || new BN(500);

  // Calculate percentages
  const baseFeePercentage = (baseFeeBps.toNumber() / 100).toFixed(4);
  const linearImpactBps = result.linearImpactFeeUsd
    .mul(BPS_POWER)
    .div(tradeSizeBN.eqn(0) ? new BN(1) : tradeSizeBN);
  const linearImpactPercentage = (linearImpactBps.toNumber() / 100).toFixed(4);
  const deltaImbalanceBps = result.deltaImbalanceFeeUsd
    .mul(BPS_POWER)
    .div(tradeSizeBN.eqn(0) ? new BN(1) : tradeSizeBN);
  const deltaImbalancePercentage = (deltaImbalanceBps.toNumber() / 100).toFixed(4);
  const totalPercentage = (result.totalFeeBps.toNumber() / 100).toFixed(4);

  return {
    baseFeeUsd: result.baseFeeUsd.toString(),
    baseFeeFormatted: BNToUSDRepresentation(result.baseFeeUsd, USDC_DECIMALS),
    linearImpactFeeUsd: result.linearImpactFeeUsd.toString(),
    linearImpactFormatted: BNToUSDRepresentation(result.linearImpactFeeUsd, USDC_DECIMALS),
    deltaImbalanceFeeUsd: result.deltaImbalanceFeeUsd.toString(),
    deltaImbalanceFormatted: BNToUSDRepresentation(result.deltaImbalanceFeeUsd, USDC_DECIMALS),
    totalFeeUsd: result.positionFeeUsd.toString(),
    totalFeeFormatted: BNToUSDRepresentation(result.positionFeeUsd, USDC_DECIMALS),
    totalFeeBps: result.totalFeeBps.toString(),
    isCapped: result.isCapped,
    maxFeeBps: maxFeeBps.toString(),
    breakdown: {
      baseFeePercentage: `${baseFeePercentage}%`,
      linearImpactPercentage: `${linearImpactPercentage}%`,
      deltaImbalancePercentage: `${deltaImbalancePercentage}%`,
      totalPercentage: `${totalPercentage}%`,
    },
  };
}
