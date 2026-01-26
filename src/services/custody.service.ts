import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { getPerpetualsProgram } from "../utils/solana";
import {
  CUSTODY_PUBKEY,
  CUSTODY_DETAILS,
  CUSTODY_PUBKEYS,
  TOKEN_TO_CUSTODY,
  RATE_POWER,
  DBPS_POWER,
  DEBT_POWER,
} from "../constants/index";
import type { Custody, CustodyResponse } from "../types/index";
import { divCeil } from "../utils/math";

export async function getCustodyData(custodyPubkey: string): Promise<Custody> {
  const program = getPerpetualsProgram();
  return program.account.custody.fetch(new PublicKey(custodyPubkey));
}

export async function getAllCustodies(): Promise<CustodyResponse[]> {
  const program = getPerpetualsProgram();
  const custodies = await program.account.custody.fetchMultiple(CUSTODY_PUBKEYS);

  return custodies.map((custody, index) => {
    const pubkey = CUSTODY_PUBKEYS[index].toString();
    const details = CUSTODY_DETAILS[pubkey];

    if (!custody) {
      throw new Error(`Failed to fetch custody: ${pubkey}`);
    }

    return formatCustodyResponse(pubkey, custody, details?.name || "Unknown");
  });
}

export async function getCustodyByToken(
  token: string
): Promise<CustodyResponse | null> {
  const tokenUpper = token.toUpperCase();
  const custodyPubkey = TOKEN_TO_CUSTODY[tokenUpper];

  if (!custodyPubkey) {
    return null;
  }

  const custody = await getCustodyData(custodyPubkey);
  return formatCustodyResponse(custodyPubkey, custody, tokenUpper);
}

function formatCustodyResponse(
  publicKey: string,
  custody: Custody,
  name: string
): CustodyResponse {
  return {
    publicKey,
    name,
    mint: custody.mint.toString(),
    decimals: custody.decimals,
    isStable: custody.isStable,
    targetRatioBps: custody.targetRatioBps.toString(),
    assets: {
      feesReserves: custody.assets.feesReserves.toString(),
      owned: custody.assets.owned.toString(),
      locked: custody.assets.locked.toString(),
      guaranteedUsd: custody.assets.guaranteedUsd.toString(),
      globalShortSizes: custody.assets.globalShortSizes.toString(),
      globalShortAveragePrices: custody.assets.globalShortAveragePrices.toString(),
    },
  };
}

export function getCustodyDetails(custodyPubkey: string) {
  return CUSTODY_DETAILS[custodyPubkey] || null;
}

// Helper functions for funding rate calculations
enum BorrowRateMechanism {
  Linear,
  Jump,
}

function getBorrowRateMechanism(custody: Custody): BorrowRateMechanism {
  if (!custody.fundingRateState.hourlyFundingDbps.eq(new BN(0))) {
    return BorrowRateMechanism.Linear;
  }
  return BorrowRateMechanism.Jump;
}

function getDebt(custody: Custody): BN {
  return divCeil(
    BN.max(custody.debt.sub(custody.borrowLendInterestsAccured), new BN(0)),
    DEBT_POWER
  );
}

function theoreticallyOwned(custody: Custody): BN {
  return custody.assets.owned.add(getDebt(custody));
}

function totalLocked(custody: Custody): BN {
  return custody.assets.locked.add(getDebt(custody));
}

const HOURS_IN_A_YEAR = 24 * 365;
const BPS_POWER = new BN(10_000);

