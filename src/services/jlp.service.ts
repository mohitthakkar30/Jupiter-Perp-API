import { BN } from "@coral-xyz/anchor";
import { getMint } from "@solana/spl-token";
import { getPerpetualsProgram, getConnection } from "../utils/solana";
import {
  JLP_POOL_ACCOUNT_PUBKEY,
  JLP_MINT_PUBKEY,
  USDC_DECIMALS,
  BPS_POWER,
  TOKEN_TO_CUSTODY,
  CUSTODY_DETAILS,
} from "../constants";
import { getAssetAmountUsd, checkedDecimalDiv } from "../utils/math";
import { BNToUSDRepresentation } from "../utils/formatting";
import { getPoolData, getFeeBps, collectSwapFees } from "./pool.service";
import { getCustodyData } from "./custody.service";
import { getOraclePriceForCustody } from "./oracle.service";
import type { Pool, Custody, OraclePrice } from "../types";

// Get add liquidity (mint JLP) fee
export function getAddLiquidityFeeBps({
  pool,
  custody,
  usdDelta,
  tokenPrice,
}: {
  pool: Pool;
  custody: Custody;
  usdDelta: BN;
  tokenPrice: OraclePrice;
}): BN {
  return getFeeBps({
    custody,
    sizeUsdDelta: usdDelta,
    baseFeeBps: pool.fees.addRemoveLiquidityBps,
    taxFeeBps: pool.fees.taxBps,
    multiplier: pool.fees.swapMultiplier,
    increment: true,
    pool,
    tokenPrice,
  });
}

// Get remove liquidity (burn JLP) fee
export function getRemoveLiquidityFeeBps({
  pool,
  custody,
  usdDelta,
  tokenPrice,
}: {
  pool: Pool;
  custody: Custody;
  usdDelta: BN;
  tokenPrice: OraclePrice;
}): BN {
  return getFeeBps({
    custody,
    sizeUsdDelta: usdDelta,
    baseFeeBps: pool.fees.addRemoveLiquidityBps,
    taxFeeBps: pool.fees.taxBps,
    multiplier: pool.fees.swapMultiplier,
    increment: false,
    pool,
    tokenPrice,
  });
}

// Calculate JLP tokens received for depositing liquidity
export async function calculateMintJlp(params: {
  inputToken: string;
  inputAmount: string;
}): Promise<{
  inputAmount: string;
  inputToken: string;
  inputAmountUsd: string;
  mintFeeBps: string;
  mintFeePercentage: string;
  depositAmountAfterFee: string;
  jlpMintAmount: string;
  jlpMintAmountUsd: string;
}> {
  const { inputToken, inputAmount } = params;

  const custodyPubkey = TOKEN_TO_CUSTODY[inputToken.toUpperCase()];
  if (!custodyPubkey) {
    throw new Error(`Invalid token: ${inputToken}`);
  }

  const [pool, custody, oraclePrice, connection] = await Promise.all([
    getPoolData(),
    getCustodyData(custodyPubkey),
    getOraclePriceForCustody(custodyPubkey),
    getConnection(),
  ]);

  if (!oraclePrice) {
    throw new Error("Failed to fetch oracle price");
  }

  const jlpMint = await getMint(connection, JLP_MINT_PUBKEY, "confirmed");
  const inputAmountBN = new BN(inputAmount);

  // Calculate USD value of input
  const inputAmountUsd = getAssetAmountUsd(oraclePrice, inputAmountBN, custody.decimals);

  // Calculate mint fee
  const mintFeeBps = getAddLiquidityFeeBps({
    pool,
    custody,
    usdDelta: inputAmountUsd,
    tokenPrice: oraclePrice,
  });

  // Apply fee
  const depositAmountAfterFee = collectSwapFees({
    tokenAmount: inputAmountBN,
    feeBps: mintFeeBps,
  });

  // Calculate USD value after fee
  const mintAmountUsd = getAssetAmountUsd(oraclePrice, depositAmountAfterFee, custody.decimals);

  // Calculate JLP tokens: mintAmountUsd * totalSupply / aumUsd
  const jlpTotalSupply = new BN(jlpMint.supply.toString());
  const aumUsd = new BN(pool.aumUsd.toString());

  const jlpMintAmount = aumUsd.gtn(0)
    ? mintAmountUsd.mul(jlpTotalSupply).div(aumUsd)
    : new BN(0);

  return {
    inputAmount,
    inputToken: inputToken.toUpperCase(),
    inputAmountUsd: inputAmountUsd.toString(),
    mintFeeBps: mintFeeBps.toString(),
    mintFeePercentage: (mintFeeBps.toNumber() / 100).toFixed(2),
    depositAmountAfterFee: depositAmountAfterFee.toString(),
    jlpMintAmount: jlpMintAmount.toString(),
    jlpMintAmountUsd: BNToUSDRepresentation(mintAmountUsd, USDC_DECIMALS),
  };
}

// Calculate tokens received for burning JLP
export async function calculateBurnJlp(params: {
  outputToken: string;
  jlpAmount: string;
}): Promise<{
  jlpBurnAmount: string;
  outputToken: string;
  burnAmountUsd: string;
  burnFeeBps: string;
  burnFeePercentage: string;
  outputAmount: string;
  outputAmountAfterFees: string;
}> {
  const { outputToken, jlpAmount } = params;

  const custodyPubkey = TOKEN_TO_CUSTODY[outputToken.toUpperCase()];
  if (!custodyPubkey) {
    throw new Error(`Invalid token: ${outputToken}`);
  }

  const [pool, custody, oraclePrice, connection] = await Promise.all([
    getPoolData(),
    getCustodyData(custodyPubkey),
    getOraclePriceForCustody(custodyPubkey),
    getConnection(),
  ]);

  if (!oraclePrice) {
    throw new Error("Failed to fetch oracle price");
  }

  const jlpMint = await getMint(connection, JLP_MINT_PUBKEY, "confirmed");
  const jlpBurnAmountBN = new BN(jlpAmount);

  // Calculate USD value of JLP being burned
  const jlpTotalSupply = new BN(jlpMint.supply.toString());
  const aumUsd = new BN(pool.aumUsd.toString());

  const burnAmountUsd = jlpTotalSupply.gtn(0)
    ? aumUsd.mul(jlpBurnAmountBN).div(jlpTotalSupply)
    : new BN(0);

  // Convert USD to token amount
  const outputAmount = oraclePrice.price.gtn(0)
    ? checkedDecimalDiv(
        burnAmountUsd,
        -USDC_DECIMALS,
        oraclePrice.price,
        oraclePrice.exponent,
        -custody.decimals
      )
    : new BN(0);

  // Calculate burn fee
  const burnFeeBps = getRemoveLiquidityFeeBps({
    pool,
    custody,
    usdDelta: burnAmountUsd,
    tokenPrice: oraclePrice,
  });

  // Apply fee
  const outputAmountAfterFees = collectSwapFees({
    tokenAmount: outputAmount,
    feeBps: burnFeeBps,
  });

  return {
    jlpBurnAmount: jlpAmount,
    outputToken: outputToken.toUpperCase(),
    burnAmountUsd: BNToUSDRepresentation(burnAmountUsd, USDC_DECIMALS),
    burnFeeBps: burnFeeBps.toString(),
    burnFeePercentage: (burnFeeBps.toNumber() / 100).toFixed(2),
    outputAmount: outputAmount.toString(),
    outputAmountAfterFees: outputAmountAfterFees.toString(),
  };
}
