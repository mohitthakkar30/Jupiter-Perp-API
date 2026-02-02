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
  createCloseAccountInstruction,
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
import { getOraclePriceForCustody } from "./oracle.service";

// Default slippage: 1% = 100 basis points
const DEFAULT_SLIPPAGE_BPS = 100;

// Calculate the actual price slippage value based on current oracle price
// For LONG: max acceptable price = currentPrice * (1 + slippagePct)
// For SHORT: min acceptable price = currentPrice * (1 - slippagePct)
async function calculatePriceSlippage(
  custodyPubkey: string,
  side: "long" | "short",
  slippageBps: number = DEFAULT_SLIPPAGE_BPS
): Promise<BN> {
  const oraclePrice = await getOraclePriceForCustody(custodyPubkey);

  if (!oraclePrice || oraclePrice.price.isZero()) {
    // Fallback: use a very high/low price to avoid rejection
    // This is a safety net - should rarely happen
    console.warn(`Could not fetch oracle price for ${custodyPubkey}, using fallback`);
    return side === "long"
      ? new BN("999999999999") // Very high price for longs
      : new BN("1"); // Very low price for shorts
  }

  // Price is already in 6 decimals from oracle
  const currentPrice = oraclePrice.price;

  // Calculate slippage multiplier (e.g., 100 BPS = 1% = 0.01)
  // We use basis points for precision: 100 BPS = 1%
  // Formula: price * (10000 + slippageBps) / 10000 for long
  //          price * (10000 - slippageBps) / 10000 for short

  if (side === "long") {
    // For longs, we're buying - max acceptable price is higher
    return currentPrice.muln(10000 + slippageBps).divn(10000);
  } else {
    // For shorts, we're selling - min acceptable price is lower
    return currentPrice.muln(10000 - slippageBps).divn(10000);
  }
}

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

  // Calculate price slippage based on current oracle price
  // priceSlippage is the max/min acceptable price, NOT a percentage
  const slippageBps = params.priceSlippage
    ? parseInt(params.priceSlippage)
    : DEFAULT_SLIPPAGE_BPS;
  const priceSlippage = await calculatePriceSlippage(
    custodyPubkey.toString(),
    params.side,
    slippageBps
  );

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

  // Create position request ATA - the keeper needs this account to exist when executing the position
  // This must be created BEFORE the Jupiter instruction which will transfer tokens to it
  const createPositionRequestAtaIx = createAssociatedTokenAccountIdempotentInstruction(
    ownerPubkey, // payer
    positionRequestAta, // ata to create
    positionRequestPda, // owner (the PDA)
    inputMint // mint
  );
  transaction.add(createPositionRequestAtaIx);

  // Add the main instruction
  transaction.add(instruction);

  // If input is native SOL, close wSOL ATA after the trade to return rent to owner
  // This matches the official Jupiter example which includes closeAccountInstruction as post-instruction
  if (isNativeSol) {
    const closeWsolAtaIx = createCloseAccountInstruction(
      fundingAccount, // account to close
      ownerPubkey,    // destination for rent
      ownerPubkey     // authority
    );
    transaction.add(closeWsolAtaIx);
  }

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

  // Get position request ATA - must use desiredMint, not collateral mint
  // The positionRequestAta holds tokens being transferred out during close
  const positionRequestAta = getAssociatedTokenAddressSync(
    desiredMint,
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

  const entirePosition =
    params.entirePosition !== undefined ? params.entirePosition : true;


  // For partial close, calculate based on current price with reasonable slippage
  let priceSlippage: BN;
  if (entirePosition) {
    priceSlippage = new BN("100000000000");
  } else {
    // For partial close, calculate based on current price
    const isLong = positionData.side.long !== undefined;
    const slippageSide = isLong ? "short" : "long";
    const slippageBps = params.priceSlippage
      ? parseInt(params.priceSlippage)
      : 500; // 5% for partial close
    priceSlippage = await calculatePriceSlippage(
      custodyPubkey.toString(),
      slippageSide,
      slippageBps
    );
  }

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
  });

  // Check if output is native SOL
  const isNativeSol = desiredMint.equals(NATIVE_MINT);

  // Create receiving account ATA if it doesn't exist (idempotent)
  const createReceivingAtaIx = createAssociatedTokenAccountIdempotentInstruction(
    ownerPubkey, // payer
    receivingAccount, // ata
    ownerPubkey, // owner
    desiredMint // mint
  );
  transaction.add(createReceivingAtaIx);

  // Add the main instruction
  transaction.add(instruction);

  // If output is native SOL, close wSOL ATA to unwrap and return SOL to owner
  if (isNativeSol) {
    const closeWsolAtaIx = createCloseAccountInstruction(
      receivingAccount, // account to close
      ownerPubkey,      // destination for rent + SOL
      ownerPubkey       // authority
    );
    transaction.add(closeWsolAtaIx);
  }

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