function getHourlyBorrowRate(custody: Custody, isBorrowCurve = false): BN {
  const borrowRateMechanism = getBorrowRateMechanism(custody);
  const owned = theoreticallyOwned(custody);
  const locked = totalLocked(custody);

  if (borrowRateMechanism === BorrowRateMechanism.Linear) {
    const fundingRateState = isBorrowCurve
      ? custody.borrowsFundingRateState
      : custody.fundingRateState;
    const hourlyFundingRate = fundingRateState.hourlyFundingDbps
      .mul(RATE_POWER)
      .div(DBPS_POWER);

    return owned.gtn(0) && locked.gtn(0)
      ? divCeil(locked.mul(hourlyFundingRate), owned)
      : new BN(0);
  } else {
    const { minRateBps, maxRateBps, targetRateBps, targetUtilizationRate } =
      custody.jumpRateState;

    const utilizationRate =
      owned.gtn(0) && locked.gtn(0)
        ? locked.mul(RATE_POWER).div(owned)
        : new BN(0);

    let yearlyRate: BN;

    if (utilizationRate.lte(targetUtilizationRate)) {
      yearlyRate = divCeil(
        targetRateBps.sub(minRateBps).mul(utilizationRate),
        targetUtilizationRate
      )
        .add(minRateBps)
        .mul(RATE_POWER)
        .div(BPS_POWER);
    } else {
      const rateDiff = BN.max(new BN(0), maxRateBps.sub(targetRateBps));
      const utilDiff = BN.max(
        new BN(0),
        utilizationRate.sub(targetUtilizationRate)
      );
      const denom = BN.max(new BN(0), RATE_POWER.sub(targetUtilizationRate));

      if (denom.eqn(0)) {
        return new BN(0);
      }

      yearlyRate = divCeil(rateDiff.mul(utilDiff), denom)
        .add(targetRateBps)
        .mul(RATE_POWER)
        .div(BPS_POWER);
    }

    return yearlyRate.divn(HOURS_IN_A_YEAR);
  }
}

export interface FundingRateResponse {
  token: string;
  hourlyFundingRate: string;
  hourlyFundingRatePercentage: string;
  annualizedRate: string;
  annualizedRatePercentage: string;
  borrowApr: string;
  borrowAprPercentage: string;
}

export async function getCustodyFundingRate(
  token: string
): Promise<FundingRateResponse | null> {
  const tokenUpper = token.toUpperCase();
  const custodyPubkey = TOKEN_TO_CUSTODY[tokenUpper];

  if (!custodyPubkey) {
    return null;
  }

  const custody = await getCustodyData(custodyPubkey);

  const hourlyRate = getHourlyBorrowRate(custody);
  const borrowRate = getHourlyBorrowRate(custody, true);

  const hourlyRateNum = hourlyRate.toNumber() / RATE_POWER.toNumber();
  const annualizedRate = hourlyRateNum * HOURS_IN_A_YEAR;

  const borrowApr =
    (borrowRate.toNumber() / RATE_POWER.toNumber()) * HOURS_IN_A_YEAR * 100;

  return {
    token: tokenUpper,
    hourlyFundingRate: hourlyRate.toString(),
    hourlyFundingRatePercentage: (hourlyRateNum * 100).toFixed(6),
    annualizedRate: (annualizedRate * RATE_POWER.toNumber()).toString(),
    annualizedRatePercentage: (annualizedRate * 100).toFixed(4),
    borrowApr: borrowApr.toFixed(6),
    borrowAprPercentage: borrowApr.toFixed(4),
  };
}

export interface UtilizationResponse {
  token: string;
  owned: string;
  locked: string;
  utilizationRate: string;
  utilizationPercentage: string;
  theoreticallyOwned: string;
  totalLocked: string;
  debt: string;
}

export async function getCustodyUtilization(
  token: string
): Promise<UtilizationResponse | null> {
  const tokenUpper = token.toUpperCase();
  const custodyPubkey = TOKEN_TO_CUSTODY[tokenUpper];

  if (!custodyPubkey) {
    return null;
  }

  const custody = await getCustodyData(custodyPubkey);

  const owned = theoreticallyOwned(custody);
  const locked = totalLocked(custody);
  const debt = getDebt(custody);

  const utilizationRate =
    owned.gtn(0) && locked.gtn(0)
      ? locked.mul(RATE_POWER).div(owned)
      : new BN(0);

  const utilizationPercentage =
    (utilizationRate.toNumber() / RATE_POWER.toNumber()) * 100;

  return {
    token: tokenUpper,
    owned: custody.assets.owned.toString(),
    locked: custody.assets.locked.toString(),
    utilizationRate: utilizationRate.toString(),
    utilizationPercentage: utilizationPercentage.toFixed(4),
    theoreticallyOwned: owned.toString(),
    totalLocked: locked.toString(),
    debt: debt.toString(),
  };
}
