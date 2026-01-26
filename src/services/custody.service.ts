import { PublicKey } from "@solana/web3";
import { getPerpetualsProgram } from "../utils/solana";
import {
  CUSTODY_PUBKEY,
  CUSTODY_DETAILS,
  CUSTODY_PUBKEYS,
  TOKEN_TO_CUSTODY,
} from "../constants/index";
import type { Custody, CustodyResponse } from "../types/index";

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
