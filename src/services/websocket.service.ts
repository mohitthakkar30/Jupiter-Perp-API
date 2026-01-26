import { PublicKey, AccountChangeCallback, Context } from "@solana/web3.js";
import type { IdlAccounts } from "@coral-xyz/anchor";
import type { Perpetuals } from "../idl/jupiter-perpetuals-idl";
import { getPerpetualsProgram, getConnection } from "../utils/solana";
import {
  JUPITER_PERPETUALS_PROGRAM_ID,
  JLP_POOL_ACCOUNT_PUBKEY,
  CUSTODY_PUBKEYS,
  CUSTODY_DETAILS,
  USDC_DECIMALS,
  BPS_POWER,
} from "../constants/index";
import { BNToUSDRepresentation, formatSide } from "../utils/formatting";
import { BN } from "@coral-xyz/anchor";

type Position = IdlAccounts<Perpetuals>["position"];
type Pool = IdlAccounts<Perpetuals>["pool"];
type Custody = IdlAccounts<Perpetuals>["custody"];

// Subscription management
interface Subscription {
  id: number;
  type: "position" | "pool" | "custody";
  params?: Record<string, string>;
}

const activeSubscriptions = new Map<number, Subscription>();
let subscriptionIdCounter = 0;

// Format position for WebSocket broadcast
function formatPositionUpdate(pubkey: PublicKey, position: Position) {
  const leverage = position.sizeUsd.mul(new BN(100)).div(position.collateralUsd).toNumber() / 100;

  return {
    type: "position_update",
    timestamp: Date.now(),
    data: {
      publicKey: pubkey.toString(),
      owner: position.owner.toString(),
      pool: position.pool.toString(),
      custody: position.custody.toString(),
      collateralCustody: position.collateralCustody.toString(),
      side: formatSide(position.side),
      sizeUsd: position.sizeUsd.toString(),
      sizeUsdFormatted: BNToUSDRepresentation(position.sizeUsd, USDC_DECIMALS),
      collateralUsd: position.collateralUsd.toString(),
      collateralUsdFormatted: BNToUSDRepresentation(position.collateralUsd, USDC_DECIMALS),
      entryPrice: position.price.toString(),
      entryPriceFormatted: BNToUSDRepresentation(position.price, USDC_DECIMALS),
      leverage: leverage.toFixed(2) + "x",
      openTime: position.openTime.toNumber(),
      updateTime: position.updateTime.toNumber(),
      isOpen: position.sizeUsd.gtn(0),
    },
  };
}

// Format pool for WebSocket broadcast
function formatPoolUpdate(pool: Pool) {
  return {
    type: "pool_update",
    timestamp: Date.now(),
    data: {
      publicKey: JLP_POOL_ACCOUNT_PUBKEY.toString(),
      aumUsd: pool.aumUsd.toString(),
      aumUsdFormatted: BNToUSDRepresentation(pool.aumUsd, USDC_DECIMALS),
      name: pool.name,
      inceptionTime: pool.inceptionTime.toNumber(),
    },
  };
}

// Format custody for WebSocket broadcast
function formatCustodyUpdate(pubkey: PublicKey, custody: Custody) {
  const details = CUSTODY_DETAILS[pubkey.toString()];
  const tokenName = details?.name || "Unknown";

  return {
    type: "custody_update",
    timestamp: Date.now(),
    data: {
      publicKey: pubkey.toString(),
      token: tokenName,
      mint: custody.mint.toString(),
      isStable: custody.isStable,
      assets: {
        owned: custody.assets.owned.toString(),
        locked: custody.assets.locked.toString(),
        feesReserves: custody.assets.feesReserves.toString(),
        guaranteedUsd: custody.assets.guaranteedUsd.toString(),
        globalShortSizes: custody.assets.globalShortSizes.toString(),
      },
      targetRatioBps: custody.targetRatioBps.toString(),
    },
  };
}

// Subscribe to position changes for a wallet
export function subscribeToPositionChanges(
  walletAddress: string,
  onUpdate: (data: ReturnType<typeof formatPositionUpdate>) => void,
  onError?: (error: Error) => void
): number {
  const connection = getConnection();
  const program = getPerpetualsProgram();

  try {
    const walletPubkey = new PublicKey(walletAddress);

    const subscriptionId = connection.onProgramAccountChange(
      program.programId,
      (accountInfo, context) => {
        try {
          const position = program.coder.accounts.decode(
            "position",
            accountInfo.accountInfo.data
          ) as Position;

          const update = formatPositionUpdate(accountInfo.accountId, position);
          onUpdate(update);
        } catch (err) {
          if (onError) {
            onError(err instanceof Error ? err : new Error(String(err)));
          }
        }
      },
      {
        commitment: "confirmed",
        filters: [
          {
            memcmp: {
              bytes: walletPubkey.toBase58(),
              offset: 8, // owner field offset
            },
          },
          {
            memcmp: program.coder.accounts.memcmp("position"),
          },
        ],
      }
    );

    const internalId = ++subscriptionIdCounter;
    activeSubscriptions.set(internalId, {
      id: subscriptionId,
      type: "position",
      params: { wallet: walletAddress },
    });

    return internalId;
  } catch (err) {
    if (onError) {
      onError(err instanceof Error ? err : new Error(String(err)));
    }
    throw err;
  }
}

