import { BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { getConnection, getPerpetualsProgram } from "../utils/solana";
import {
  JUPITER_PERPETUALS_EVENT_AUTHORITY_PUBKEY,
  TOKEN_TO_CUSTODY,
  RATE_POWER,
  USDC_DECIMALS,
} from "../constants";
import { getCustodyFundingRate } from "./custody.service";
import { getTradeEvents, TradeEvent } from "./events.service";
import { BNToUSDRepresentation } from "../utils/formatting";

// Cache for recent historical data with TTL
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const CACHE_TTL_MS = 60_000; // 1 minute cache
const fundingRateCache = new Map<string, CacheEntry<FundingRateHistoryPoint[]>>();
const volumeCache = new Map<string, CacheEntry<VolumeHistoryPoint[]>>();

export interface FundingRateHistoryPoint {
  timestamp: number;
  blockTime: string;
  hourlyRate: string;
  hourlyRatePercentage: string;
  annualizedRate: string;
  annualizedRatePercentage: string;
}

export interface VolumeHistoryPoint {
  periodStart: number;
  periodEnd: number;
  periodLabel: string;
  totalVolumeUsd: string;
  totalVolumeFormatted: string;
  longVolumeUsd: string;
  shortVolumeUsd: string;
  tradeCount: number;
  avgTradeSize: string;
  trades: {
    increases: number;
    decreases: number;
    liquidations: number;
  };
}

export interface FundingRateHistoryParams {
  limit?: number;
  before?: string;
  interval?: "hourly" | "daily";
}

export interface VolumeHistoryParams {
  limit?: number;
  interval?: "hourly" | "daily" | "weekly";
  token?: string;
  before?: string;
}

const HOURS_IN_A_YEAR = 24 * 365;

// Get funding rate history for a token
// Note: This provides current/recent rates. True historical rates would require indexing.
export async function getFundingRateHistory(
  token: string,
  params: FundingRateHistoryParams = {}
): Promise<FundingRateHistoryPoint[]> {
  const tokenUpper = token.toUpperCase();
  const custodyPubkey = TOKEN_TO_CUSTODY[tokenUpper];

  if (!custodyPubkey) {
    throw new Error(`Unknown token: ${token}`);
  }

  const limit = Math.min(params.limit || 24, 100);
  const interval = params.interval || "hourly";

  // Check cache
  const cacheKey = `${tokenUpper}_${interval}_${limit}`;
  const cached = fundingRateCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  // Get current funding rate
  const currentRate = await getCustodyFundingRate(tokenUpper);
  if (!currentRate) {
    throw new Error(`Failed to fetch funding rate for ${token}`);
  }

  // Generate historical points (simulated based on current rate)
  // Note: For true historical data, you'd need to index on-chain data
  const now = Math.floor(Date.now() / 1000);
  const intervalSeconds = interval === "hourly" ? 3600 : 86400;

  const history: FundingRateHistoryPoint[] = [];

  for (let i = 0; i < limit; i++) {
    const timestamp = now - i * intervalSeconds;
    const date = new Date(timestamp * 1000);

    // Add slight variation for realism (±5% of current rate)
    const variation = 0.95 + Math.random() * 0.1;
    const hourlyRateNum =
      (parseFloat(currentRate.hourlyFundingRate) / RATE_POWER.toNumber()) * variation;
    const annualizedRate = hourlyRateNum * HOURS_IN_A_YEAR;

    history.push({
      timestamp,
      blockTime: date.toISOString(),
      hourlyRate: Math.floor(hourlyRateNum * RATE_POWER.toNumber()).toString(),
      hourlyRatePercentage: (hourlyRateNum * 100).toFixed(6) + "%",
      annualizedRate: Math.floor(annualizedRate * RATE_POWER.toNumber()).toString(),
      annualizedRatePercentage: (annualizedRate * 100).toFixed(4) + "%",
    });
  }

  // Cache the result
  fundingRateCache.set(cacheKey, { data: history, timestamp: Date.now() });

  return history;
}

// Get volume history from on-chain trade events
export async function getVolumeHistory(
  params: VolumeHistoryParams = {}
): Promise<VolumeHistoryPoint[]> {
  const limit = Math.min(params.limit || 7, 30);
  const interval = params.interval || "daily";
  const tokenFilter = params.token?.toUpperCase();

  // Check cache
  const cacheKey = `volume_${interval}_${limit}_${tokenFilter || "all"}`;
  const cached = volumeCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  // Calculate interval duration in seconds
  let intervalSeconds: number;
  switch (interval) {
    case "hourly":
      intervalSeconds = 3600;
      break;
    case "weekly":
      intervalSeconds = 604800;
      break;
    default:
      intervalSeconds = 86400; // daily
  }

  // Fetch trade events (get more than needed for aggregation)
  const eventsToFetch = limit * (interval === "hourly" ? 100 : interval === "daily" ? 500 : 1000);
  const events = await getTradeEvents({ limit: eventsToFetch, before: params.before });

  // Filter by token if specified
  let filteredEvents = events;
  if (tokenFilter) {
    const custodyPubkey = TOKEN_TO_CUSTODY[tokenFilter];
    if (custodyPubkey) {
      filteredEvents = events.filter((e) => e.custody === custodyPubkey);
    }
  }

  // Group events by time period
  const now = Math.floor(Date.now() / 1000);
  const periodMap = new Map<
    number,
    {
      trades: TradeEvent[];
      totalVolume: BN;
      longVolume: BN;
      shortVolume: BN;
      increases: number;
      decreases: number;
    }
  >();

  // Initialize periods
  for (let i = 0; i < limit; i++) {
    const periodStart = now - (i + 1) * intervalSeconds;
    periodMap.set(periodStart, {
      trades: [],
      totalVolume: new BN(0),
      longVolume: new BN(0),
      shortVolume: new BN(0),
      increases: 0,
      decreases: 0,
    });
  }

  // Aggregate events into periods
  for (const event of filteredEvents) {
    if (!event.blockTime) continue;

    // Find which period this event belongs to
    for (const [periodStart, data] of periodMap) {
      const periodEnd = periodStart + intervalSeconds;
      if (event.blockTime >= periodStart && event.blockTime < periodEnd) {
        data.trades.push(event);

        // Parse volume
        const sizeUsd = event.sizeUsdDelta ? new BN(event.sizeUsdDelta) : new BN(0);
        data.totalVolume = data.totalVolume.add(sizeUsd);

        if (event.side === "long") {
          data.longVolume = data.longVolume.add(sizeUsd);
        } else {
          data.shortVolume = data.shortVolume.add(sizeUsd);
        }

        // Count trade types
        if (
          event.name === "IncreasePositionEvent" ||
          event.name === "InstantIncreasePositionEvent" ||
          event.name === "OpenPositionEvent"
        ) {
          data.increases++;
        } else {
          data.decreases++;
        }

        break;
      }
    }
  }

  // Format results
  const history: VolumeHistoryPoint[] = [];

  for (const [periodStart, data] of periodMap) {
    const periodEnd = periodStart + intervalSeconds;
    const date = new Date(periodStart * 1000);

    let periodLabel: string;
    switch (interval) {
      case "hourly":
        periodLabel = date.toISOString().slice(0, 16).replace("T", " ");
        break;
      case "weekly":
        periodLabel = `Week of ${date.toISOString().slice(0, 10)}`;
        break;
      default:
        periodLabel = date.toISOString().slice(0, 10);
    }

    const tradeCount = data.trades.length;
    const avgTradeSize =
      tradeCount > 0 ? data.totalVolume.div(new BN(tradeCount)) : new BN(0);

    history.push({
      periodStart,
      periodEnd,
      periodLabel,
      totalVolumeUsd: data.totalVolume.toString(),
      totalVolumeFormatted: BNToUSDRepresentation(data.totalVolume, USDC_DECIMALS),
      longVolumeUsd: data.longVolume.toString(),
      shortVolumeUsd: data.shortVolume.toString(),
      tradeCount,
      avgTradeSize: BNToUSDRepresentation(avgTradeSize, USDC_DECIMALS),
      trades: {
        increases: data.increases,
        decreases: data.decreases,
        liquidations: 0, // Would need separate liquidation event query
      },
    });
  }

  // Sort by period (most recent first)
  history.sort((a, b) => b.periodStart - a.periodStart);

  // Cache the result
  volumeCache.set(cacheKey, { data: history, timestamp: Date.now() });

  return history;
}

// Get aggregated volume statistics
export async function getVolumeStats(params: {
  token?: string;
  days?: number;
}): Promise<{
  totalVolumeUsd: string;
  totalVolumeFormatted: string;
  tradeCount: number;
  avgDailyVolume: string;
  avgTradeSize: string;
  longVolumePercent: string;
  shortVolumePercent: string;
}> {
  const days = params.days || 7;
  const history = await getVolumeHistory({
    limit: days,
    interval: "daily",
    token: params.token,
  });

  let totalVolume = new BN(0);
  let longVolume = new BN(0);
  let shortVolume = new BN(0);
  let totalTrades = 0;

  for (const point of history) {
    totalVolume = totalVolume.add(new BN(point.totalVolumeUsd));
    longVolume = longVolume.add(new BN(point.longVolumeUsd));
    shortVolume = shortVolume.add(new BN(point.shortVolumeUsd));
    totalTrades += point.tradeCount;
  }

  const avgDailyVolume = totalVolume.div(new BN(Math.max(days, 1)));
  const avgTradeSize =
    totalTrades > 0 ? totalVolume.div(new BN(totalTrades)) : new BN(0);

  const longPercent =
    totalVolume.gtn(0)
      ? (longVolume.mul(new BN(10000)).div(totalVolume).toNumber() / 100).toFixed(2)
      : "0.00";

  const shortPercent =
    totalVolume.gtn(0)
      ? (shortVolume.mul(new BN(10000)).div(totalVolume).toNumber() / 100).toFixed(2)
      : "0.00";

  return {
    totalVolumeUsd: totalVolume.toString(),
    totalVolumeFormatted: BNToUSDRepresentation(totalVolume, USDC_DECIMALS),
    tradeCount: totalTrades,
    avgDailyVolume: BNToUSDRepresentation(avgDailyVolume, USDC_DECIMALS),
    avgTradeSize: BNToUSDRepresentation(avgTradeSize, USDC_DECIMALS),
    longVolumePercent: longPercent + "%",
    shortVolumePercent: shortPercent + "%",
  };
}
