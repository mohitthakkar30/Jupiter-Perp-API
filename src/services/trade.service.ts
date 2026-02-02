import { BN } from "@coral-xyz/anchor";
import {
  PublicKey,
  Transaction,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
  createSyncNativeInstruction,
  NATIVE_MINT,
} from "@solana/spl-token";
import { getPerpetualsProgram, getConnection } from "../utils/solana";
import {
  generatePositionPda,
  generatePositionRequestPda,
  generatePerpetualsPda,
} from "../utils/pda";
import {
  JUPITER_PERPETUALS_PROGRAM_ID,
  JUPITER_PERPETUALS_EVENT_AUTHORITY_PUBKEY,
  JLP_POOL_ACCOUNT_PUBKEY,
  TOKEN_MINTS,
  CUSTODY_DETAILS,
  TOKEN_TO_CUSTODY,
} from "../constants";
import { getPositionData } from "./position.service";

// Default slippage: 0.3% = 30 basis points = 30 * 10^4 (6 decimals)
const DEFAULT_PRICE_SLIPPAGE = new BN(300_000);

export interface IncreasePositionParams {
  owner: string;
  inputMint: string; // Token name: SOL, ETH, BTC, USDC, USDT
  custody: string; // Custody pubkey or token name
  collateralCustody: string; // Collateral custody pubkey or token name
  side: "long" | "short";
  sizeUsd: string; // Position size in USD (raw value, 6 decimals)
  collateralAmount: string; // Collateral amount in token decimals
  priceSlippage?: string; // Slippage in 6 decimals (optional)
}

export interface DecreasePositionParams {
  owner: string;
  positionPubkey: string;
  desiredMint: string; // Token name for output
  entirePosition?: boolean;
  sizeUsdDelta?: string;
  collateralUsdDelta?: string;
  priceSlippage?: string;
}

export interface TransactionResponse {
  transaction: string; // Base64 encoded serialized transaction
  positionPda?: string;
  positionRequestPda: string;
}

// Resolve custody pubkey from token name or pubkey string
function resolveCustodyPubkey(custodyOrToken: string): PublicKey {
  // Check if it's a token name
  const custodyFromToken = TOKEN_TO_CUSTODY[custodyOrToken.toUpperCase()];
  if (custodyFromToken) {
    return new PublicKey(custodyFromToken);
  }
  // Otherwise treat as pubkey
  return new PublicKey(custodyOrToken);
}

// Resolve token mint from token name
function resolveTokenMint(tokenName: string): PublicKey {
  const mint = TOKEN_MINTS[tokenName.toUpperCase() as keyof typeof TOKEN_MINTS];
  if (!mint) {
    throw new Error(`Unknown token: ${tokenName}`);
  }
  return mint;
}

// Get custody details by pubkey
function getCustodyDetailsByPubkey(custodyPubkey: string) {
  const details = CUSTODY_DETAILS[custodyPubkey];
  if (!details) {
    throw new Error(`Custody details not found for: ${custodyPubkey}`);
  }
  return details;
}

export async function buildIncreasePositionTransaction(
  params: IncreasePositionParams
): Promise<TransactionResponse> {
  const program = getPerpetualsProgram();
  const connection = getConnection();

  const ownerPubkey = new PublicKey(params.owner);
  const custodyPubkey = resolveCustodyPubkey(params.custody);
  const collateralCustodyPubkey = resolveCustodyPubkey(params.collateralCustody);
  const inputMint = resolveTokenMint(params.inputMint);

  // Get custody details for the input mint
  const collateralCustodyDetails = getCustodyDetailsByPubkey(
    collateralCustodyPubkey.toString()
  );

  // Generate PDAs
  const { position: positionPda } = generatePositionPda({
    custody: custodyPubkey,
    collateralCustody: collateralCustodyPubkey,
    walletAddress: ownerPubkey,
    side: params.side,
  });

  const { positionRequest: positionRequestPda, counter } =
    generatePositionRequestPda({
      positionPubkey: positionPda,
      requestChange: "increase",
    });

  const { perpetuals: perpetualsPda } = generatePerpetualsPda();

  // Get owner's funding account (ATA for input token)
  const fundingAccount = getAssociatedTokenAddressSync(inputMint, ownerPubkey);

  // Get position request ATA (for input token - this holds the tokens being transferred in)
  const positionRequestAta = getAssociatedTokenAddressSync(
    inputMint,
    positionRequestPda,
    true // allowOwnerOffCurve for PDA
  );

  // Build params
  const sizeUsdDelta = new BN(params.sizeUsd);
  const collateralTokenDelta = new BN(params.collateralAmount);
  const priceSlippage = params.priceSlippage
    ? new BN(params.priceSlippage)
    : DEFAULT_PRICE_SLIPPAGE;

  const side = params.side === "long" ? { long: {} } : { short: {} };

  // Build instruction
  const instruction = await program.methods
    .createIncreasePositionMarketRequest({
      sizeUsdDelta,
      collateralTokenDelta,
      side,
      priceSlippage,
      jupiterMinimumOut: null,
      counter,
    })
    .accounts({
      owner: ownerPubkey,
      fundingAccount,
      perpetuals: perpetualsPda,
      pool: JLP_POOL_ACCOUNT_PUBKEY,
      position: positionPda,
      positionRequest: positionRequestPda,
      positionRequestAta,
      custody: custodyPubkey,
      collateralCustody: collateralCustodyPubkey,
      inputMint,
      referral: null,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      eventAuthority: JUPITER_PERPETUALS_EVENT_AUTHORITY_PUBKEY,
      program: JUPITER_PERPETUALS_PROGRAM_ID,
    })
    .instruction();

  // Build transaction
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash();
  const transaction = new Transaction({
    feePayer: ownerPubkey,
    blockhash,
    lastValidBlockHeight,
  });

  // If input is native SOL, add wrapping instructions
  const isNativeSol = inputMint.equals(NATIVE_MINT);
  if (isNativeSol) {
    const collateralLamports = new BN(params.collateralAmount);

    // 1. Create wSOL ATA if it doesn't exist (idempotent - won't fail if exists)
    const createAtaIx = createAssociatedTokenAccountIdempotentInstruction(
      ownerPubkey, // payer
      fundingAccount, // ata
      ownerPubkey, // owner
      NATIVE_MINT // mint
    );
    transaction.add(createAtaIx);

    // 2. Transfer native SOL to the wSOL ATA
    const transferIx = SystemProgram.transfer({
      fromPubkey: ownerPubkey,
      toPubkey: fundingAccount,
      lamports: collateralLamports.toNumber(),
    });
    transaction.add(transferIx);

    // 3. Sync native instruction - this "wraps" the SOL by updating the token account balance
    const syncNativeIx = createSyncNativeInstruction(fundingAccount);
    transaction.add(syncNativeIx);
  }

  // Create position request ATA (defensive - ensures account exists for keeper execution)
  // This prevents intermittent keeper failures with error 3012 "account not initialized"
  const createPositionRequestAtaIx = createAssociatedTokenAccountIdempotentInstruction(
    ownerPubkey, // payer
    positionRequestAta, // ata to create
    positionRequestPda, // owner (the PDA)
    inputMint // mint - must match the inputMint being transferred
  );
  transaction.add(createPositionRequestAtaIx);

  // Add the main instruction
  transaction.add(instruction);

  // Serialize without signing
  const serializedTx = transaction
    .serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    })
    .toString("base64");

  return {
    transaction: serializedTx,
    positionPda: positionPda.toString(),
    positionRequestPda: positionRequestPda.toString(),
  };
}

