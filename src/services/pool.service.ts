import { BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { getMint } from "@solana/spl-token";
import { getPerpetualsProgram, getConnection } from "../utils/solana";
import {
  JLP_POOL_ACCOUNT_PUBKEY,
  JLP_MINT_PUBKEY,
  USDC_DECIMALS,
  BPS_POWER,
  CUSTODY_DETAILS,
} from "../constants/index";
import {
  getAssetAmountUsd,
  getOraclePriceForStable,
  getPrice,
  divCeil,
} from "../utils/math";
import { BNToUSDRepresentation } from "../utils/formatting";
import { getOraclePrices, getOraclePriceForCustody } from "./oracle.service";
import { getCustodyData } from "./custody.service";
import type { Pool, PoolResponse, Custody, OraclePrice } from "../types/index";

export async function getPoolData(): Promise<Pool> {
  const program = getPerpetualsProgram();
  return program.account.pool.fetch(JLP_POOL_ACCOUNT_PUBKEY);
}

export async function getPoolResponse(): Promise<PoolResponse> {
  const pool = await getPoolData();

  return {
    publicKey: JLP_POOL_ACCOUNT_PUBKEY.toString(),
    name: pool.name,
    aumUsd: pool.aumUsd.toString(),
    custodies: pool.custodies.map((c) => c.toString()),
    fees: {
      swapBps: pool.fees.swapBps.toString(),
      addRemoveLiquidityBps: pool.fees.addRemoveLiquidityBps.toString(),
      taxBps: pool.fees.taxBps.toString(),
    },
    poolApr: {
      feeAprBps: pool.poolApr.feeAprBps.toString(),
      realizedFeeUsd: pool.poolApr.realizedFeeUsd.toString(),
    },
  };
}

export async function getPoolAum(): Promise<{
  aumUsd: string;
  aumUsdFormatted: string;
}> {
  const pool = await getPoolData();
  return {
    aumUsd: pool.aumUsd.toString(),
    aumUsdFormatted: BNToUSDRepresentation(new BN(pool.aumUsd.toString()), USDC_DECIMALS),
  };
}

export async function getPoolApy(): Promise<{
  aprBps: string;
  aprPercentage: string;
  apyPercentage: string;
}> {
  const pool = await getPoolData();
  const aprBps = pool.poolApr.feeAprBps.toNumber();
  const aprDecimal = aprBps / 10000;

  // APY = (1 + APR/365)^365 - 1
  const apyDecimal = Math.pow(1 + aprDecimal / 365, 365) - 1;

  return {
    aprBps: aprBps.toString(),
    aprPercentage: (aprDecimal * 100).toFixed(2),
    apyPercentage: (apyDecimal * 100).toFixed(2),
  };
}

export async function getJlpVirtualPrice(): Promise<{
  virtualPrice: string;
  totalSupply: string;
  aumUsd: string;
}> {
  const pool = await getPoolData();
  const connection = getConnection();
  const jlpMint = await getMint(connection, JLP_MINT_PUBKEY, "confirmed");

  const totalSupply = new BN(jlpMint.supply.toString());
  const aumUsd = new BN(pool.aumUsd.toString());

  // Virtual price = AUM / Total Supply
  const virtualPrice = totalSupply.gtn(0)
    ? aumUsd.mul(new BN(10).pow(new BN(6))).div(totalSupply)
    : new BN(0);

  return {
    virtualPrice: BNToUSDRepresentation(virtualPrice, USDC_DECIMALS),
    totalSupply: totalSupply.toString(),
    aumUsd: aumUsd.toString(),
  };
}

// Calculate fee for adding/removing liquidity
export function getFeeBps({
  custody,
  sizeUsdDelta,
  baseFeeBps,
  taxFeeBps,
  multiplier,
  increment,
  pool,
  tokenPrice,
}: {
  custody: Custody;
  sizeUsdDelta: BN;
  baseFeeBps: BN;
  taxFeeBps: BN;
  multiplier: BN;
  increment: boolean;
  pool: Pool;
  tokenPrice: OraclePrice;
}): BN {
  const RATE_POWER = new BN(1_000_000_000);
  const DEBT_POWER = RATE_POWER;

  // Calculate debt
  const debt = divCeil(
    BN.max(
      new BN(custody.debt.toString()).sub(new BN(custody.borrowLendInterestsAccured.toString())),
      new BN(0)
    ),
    DEBT_POWER
  );

  // Calculate theoreticallyOwned
  const theoreticallyOwned = custody.assets.owned.add(debt);

  let initialUsd: BN;

  if (custody.isStable) {
    initialUsd = getAssetAmountUsd(
      getOraclePriceForStable(tokenPrice),
      theoreticallyOwned,
      custody.decimals
    );
  } else {
    const totalLocked = custody.assets.locked.add(debt);
    const currentAmount = theoreticallyOwned.sub(totalLocked);
    initialUsd = getAssetAmountUsd(tokenPrice, currentAmount, custody.decimals).add(
      custody.assets.guaranteedUsd
    );
  }

  const targetUsd = new BN(pool.aumUsd.toString()).mul(custody.targetRatioBps).div(BPS_POWER);

  if (targetUsd.eqn(0)) {
    return new BN(0);
  }

  const initialDiffUsd = initialUsd.sub(targetUsd).abs();
  const vTradeSize = multiplier.mul(sizeUsdDelta);

  let nextUsd: BN;
  if (increment) {
    nextUsd = initialUsd.add(vTradeSize);
  } else {
    nextUsd = BN.max(new BN(0), initialUsd.sub(vTradeSize));
  }

  const nextDiffUsd = nextUsd.sub(targetUsd).abs();

  if (nextDiffUsd.lt(initialDiffUsd)) {
    const rebateBps = taxFeeBps.mul(initialDiffUsd).div(targetUsd);
    return BN.max(baseFeeBps.sub(rebateBps), new BN(0));
  } else {
    const avgDiffUsd = initialDiffUsd.add(nextDiffUsd).divn(2);
    const taxBps = taxFeeBps.mul(BN.min(avgDiffUsd, targetUsd)).div(targetUsd);
    return baseFeeBps.add(taxBps);
  }
}

// Collect swap fees from token amount
export function collectSwapFees({
  tokenAmount,
  feeBps,
}: {
  tokenAmount: BN;
  feeBps: BN;
}): BN {
  const feeTokenAmount = tokenAmount.mul(feeBps).div(BPS_POWER);
  return BN.max(new BN(0), tokenAmount.sub(feeTokenAmount));
}
