import { BN } from "@coral-xyz/anchor";
import type { IdlAccounts } from "@coral-xyz/anchor";
import {
  PublicKey,
  Transaction,
  SystemProgram,
  ComputeBudgetProgram,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
  NATIVE_MINT,
} from "@solana/spl-token";
import type { Perpetuals } from "../idl/jupiter-perpetuals-idl";
import { getPerpetualsProgram, getConnection } from "../utils/solana";
import {
  JUPITER_PERPETUALS_PROGRAM_ID,
  JLP_POOL_ACCOUNT_PUBKEY,
} from "../constants";
import { BNToUSDRepresentation } from "../utils/formatting";
import { USDC_DECIMALS } from "../constants";

type PositionRequest = IdlAccounts<Perpetuals>["positionRequest"];

export interface PositionRequestResponse {
  publicKey: string;
  owner: string;
  pool: string;
  position: string;
  mint: string;
  openTime: number;
  updateTime: number;
  sizeUsdDelta: string;
  collateralDelta: string;
  requestType: string;
  side: "long" | "short";
  priceSlippage: string;
}

// Get all pending position requests
export async function getAllPositionRequests(): Promise<PositionRequestResponse[]> {
  const program = getPerpetualsProgram();
  const connection = getConnection();

  const gpaResult = await connection.getProgramAccounts(program.programId, {
    commitment: "confirmed",
    filters: [{ memcmp: program.coder.accounts.memcmp("positionRequest") }],
  });

  const positionRequests = gpaResult.map((item) => ({
    publicKey: item.pubkey,
    account: program.coder.accounts.decode(
      "positionRequest",
      item.account.data
    ) as PositionRequest,
  }));

  return positionRequests.map((pr) => formatPositionRequest(pr.publicKey.toString(), pr.account));
}

// Get position requests for a specific wallet
export async function getPositionRequestsByWallet(
  walletAddress: string
): Promise<PositionRequestResponse[]> {
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
      { memcmp: program.coder.accounts.memcmp("positionRequest") },
    ],
  });

  const positionRequests = gpaResult.map((item) => ({
    publicKey: item.pubkey,
    account: program.coder.accounts.decode(
      "positionRequest",
      item.account.data
    ) as PositionRequest,
  }));

  return positionRequests.map((pr) => formatPositionRequest(pr.publicKey.toString(), pr.account));
}

// Get specific position request by pubkey
export async function getPositionRequestByPubkey(
  positionRequestPubkey: string
): Promise<PositionRequestResponse | null> {
  try {
    const program = getPerpetualsProgram();
    const positionRequest = await program.account.positionRequest.fetch(
      new PublicKey(positionRequestPubkey)
    );
    return formatPositionRequest(positionRequestPubkey, positionRequest);
  } catch {
    return null;
  }
}

function formatPositionRequest(
  publicKey: string,
  pr: PositionRequest
): PositionRequestResponse {
  let requestType = "unknown";
  if (pr.requestType.market) requestType = "market";
  else if (pr.requestType.trigger) requestType = "trigger";

  let side: "long" | "short" = "long";
  if (pr.side.short) side = "short";

  return {
    publicKey,
    owner: pr.owner.toString(),
    pool: pr.pool.toString(),
    position: pr.position.toString(),
    mint: pr.mint.toString(),
    openTime: pr.openTime.toNumber(),
    updateTime: pr.updateTime.toNumber(),
    sizeUsdDelta: pr.sizeUsdDelta.toString(),
    collateralDelta: pr.collateralDelta.toString(),
    requestType,
    side,
    priceSlippage: pr.priceSlippage?.toString() ?? "0",
  };
}

// Build transaction to close a position request
export async function buildClosePositionRequestTransaction(params: {
  positionRequestPubkey: string;
}): Promise<{
  transaction: string;
  positionRequest: PositionRequestResponse;
}> {
  const program = getPerpetualsProgram();
  const connection = getConnection();

  const positionRequestPubkey = new PublicKey(params.positionRequestPubkey);
  const positionRequest = await program.account.positionRequest.fetch(positionRequestPubkey);

  const isSOL = positionRequest.mint.equals(NATIVE_MINT);

  const positionRequestAta = getAssociatedTokenAddressSync(
    positionRequest.mint,
    positionRequestPubkey,
    true
  );

  const ownerAta = getAssociatedTokenAddressSync(
    positionRequest.mint,
    positionRequest.owner,
    true
  );

  const preInstructions = [];

  if (!isSOL) {
    const createOwnerAta = createAssociatedTokenAccountIdempotentInstruction(
      positionRequest.owner,
      ownerAta,
      positionRequest.owner,
      positionRequest.mint
    );
    preInstructions.push(createOwnerAta);
  }

  const closePositionRequestIx = await program.methods
    .closePositionRequest({})
    .accounts({
      keeper: null,
      owner: positionRequest.owner,
      ownerAta: isSOL ? null : ownerAta,
      pool: JLP_POOL_ACCOUNT_PUBKEY,
      positionRequest: positionRequestPubkey,
      positionRequestAta,
      position: positionRequest.position,
    })
    .instruction();

  const instructions = [
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100000 }),
    ComputeBudgetProgram.setComputeUnitLimit({ units: 200000 }),
    ...preInstructions,
    closePositionRequestIx,
  ];

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  const transaction = new Transaction({
    feePayer: positionRequest.owner,
    blockhash,
    lastValidBlockHeight,
  }).add(...instructions);

  const serializedTx = transaction
    .serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    })
    .toString("base64");

  return {
    transaction: serializedTx,
    positionRequest: formatPositionRequest(params.positionRequestPubkey, positionRequest),
  };
}
