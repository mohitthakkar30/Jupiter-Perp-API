import { Transaction, VersionedTransaction, PublicKey } from "@solana/web3.js";
import { getConnection } from "../utils/solana";

export interface SimulationResult {
  success: boolean;
  computeUnitsConsumed: number | null;
  logs: string[];
  returnData: {
    programId: string;
    data: string;
  } | null;
  error: string | null;
  accountsWithChanges: string[];
}

export interface FeeEstimate {
  estimatedBaseFee: number;
  recommendedPriorityFee: number;
  totalEstimatedFee: number;
  computeUnitsConsumed: number;
}

export interface TransactionValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
  signers: string[];
  writableAccounts: string[];
  readonlyAccounts: string[];
}

// Base fee per signature in lamports (5000)
const BASE_FEE_LAMPORTS = 5000;

// Default priority fee calculation constants
const DEFAULT_PRIORITY_FEE_MICRO_LAMPORTS = 100000; // 0.0001 SOL per CU

// Simulate a transaction and return detailed results
export async function simulateTransaction(
  serializedTransaction: string
): Promise<SimulationResult> {
  const connection = getConnection();

  try {
    // Try to decode as VersionedTransaction first, then legacy Transaction
    let transaction: Transaction | VersionedTransaction;
    const buffer = Buffer.from(serializedTransaction, "base64");

    try {
      transaction = VersionedTransaction.deserialize(buffer);
    } catch {
      transaction = Transaction.from(buffer);
    }

    const simulationResult = await connection.simulateTransaction(
      transaction as VersionedTransaction,
      {
        commitment: "confirmed",
        sigVerify: false,
        replaceRecentBlockhash: true,
      }
    );

    const { value } = simulationResult;

    // Extract accounts that had changes (non-null post balances)
    const accountsWithChanges: string[] = [];
    if (value.accounts) {
      value.accounts.forEach((account, index) => {
        if (account !== null) {
          accountsWithChanges.push(`Account ${index}: modified`);
        }
      });
    }

    return {
      success: value.err === null,
      computeUnitsConsumed: value.unitsConsumed ?? null,
      logs: value.logs ?? [],
      returnData: value.returnData
        ? {
            programId: value.returnData.programId,
            data: Buffer.from(value.returnData.data[0], "base64").toString(
              "hex"
            ),
          }
        : null,
      error: value.err ? JSON.stringify(value.err) : null,
      accountsWithChanges,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return {
      success: false,
      computeUnitsConsumed: null,
      logs: [],
      returnData: null,
      error: `Failed to simulate transaction: ${errorMessage}`,
      accountsWithChanges: [],
    };
  }
}

// Estimate compute units for a transaction
export async function estimateComputeUnits(
  serializedTransaction: string
): Promise<number> {
  const result = await simulateTransaction(serializedTransaction);

  if (!result.success || result.computeUnitsConsumed === null) {
    // Return a default estimate if simulation fails
    return 200000; // Default for perps operations
  }

  // Add 10% buffer for safety
  return Math.ceil(result.computeUnitsConsumed * 1.1);
}

// Estimate fees for a transaction
export async function estimateFees(
  serializedTransaction: string
): Promise<FeeEstimate> {
  const connection = getConnection();

  // Get compute units from simulation
  const computeUnitsConsumed = await estimateComputeUnits(serializedTransaction);

  // Count number of signatures (for base fee calculation)
  const buffer = Buffer.from(serializedTransaction, "base64");
  let numSignatures = 1;
  try {
    const tx = Transaction.from(buffer);
    numSignatures = tx.signatures.length || 1;
  } catch {
    // If we can't parse, assume 1 signature
  }

  const estimatedBaseFee = BASE_FEE_LAMPORTS * numSignatures;

  // Get recent priority fee info
  let recommendedPriorityFee: number;
  try {
    const recentFees = await connection.getRecentPrioritizationFees();
    if (recentFees.length > 0) {
      // Use median of recent fees
      const sortedFees = recentFees
        .map((f) => f.prioritizationFee)
        .sort((a, b) => a - b);
      const medianFee = sortedFees[Math.floor(sortedFees.length / 2)];
      recommendedPriorityFee = Math.max(
        medianFee,
        (computeUnitsConsumed * DEFAULT_PRIORITY_FEE_MICRO_LAMPORTS) / 1_000_000
      );
    } else {
      recommendedPriorityFee =
        (computeUnitsConsumed * DEFAULT_PRIORITY_FEE_MICRO_LAMPORTS) / 1_000_000;
    }
  } catch {
    recommendedPriorityFee =
      (computeUnitsConsumed * DEFAULT_PRIORITY_FEE_MICRO_LAMPORTS) / 1_000_000;
  }

  return {
    estimatedBaseFee,
    recommendedPriorityFee: Math.ceil(recommendedPriorityFee),
    totalEstimatedFee: estimatedBaseFee + Math.ceil(recommendedPriorityFee),
    computeUnitsConsumed,
  };
}

// Validate a transaction without simulating
export async function validateTransaction(
  serializedTransaction: string
): Promise<TransactionValidation> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const signers: string[] = [];
  const writableAccounts: string[] = [];
  const readonlyAccounts: string[] = [];

  try {
    const buffer = Buffer.from(serializedTransaction, "base64");
    let transaction: Transaction;

    try {
      transaction = Transaction.from(buffer);
    } catch {
      errors.push("Failed to deserialize transaction");
      return {
        valid: false,
        errors,
        warnings,
        signers,
        writableAccounts,
        readonlyAccounts,
      };
    }

    // Check if transaction has a recent blockhash
    if (!transaction.recentBlockhash) {
      errors.push("Transaction missing recent blockhash");
    }

    // Check if transaction has a fee payer
    if (!transaction.feePayer) {
      errors.push("Transaction missing fee payer");
    } else {
      signers.push(transaction.feePayer.toString());
    }

    // Extract account information from instructions
    for (const instruction of transaction.instructions) {
      for (const key of instruction.keys) {
        const pubkeyStr = key.pubkey.toString();
        if (key.isSigner && !signers.includes(pubkeyStr)) {
          signers.push(pubkeyStr);
        }
        if (key.isWritable && !writableAccounts.includes(pubkeyStr)) {
          writableAccounts.push(pubkeyStr);
        } else if (!key.isWritable && !readonlyAccounts.includes(pubkeyStr)) {
          readonlyAccounts.push(pubkeyStr);
        }
      }
    }

    // Check for missing signatures
    const numRequiredSignatures = signers.length;
    const numProvidedSignatures = transaction.signatures.filter(
      (sig) => sig.signature !== null
    ).length;

    if (numProvidedSignatures < numRequiredSignatures) {
      warnings.push(
        `Transaction requires ${numRequiredSignatures} signatures but has ${numProvidedSignatures}`
      );
    }

    // Verify accounts exist on-chain (optional, might be slow)
    const connection = getConnection();
    const accountsToCheck = [...writableAccounts.slice(0, 5)]; // Check first 5 writable accounts
    try {
      const accountInfos = await connection.getMultipleAccountsInfo(
        accountsToCheck.map((a) => new PublicKey(a))
      );
      accountInfos.forEach((info, index) => {
        if (info === null) {
          warnings.push(
            `Account ${accountsToCheck[index]} does not exist (might be created by transaction)`
          );
        }
      });
    } catch {
      warnings.push("Could not verify account existence");
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      signers,
      writableAccounts,
      readonlyAccounts,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    errors.push(`Validation failed: ${errorMessage}`);
    return {
      valid: false,
      errors,
      warnings,
      signers,
      writableAccounts,
      readonlyAccounts,
    };
  }
}

// Combined simulation with fee estimation
export async function simulateWithFees(serializedTransaction: string): Promise<{
  simulation: SimulationResult;
  fees: FeeEstimate;
}> {
  const [simulation, fees] = await Promise.all([
    simulateTransaction(serializedTransaction),
    estimateFees(serializedTransaction),
  ]);

  return { simulation, fees };
}
