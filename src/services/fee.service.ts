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