// Subscribe to pool AUM changes
export function subscribeToPoolChanges(
  onUpdate: (data: ReturnType<typeof formatPoolUpdate>) => void,
  onError?: (error: Error) => void
): number {
  const connection = getConnection();
  const program = getPerpetualsProgram();

  try {
    const subscriptionId = connection.onAccountChange(
      JLP_POOL_ACCOUNT_PUBKEY,
      (accountInfo, context) => {
        try {
          const pool = program.coder.accounts.decode(
            "pool",
            accountInfo.data
          ) as Pool;

          const update = formatPoolUpdate(pool);
          onUpdate(update);
        } catch (err) {
          if (onError) {
            onError(err instanceof Error ? err : new Error(String(err)));
          }
        }
      },
      "confirmed"
    );

    const internalId = ++subscriptionIdCounter;
    activeSubscriptions.set(internalId, {
      id: subscriptionId,
      type: "pool",
    });

    return internalId;
  } catch (err) {
    if (onError) {
      onError(err instanceof Error ? err : new Error(String(err)));
    }
    throw err;
  }
}

// Subscribe to custody changes
export function subscribeToCustodyChanges(
  tokenOrPubkey?: string,
  onUpdate?: (data: ReturnType<typeof formatCustodyUpdate>) => void,
  onError?: (error: Error) => void
): number {
  const connection = getConnection();
  const program = getPerpetualsProgram();

  // Determine which custody pubkeys to subscribe to
  let custodyPubkeys: PublicKey[];

  if (tokenOrPubkey) {
    // Check if it's a token name or pubkey
    const tokenUpper = tokenOrPubkey.toUpperCase();
    const custodyDetail = Object.entries(CUSTODY_DETAILS).find(
      ([pubkey, details]) =>
        details.name === tokenUpper || pubkey === tokenOrPubkey
    );

    if (custodyDetail) {
      custodyPubkeys = [new PublicKey(custodyDetail[0])];
    } else {
      throw new Error(`Unknown token or custody: ${tokenOrPubkey}`);
    }
  } else {
    custodyPubkeys = CUSTODY_PUBKEYS;
  }

  const subscriptionIds: number[] = [];

  for (const custodyPubkey of custodyPubkeys) {
    try {
      const subscriptionId = connection.onAccountChange(
        custodyPubkey,
        (accountInfo, context) => {
          try {
            const custody = program.coder.accounts.decode(
              "custody",
              accountInfo.data
            ) as Custody;

            if (onUpdate) {
              const update = formatCustodyUpdate(custodyPubkey, custody);
              onUpdate(update);
            }
          } catch (err) {
            if (onError) {
              onError(err instanceof Error ? err : new Error(String(err)));
            }
          }
        },
        "confirmed"
      );

      subscriptionIds.push(subscriptionId);
    } catch (err) {
      if (onError) {
        onError(err instanceof Error ? err : new Error(String(err)));
      }
    }
  }

  const internalId = ++subscriptionIdCounter;
  // Store only the first subscription ID for tracking (simplified)
  if (subscriptionIds.length > 0) {
    activeSubscriptions.set(internalId, {
      id: subscriptionIds[0],
      type: "custody",
      params: tokenOrPubkey ? { token: tokenOrPubkey } : undefined,
    });
  }

  return internalId;
}

// Unsubscribe from a subscription
export async function unsubscribe(internalId: number): Promise<boolean> {
  const subscription = activeSubscriptions.get(internalId);
  if (!subscription) {
    return false;
  }

  const connection = getConnection();

  try {
    await connection.removeAccountChangeListener(subscription.id);
    activeSubscriptions.delete(internalId);
    return true;
  } catch {
    return false;
  }
}

// Get active subscription count
export function getActiveSubscriptionCount(): number {
  return activeSubscriptions.size;
}

// Cleanup all subscriptions (for graceful shutdown)
export async function cleanupAllSubscriptions(): Promise<void> {
  const connection = getConnection();

  for (const [internalId, subscription] of activeSubscriptions) {
    try {
      await connection.removeAccountChangeListener(subscription.id);
    } catch {
      // Ignore errors during cleanup
    }
  }

  activeSubscriptions.clear();
}
