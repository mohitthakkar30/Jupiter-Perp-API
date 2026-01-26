import { BN } from "@coral-xyz/anchor";
import type { IdlAccounts } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { getMint } from "@solana/spl-token";
import type { Perpetuals } from "../idl/jupiter-perpetuals-idl";
import { getPerpetualsProgram, getConnection, getDovesProgram } from "../utils/solana";
import {
  JUPITER_PERPETUALS_PROGRAM_ID,
  JLP_POOL_ACCOUNT_PUBKEY,
  JLP_MINT_PUBKEY,
  USDC_DECIMALS,
  BORROW_SIZE_PRECISION,
  RATE_POWER,
  CUSTODY_DETAILS,
  CUSTODY_PUBKEYS,
} from "../constants";
import { divCeil, getAssetAmountUsd } from "../utils/math";
import { BNToUSDRepresentation } from "../utils/formatting";
import { getCustodyData } from "./custody.service";
import { getPoolData } from "./pool.service";
import type { Custody, OraclePrice } from "../types";

type BorrowPosition = IdlAccounts<Perpetuals>["borrowPosition"];

export interface BorrowPositionResponse {
  publicKey: string;
  owner: string;
  pool: string;
  custody: string;
  borrowSize: string;
  borrowSizeTokenAmount: string;
  borrowSizeUsd: string;
  lockedCollateral: string;
  lockedCollateralUsd: string;
  interestsAccumulated: string;
}

// Generate borrow position PDA
export function generateBorrowPositionPda(params: {
  walletAddress: string;
  custody: string;
}): { position: PublicKey; bump: number } {
  const [position, bump] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("borrow_lend"),
      JLP_POOL_ACCOUNT_PUBKEY.toBuffer(),
      new PublicKey(params.walletAddress).toBuffer(),
      new PublicKey(params.custody).toBuffer(),
    ],
    JUPITER_PERPETUALS_PROGRAM_ID
  );

  return { position, bump };
}

// Get borrow token amount from borrowSize
function getBorrowTokenAmount(borrowPosition: BorrowPosition): BN {
  return divCeil(borrowPosition.borrowSize, BORROW_SIZE_PRECISION);
}

// Calculate accumulated interests
function updateInterestsAccumulated(
  custody: Custody,
  borrowPosition: BorrowPosition
): BN {
  if (
    borrowPosition.borrowSize.eqn(0) ||
    borrowPosition.cumulativeCompoundedInterestSnapshot.eqn(0)
  ) {
    return new BN(0);
  }

  const compoundedInterestIndex = custody.borrowsFundingRateState.cumulativeInterestRate;

  const interests = divCeil(
    compoundedInterestIndex
      .sub(borrowPosition.cumulativeCompoundedInterestSnapshot)
      .mul(borrowPosition.borrowSize),
    borrowPosition.cumulativeCompoundedInterestSnapshot
  );

  return interests;
}

// Get all borrow positions
export async function getAllBorrowPositions(): Promise<BorrowPositionResponse[]> {
  const program = getPerpetualsProgram();
  const connection = getConnection();

  const gpaResult = await connection.getProgramAccounts(program.programId, {
    commitment: "confirmed",
    filters: [{ memcmp: program.coder.accounts.memcmp("borrowPosition") }],
  });

  const borrowPositions = gpaResult.map((item) => ({
    publicKey: item.pubkey,
    account: program.coder.accounts.decode(
      "borrowPosition",
      item.account.data
    ) as BorrowPosition,
  }));

  // Filter out empty positions
  const activeBorrowPositions = borrowPositions.filter(
    (bp) => bp.account.borrowSize.gtn(0)
  );

  const results: BorrowPositionResponse[] = [];

  for (const bp of activeBorrowPositions) {
    try {
      const formatted = await formatBorrowPosition(bp.publicKey.toString(), bp.account);
      results.push(formatted);
    } catch {
      // Skip positions that fail to format
    }
  }

  return results;
}

// Get borrow positions for a specific wallet
export async function getBorrowPositionsByWallet(
  walletAddress: string
): Promise<BorrowPositionResponse[]> {
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
      { memcmp: program.coder.accounts.memcmp("borrowPosition") },
    ],
  });

  const borrowPositions = gpaResult.map((item) => ({
    publicKey: item.pubkey,
    account: program.coder.accounts.decode(
      "borrowPosition",
      item.account.data
    ) as BorrowPosition,
  }));

  // Filter out empty positions
  const activeBorrowPositions = borrowPositions.filter(
    (bp) => bp.account.borrowSize.gtn(0)
  );

  const results: BorrowPositionResponse[] = [];

  for (const bp of activeBorrowPositions) {
    try {
      const formatted = await formatBorrowPosition(bp.publicKey.toString(), bp.account);
      results.push(formatted);
    } catch {
      // Skip positions that fail to format
    }
  }

  return results;
}

