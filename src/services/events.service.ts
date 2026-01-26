import { DISCRIMINATOR_SIZE, utils } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { getConnection, getPerpetualsProgram } from "../utils/solana";
import { JUPITER_PERPETUALS_EVENT_AUTHORITY_PUBKEY } from "../constants";

// Event types emitted by Jupiter Perpetuals
export type PerpetualsEventName =
  | "IncreasePositionEvent"
  | "InstantIncreasePositionEvent"
  | "DecreasePositionEvent"
  | "InstantDecreasePositionEvent"
  | "LiquidateEvent"
  | "ExecuteTpslEvent"
  | "OpenPositionEvent"
  | "ClosePositionEvent";

export interface ParsedEvent {
  name: string;
  data: Record<string, unknown>;
  signature: string;
  blockTime: number | null;
  slot: number;
}

export interface TradeEvent extends ParsedEvent {
  owner: string;
  position: string;
  custody: string;
  side: "long" | "short";
  sizeUsdDelta?: string;
  collateralDelta?: string;
  price?: string;
}

export interface LiquidationEvent extends ParsedEvent {
  owner: string;
  position: string;
  custody: string;
  liquidator: string;
  sizeUsd?: string;
  transferAmount?: string;
}

// Fetch and parse perpetuals events from on-chain transactions
export async function getPerpetualsEvents(params?: {
  limit?: number;
  before?: string;
}): Promise<ParsedEvent[]> {
  const connection = getConnection();
  const program = getPerpetualsProgram();

  const limit = params?.limit || 50;

  // Retrieve confirmed transaction signatures
  const signatureOptions: { limit: number; before?: string } = { limit };
  if (params?.before) {
    signatureOptions.before = params.before;
  }

  const confirmedSignatureInfos = await connection.getSignaturesForAddress(
    JUPITER_PERPETUALS_EVENT_AUTHORITY_PUBKEY,
    signatureOptions,
    "confirmed"
  );

  // Filter out failed transactions
  const successSignatures = confirmedSignatureInfos
    .filter(({ err }) => err === null)
    .map((info) => ({
      signature: info.signature,
      blockTime: info.blockTime ?? null,
      slot: info.slot ?? 0,
    }));

  if (successSignatures.length === 0) {
    return [];
  }

  // Fetch transactions in batches
  const txs = await connection.getTransactions(
    successSignatures.map((s) => s.signature),
    {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    }
  );

  const allEvents: ParsedEvent[] = [];

  txs.forEach((tx, txIndex) => {
    if (!tx?.meta?.innerInstructions) return;

    const signatureInfo = successSignatures[txIndex];

    tx.meta.innerInstructions.forEach((ix) => {
      ix.instructions.forEach((iix) => {
        try {
          // Skip if no data
          if (!iix.data) return;

          const ixData = utils.bytes.bs58.decode(iix.data);

          // Skip if data is too short
          if (ixData.length <= DISCRIMINATOR_SIZE) return;

          // Remove Anchor's 8-byte discriminator
          const eventData = utils.bytes.base64.encode(
            ixData.subarray(DISCRIMINATOR_SIZE)
          );

          const event = program.coder.events.decode(eventData);

          if (event) {
            allEvents.push({
              name: event.name,
              data: event.data as Record<string, unknown>,
              signature: signatureInfo.signature,
              blockTime: signatureInfo.blockTime,
              slot: signatureInfo.slot,
            });
          }
        } catch {
          // Skip instructions that don't decode as events
        }
      });
    });
  });

  return allEvents;
}

// Get trade events (increase/decrease position)
export async function getTradeEvents(params?: {
  limit?: number;
  before?: string;
}): Promise<TradeEvent[]> {
  const events = await getPerpetualsEvents(params);

  const tradeEventNames = [
    "IncreasePositionEvent",
    "InstantIncreasePositionEvent",
    "DecreasePositionEvent",
    "InstantDecreasePositionEvent",
    "OpenPositionEvent",
    "ClosePositionEvent",
  ];

  return events
    .filter((event) => tradeEventNames.includes(event.name))
    .map((event) => formatTradeEvent(event));
}

// Get trade events filtered by wallet
export async function getTradeEventsByWallet(
  wallet: string,
  params?: { limit?: number; before?: string }
): Promise<TradeEvent[]> {
  const walletPubkey = new PublicKey(wallet);
  const events = await getTradeEvents(params);

  return events.filter((event) => {
    try {
      return new PublicKey(event.owner).equals(walletPubkey);
    } catch {
      return false;
    }
  });
}

// Get liquidation events
export async function getLiquidationEvents(params?: {
  limit?: number;
  before?: string;
}): Promise<LiquidationEvent[]> {
  const events = await getPerpetualsEvents(params);

  return events
    .filter((event) => event.name === "LiquidateEvent")
    .map((event) => formatLiquidationEvent(event));
}

// Get liquidation events filtered by wallet
export async function getLiquidationEventsByWallet(
  wallet: string,
  params?: { limit?: number; before?: string }
): Promise<LiquidationEvent[]> {
  const walletPubkey = new PublicKey(wallet);
  const events = await getLiquidationEvents(params);

  return events.filter((event) => {
    try {
      return new PublicKey(event.owner).equals(walletPubkey);
    } catch {
      return false;
    }
  });
}

// Get TPSL execution events
export async function getTpslEvents(params?: {
  limit?: number;
  before?: string;
}): Promise<ParsedEvent[]> {
  const events = await getPerpetualsEvents(params);

  return events.filter((event) => event.name === "ExecuteTpslEvent");
}

// Format trade event data
function formatTradeEvent(event: ParsedEvent): TradeEvent {
  const data = event.data;

  let side: "long" | "short" = "long";
  if (data.side && typeof data.side === "object") {
    side = "short" in (data.side as object) ? "short" : "long";
  }

  return {
    name: event.name,
    data: event.data,
    signature: event.signature,
    blockTime: event.blockTime,
    slot: event.slot,
    owner: formatPublicKey(data.owner),
    position: formatPublicKey(data.position),
    custody: formatPublicKey(data.custody),
    side,
    sizeUsdDelta: formatBN(data.sizeUsdDelta),
    collateralDelta: formatBN(data.collateralDelta),
    price: formatBN(data.price),
  };
}

// Format liquidation event data
function formatLiquidationEvent(event: ParsedEvent): LiquidationEvent {
  const data = event.data;

  return {
    name: event.name,
    data: event.data,
    signature: event.signature,
    blockTime: event.blockTime,
    slot: event.slot,
    owner: formatPublicKey(data.owner),
    position: formatPublicKey(data.position),
    custody: formatPublicKey(data.custody),
    liquidator: formatPublicKey(data.liquidator),
    sizeUsd: formatBN(data.sizeUsd),
    transferAmount: formatBN(data.transferAmount),
  };
}

// Helper to format PublicKey to string
function formatPublicKey(value: unknown): string {
  if (!value) return "";
  if (value instanceof PublicKey) return value.toString();
  if (typeof value === "object" && "toString" in value) {
    return (value as { toString: () => string }).toString();
  }
  return String(value);
}

// Helper to format BN to string
function formatBN(value: unknown): string | undefined {
  if (!value) return undefined;
  if (typeof value === "object" && "toString" in value) {
    return (value as { toString: () => string }).toString();
  }
  return String(value);
}