export async function buildDecreasePositionTransaction(
  params: DecreasePositionParams
): Promise<TransactionResponse> {
  const program = getPerpetualsProgram();
  const connection = getConnection();

  const ownerPubkey = new PublicKey(params.owner);
  const positionPubkey = new PublicKey(params.positionPubkey);
  const desiredMint = resolveTokenMint(params.desiredMint);

  // Fetch position data to get custody info
  const positionData = await getPositionData(params.positionPubkey);
  const custodyPubkey = positionData.custody;
  const collateralCustodyPubkey = positionData.collateralCustody;

  // Get custody details for desired output
  const desiredCustodyKey = TOKEN_TO_CUSTODY[params.desiredMint.toUpperCase()];
  if (!desiredCustodyKey) {
    throw new Error(`Unknown output token: ${params.desiredMint}`);
  }

  // Generate PDAs
  const { positionRequest: positionRequestPda, counter } =
    generatePositionRequestPda({
      positionPubkey: positionPubkey,
      requestChange: "decrease",
    });

  const { perpetuals: perpetualsPda } = generatePerpetualsPda();

  // Get owner's receiving account (ATA for desired output token)
  const receivingAccount = getAssociatedTokenAddressSync(
    desiredMint,
    ownerPubkey
  );

  // Get position request ATA
  const collateralCustodyDetails = getCustodyDetailsByPubkey(
    collateralCustodyPubkey.toString()
  );
  const positionRequestAta = getAssociatedTokenAddressSync(
    collateralCustodyDetails.mint,
    positionRequestPda,
    true
  );

  // Build params
  const collateralUsdDelta = params.collateralUsdDelta
    ? new BN(params.collateralUsdDelta)
    : new BN(0);
  const sizeUsdDelta = params.sizeUsdDelta
    ? new BN(params.sizeUsdDelta)
    : new BN(0);
  const priceSlippage = params.priceSlippage
    ? new BN(params.priceSlippage)
    : DEFAULT_PRICE_SLIPPAGE;
  const entirePosition =
    params.entirePosition !== undefined ? params.entirePosition : true;

  // Build instruction
  const instruction = await program.methods
    .createDecreasePositionMarketRequest({
      collateralUsdDelta,
      sizeUsdDelta,
      priceSlippage,
      jupiterMinimumOut: null,
      entirePosition,
      counter,
    })
    .accounts({
      owner: ownerPubkey,
      receivingAccount,
      perpetuals: perpetualsPda,
      pool: JLP_POOL_ACCOUNT_PUBKEY,
      position: positionPubkey,
      positionRequest: positionRequestPda,
      positionRequestAta,
      custody: custodyPubkey,
      collateralCustody: collateralCustodyPubkey,
      desiredMint,
      referral: null,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      eventAuthority: JUPITER_PERPETUALS_EVENT_AUTHORITY_PUBKEY,
      program: JUPITER_PERPETUALS_PROGRAM_ID,
    })
    .instruction();

  // Build transaction
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash();
  const transaction = new Transaction({
    feePayer: ownerPubkey,
    blockhash,
    lastValidBlockHeight,
  }).add(instruction);

  // Serialize without signing
  const serializedTx = transaction
    .serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    })
    .toString("base64");

  return {
    transaction: serializedTx,
    positionRequestPda: positionRequestPda.toString(),
  };
}