// Get specific borrow position by pubkey
export async function getBorrowPositionByPubkey(
  borrowPositionPubkey: string
): Promise<BorrowPositionResponse | null> {
  try {
    const program = getPerpetualsProgram();
    const borrowPosition = await program.account.borrowPosition.fetch(
      new PublicKey(borrowPositionPubkey)
    );

    return formatBorrowPosition(borrowPositionPubkey, borrowPosition);
  } catch {
    return null;
  }
}

async function formatBorrowPosition(
  publicKey: string,
  borrowPosition: BorrowPosition
): Promise<BorrowPositionResponse> {
  const custody = await getCustodyData(borrowPosition.custody.toString());
  const pool = await getPoolData();
  const connection = getConnection();
  const dovesProgram = getDovesProgram();

  // Get oracle price from Doves
  const oracleAccount = await dovesProgram.account.agPriceFeed.fetch(
    custody.dovesAgOracle
  );

  const oraclePrice: OraclePrice = {
    price: oracleAccount.price,
    exponent: oracleAccount.expo,
  };

  const jlpMint = await getMint(connection, JLP_MINT_PUBKEY, "confirmed");

  // Calculate interests
  const interests = updateInterestsAccumulated(custody, borrowPosition);
  const borrowSizeWithInterests = borrowPosition.borrowSize.add(interests);

  // Calculate token amount
  const borrowSizeTokenAmount = divCeil(borrowSizeWithInterests, BORROW_SIZE_PRECISION);

  // Calculate USD value
  const borrowSizeUsd = getAssetAmountUsd(
    oraclePrice,
    borrowSizeTokenAmount,
    custody.decimals
  );

  // Calculate locked collateral USD value
  const jlpTotalSupply = new BN(jlpMint.supply.toString());
  const aumUsd = new BN(pool.aumUsd.toString());

  const lockedCollateralUsd = jlpTotalSupply.gtn(0)
    ? aumUsd.mul(borrowPosition.lockedCollateral).div(jlpTotalSupply)
    : new BN(0);

  return {
    publicKey,
    owner: borrowPosition.owner.toString(),
    pool: borrowPosition.pool.toString(),
    custody: borrowPosition.custody.toString(),
    borrowSize: borrowSizeWithInterests.toString(),
    borrowSizeTokenAmount: borrowSizeTokenAmount.toString(),
    borrowSizeUsd: BNToUSDRepresentation(borrowSizeUsd, USDC_DECIMALS),
    lockedCollateral: borrowPosition.lockedCollateral.toString(),
    lockedCollateralUsd: BNToUSDRepresentation(lockedCollateralUsd, USDC_DECIMALS),
    interestsAccumulated: interests.toString(),
  };
}

// Get borrow rates for a custody
export async function getBorrowRates(custodyOrToken: string): Promise<{
  custody: string;
  name: string;
  hourlyBorrowRateBps: string;
  annualBorrowRateBps: string;
  annualBorrowRatePercentage: string;
  cumulativeInterestRate: string;
}> {
  const program = getPerpetualsProgram();

  // Find custody pubkey
  let custodyPubkey: string;
  const custodyEntry = Object.entries(CUSTODY_DETAILS).find(
    ([key, details]) =>
      details.name.toUpperCase() === custodyOrToken.toUpperCase() ||
      key === custodyOrToken
  );

  if (custodyEntry) {
    custodyPubkey = custodyEntry[0];
  } else {
    custodyPubkey = custodyOrToken;
  }

  const custody = await getCustodyData(custodyPubkey);
  const details = CUSTODY_DETAILS[custodyPubkey];

  const hourlyBorrowRateBps = custody.borrowsFundingRateState.hourlyFundingDbps;
  const annualBorrowRateBps = hourlyBorrowRateBps.muln(24 * 365);

  return {
    custody: custodyPubkey,
    name: details?.name || "Unknown",
    hourlyBorrowRateBps: hourlyBorrowRateBps.toString(),
    annualBorrowRateBps: annualBorrowRateBps.toString(),
    annualBorrowRatePercentage: (annualBorrowRateBps.toNumber() / 100000).toFixed(2),
    cumulativeInterestRate: custody.borrowsFundingRateState.cumulativeInterestRate.toString(),
  };
}
