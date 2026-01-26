import { BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3";
import { getDovesProgram } from "../utils/solana";
import { CUSTODY_PUBKEY, CUSTODY_DETAILS } from "../constants/index";
import { BNToUSDRepresentation } from "../utils/formatting";
import type { OraclePrice, PriceResponse } from "../types/index";

interface DovesOraclePrice {
  price: BN;
  priceUsd: string;
  timestamp: number;
  expo: number;
}

type CustodyToOraclePrice = Record<string, DovesOraclePrice>;

// Oracle accounts for each custody
const DOVES_ORACLES = [
  {
    name: "SOL",
    publicKey: new PublicKey(CUSTODY_DETAILS[CUSTODY_PUBKEY.SOL].dovesOracle),
    custody: CUSTODY_PUBKEY.SOL,
    mint: CUSTODY_DETAILS[CUSTODY_PUBKEY.SOL].mint.toString(),
  },
  {
    name: "ETH",
    publicKey: new PublicKey(CUSTODY_DETAILS[CUSTODY_PUBKEY.ETH].dovesOracle),
    custody: CUSTODY_PUBKEY.ETH,
    mint: CUSTODY_DETAILS[CUSTODY_PUBKEY.ETH].mint.toString(),
  },
  {
    name: "BTC",
    publicKey: new PublicKey(CUSTODY_DETAILS[CUSTODY_PUBKEY.BTC].dovesOracle),
    custody: CUSTODY_PUBKEY.BTC,
    mint: CUSTODY_DETAILS[CUSTODY_PUBKEY.BTC].mint.toString(),
  },
  {
    name: "USDC",
    publicKey: new PublicKey(CUSTODY_DETAILS[CUSTODY_PUBKEY.USDC].dovesOracle),
    custody: CUSTODY_PUBKEY.USDC,
    mint: CUSTODY_DETAILS[CUSTODY_PUBKEY.USDC].mint.toString(),
  },
  {
    name: "USDT",
    publicKey: new PublicKey(CUSTODY_DETAILS[CUSTODY_PUBKEY.USDT].dovesOracle),
    custody: CUSTODY_PUBKEY.USDT,
    mint: CUSTODY_DETAILS[CUSTODY_PUBKEY.USDT].mint.toString(),
  },
];

// Price cache
let priceCache: CustodyToOraclePrice = {};
let lastUpdated = 0;
const CACHE_TTL_MS = 5000; // 5 seconds

export async function fetchOraclePrices(): Promise<CustodyToOraclePrice> {
  const dovesProgram = getDovesProgram();
  const dovesPubkeys = DOVES_ORACLES.map(({ publicKey }) => publicKey);
  const feeds = await dovesProgram.account.priceFeed.fetchMultiple(dovesPubkeys);

  const cache: CustodyToOraclePrice = {};

  DOVES_ORACLES.forEach(({ custody, mint }, index) => {
    const feed = feeds[index];

    if (feed) {
      cache[custody] = {
        price: feed.price,
        priceUsd: BNToUSDRepresentation(feed.price, Math.abs(feed.expo)),
        timestamp: feed.timestamp.toNumber(),
        expo: feed.expo,
      };
      // Also index by mint for convenience
      cache[mint] = cache[custody];
    }
  });

  priceCache = cache;
  lastUpdated = Date.now();

  return cache;
}

export async function getOraclePrices(): Promise<CustodyToOraclePrice> {
  // Return cached prices if still valid
  if (Date.now() - lastUpdated < CACHE_TTL_MS && Object.keys(priceCache).length > 0) {
    return priceCache;
  }

  return fetchOraclePrices();
}

export async function getOraclePriceForCustody(
  custodyPubkey: string
): Promise<OraclePrice | null> {
  const prices = await getOraclePrices();
  const oracleData = prices[custodyPubkey];

  if (!oracleData) {
    return null;
  }

  return {
    price: oracleData.price,
    exponent: oracleData.expo,
  };
}

export async function getOraclePriceByToken(
  token: string
): Promise<PriceResponse | null> {
  const tokenUpper = token.toUpperCase();
  const custodyPubkey = {
    SOL: CUSTODY_PUBKEY.SOL,
    ETH: CUSTODY_PUBKEY.ETH,
    BTC: CUSTODY_PUBKEY.BTC,
    USDC: CUSTODY_PUBKEY.USDC,
    USDT: CUSTODY_PUBKEY.USDT,
  }[tokenUpper];

  if (!custodyPubkey) {
    return null;
  }

  const prices = await getOraclePrices();
  const oracleData = prices[custodyPubkey];

  if (!oracleData) {
    return null;
  }

  return {
    token: tokenUpper,
    price: oracleData.price.toString(),
    priceUsd: oracleData.priceUsd,
    exponent: oracleData.expo,
    timestamp: oracleData.timestamp,
  };
}

export async function getAllPrices(): Promise<PriceResponse[]> {
  const prices = await getOraclePrices();

  return DOVES_ORACLES.map(({ name, custody }) => {
    const oracleData = prices[custody];
    return {
      token: name,
      price: oracleData?.price?.toString() || "0",
      priceUsd: oracleData?.priceUsd || "0",
      exponent: oracleData?.expo || 0,
      timestamp: oracleData?.timestamp || 0,
    };
  });
}
