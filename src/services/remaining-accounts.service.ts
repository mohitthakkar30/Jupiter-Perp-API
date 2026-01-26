import { PublicKey } from "@solana/web3.js";
import { getPerpetualsProgram } from "../utils/solana";
import {
  JLP_POOL_ACCOUNT_PUBKEY,
  CUSTODY_PUBKEY,
  CUSTODY_DETAILS,
  TOKEN_TO_CUSTODY,
} from "../constants";

export interface AccountMeta {
  pubkey: string;
  isSigner: boolean;
  isWritable: boolean;
  type: "custody" | "dovesAgOracle" | "pythnetOracle" | "dovesOracle" | "chainlinkOracle" | "tokenAccount";
  name?: string;
}

export interface CustodyMetasResponse {
  custodyMetas: AccountMeta[];
  count: number;
  pool: string;
}

export interface OracleAccountsResponse {
  oracles: {
    custody: string;
    name: string;
    dovesOracle: string;
    dovesAgOracle: string;
    pythnetOracle: string;
    chainlinkOracle: string;
  }[];
  count: number;
}

// Get all custody remaining accounts (for instructions that need remainingAccounts)
export async function getCustodyMetas(): Promise<CustodyMetasResponse> {
  const program = getPerpetualsProgram();
  const pool = await program.account.pool.fetch(JLP_POOL_ACCOUNT_PUBKEY);

  const custodyMetas: AccountMeta[] = [];

  // Add all custody accounts
  for (const custody of pool.custodies) {
    const custodyStr = custody.toString();
    const details = CUSTODY_DETAILS[custodyStr];

    custodyMetas.push({
      pubkey: custodyStr,
      isSigner: false,
      isWritable: false,
      type: "custody",
      name: details?.name || undefined,
    });
  }

  // Add all dovesAgOracle accounts
  for (const custody of pool.custodies) {
    const custodyStr = custody.toString();
    const details = CUSTODY_DETAILS[custodyStr];

    if (details) {
      custodyMetas.push({
        pubkey: details.dovesAgOracle?.toString() || "",
        isSigner: false,
        isWritable: false,
        type: "dovesAgOracle",
        name: `${details.name}_dovesAgOracle`,
      });
    }
  }

  // Add all pythnetOracle accounts
  for (const custody of pool.custodies) {
    const custodyStr = custody.toString();
    const details = CUSTODY_DETAILS[custodyStr];

    if (details) {
      custodyMetas.push({
        pubkey: details.pythnetOracle.toString(),
        isSigner: false,
        isWritable: false,
        type: "pythnetOracle",
        name: `${details.name}_pythnetOracle`,
      });
    }
  }

  return {
    custodyMetas,
    count: custodyMetas.length,
    pool: JLP_POOL_ACCOUNT_PUBKEY.toString(),
  };
}

// Get custody metas for a specific token
export async function getCustodyMetasForToken(
  tokenOrCustody: string
): Promise<AccountMeta[]> {
  // Convert token name to custody pubkey if needed
  const custodyPubkey =
    TOKEN_TO_CUSTODY[tokenOrCustody.toUpperCase()] || tokenOrCustody;
  const details = CUSTODY_DETAILS[custodyPubkey];

  if (!details) {
    throw new Error(`Unknown custody: ${tokenOrCustody}`);
  }

  const metas: AccountMeta[] = [
    {
      pubkey: custodyPubkey,
      isSigner: false,
      isWritable: false,
      type: "custody",
      name: details.name,
    },
    {
      pubkey: details.dovesOracle.toString(),
      isSigner: false,
      isWritable: false,
      type: "dovesOracle",
      name: `${details.name}_dovesOracle`,
    },
    {
      pubkey: details.dovesAgOracle?.toString() || "",
      isSigner: false,
      isWritable: false,
      type: "dovesAgOracle",
      name: `${details.name}_dovesAgOracle`,
    },
    {
      pubkey: details.pythnetOracle.toString(),
      isSigner: false,
      isWritable: false,
      type: "pythnetOracle",
      name: `${details.name}_pythnetOracle`,
    },
    {
      pubkey: details.chainlinkOracle.toString(),
      isSigner: false,
      isWritable: false,
      type: "chainlinkOracle",
      name: `${details.name}_chainlinkOracle`,
    },
    {
      pubkey: details.tokenAccount.toString(),
      isSigner: false,
      isWritable: false,
      type: "tokenAccount",
      name: `${details.name}_tokenAccount`,
    },
  ];

  return metas;
}

// Get all oracle accounts
export function getAllOracleAccounts(): OracleAccountsResponse {
  const oracles: OracleAccountsResponse["oracles"] = [];

  const custodyKeys = [
    CUSTODY_PUBKEY.SOL,
    CUSTODY_PUBKEY.ETH,
    CUSTODY_PUBKEY.BTC,
    CUSTODY_PUBKEY.USDC,
    CUSTODY_PUBKEY.USDT,
  ];

  for (const custodyKey of custodyKeys) {
    const details = CUSTODY_DETAILS[custodyKey];
    if (details) {
      oracles.push({
        custody: custodyKey,
        name: details.name,
        dovesOracle: details.dovesOracle.toString(),
        dovesAgOracle: details.dovesAgOracle?.toString() || "",
        pythnetOracle: details.pythnetOracle.toString(),
        chainlinkOracle: details.chainlinkOracle.toString(),
      });
    }
  }

  return {
    oracles,
    count: oracles.length,
  };
}

// Get remaining accounts for specific instruction types
export async function getRemainingAccountsForInstruction(
  instructionType:
    | "addLiquidity"
    | "removeLiquidity"
    | "increasePosition"
    | "decreasePosition"
    | "swap"
): Promise<AccountMeta[]> {
  // Most Jupiter Perps instructions require the same remaining accounts pattern
  const { custodyMetas } = await getCustodyMetas();
  return custodyMetas;
}

// Get token account addresses for all custodies
export function getCustodyTokenAccounts(): {
  token: string;
  custody: string;
  tokenAccount: string;
}[] {
  const accounts: { token: string; custody: string; tokenAccount: string }[] =
    [];

  const custodyKeys = [
    CUSTODY_PUBKEY.SOL,
    CUSTODY_PUBKEY.ETH,
    CUSTODY_PUBKEY.BTC,
    CUSTODY_PUBKEY.USDC,
    CUSTODY_PUBKEY.USDT,
  ];

  for (const custodyKey of custodyKeys) {
    const details = CUSTODY_DETAILS[custodyKey];
    if (details) {
      accounts.push({
        token: details.name,
        custody: custodyKey,
        tokenAccount: details.tokenAccount.toString(),
      });
    }
  }

  return accounts;
}
