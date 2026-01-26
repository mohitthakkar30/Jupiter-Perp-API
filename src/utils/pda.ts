import { BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import {
  JLP_POOL_ACCOUNT_PUBKEY,
  JUPITER_PERPETUALS_PROGRAM_ID,
} from "../constants";

// Generate Position PDA
export function generatePositionPda({
  custody,
  collateralCustody,
  walletAddress,
  side,
}: {
  custody: PublicKey;
  collateralCustody: PublicKey;
  walletAddress: PublicKey;
  side: "long" | "short";
}): { position: PublicKey; bump: number } {
  const [position, bump] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("position"),
      walletAddress.toBuffer(),
      JLP_POOL_ACCOUNT_PUBKEY.toBuffer(),
      custody.toBuffer(),
      collateralCustody.toBuffer(),
      Buffer.from([side === "long" ? 1 : 2]),
    ],
    JUPITER_PERPETUALS_PROGRAM_ID
  );

  return { position, bump };
}

// Generate Position Request PDA
export function generatePositionRequestPda({
  positionPubkey,
  requestChange,
  counter,
}: {
  positionPubkey: PublicKey;
  requestChange: "increase" | "decrease";
  counter?: BN;
}): { positionRequest: PublicKey; counter: BN; bump: number } {
  if (!counter) {
    counter = new BN(Math.floor(Math.random() * 1_000_000_000));
  }

  const requestChangeEnum = requestChange === "increase" ? [1] : [2];
  const [positionRequest, bump] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("position_request"),
      positionPubkey.toBuffer(),
      counter.toArrayLike(Buffer, "le", 8),
      Buffer.from(requestChangeEnum),
    ],
    JUPITER_PERPETUALS_PROGRAM_ID
  );

  return { positionRequest, counter, bump };
}

// Generate Perpetuals PDA (global state)
export function generatePerpetualsPda(): { perpetuals: PublicKey; bump: number } {
  const [perpetuals, bump] = PublicKey.findProgramAddressSync(
    [Buffer.from("perpetuals")],
    JUPITER_PERPETUALS_PROGRAM_ID
  );

  return { perpetuals, bump };
}

// Generate Borrow Position PDA
export function generateBorrowPositionPda({
  pool,
  walletAddress,
  custody,
}: {
  pool: PublicKey;
  walletAddress: PublicKey;
  custody: PublicKey;
}): { borrowPosition: PublicKey; bump: number } {
  const [borrowPosition, bump] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("borrow_lend"),
      pool.toBuffer(),
      walletAddress.toBuffer(),
      custody.toBuffer(),
    ],
    JUPITER_PERPETUALS_PROGRAM_ID
  );

  return { borrowPosition, bump };
}
