import { BN } from "@coral-xyz/anchor";
import type { IdlAccounts } from "@coral-xyz/anchor";
import type { Perpetuals } from "../idl/jupiter-perpetuals-idl";
import { getPerpetualsProgram, getConnection } from "../utils/solana";
import {
  BPS_POWER,
  USDC_DECIMALS,
  CUSTODY_PUBKEYS,
  CUSTODY_DETAILS,
} from "../constants";
import { divCeil, getAssetAmountUsd, getOraclePriceForStable, getPrice } from "../utils/math";
import { BNToUSDRepresentation } from "../utils/formatting";
import { getOraclePrices, getOraclePriceForCustody } from "./oracle.service";
import { getPoolData } from "./pool.service";
import { getCustodyData } from "./custody.service";
import type { Custody, OraclePrice } from "../types";

const RATE_POWER = new BN(1_000_000_000);
const DEBT_POWER = RATE_POWER;

// Calculate PnL for a position given price
function getPnlForSize(
  sizeUsdDelta: BN,
  positionAvgPrice: BN,
  positionSide: "long" | "short",
  tokenPrice: BN
): { hasProfit: boolean; pnl: BN } {
  if (sizeUsdDelta.eqn(0)) {
    return { hasProfit: false, pnl: new BN(0) };
  }

  const hasProfit =
    positionSide === "long"
      ? tokenPrice.gt(positionAvgPrice)
      : positionAvgPrice.gt(tokenPrice);

  const tokenPriceDelta = tokenPrice.sub(positionAvgPrice).abs();
  const pnl = sizeUsdDelta.mul(tokenPriceDelta).div(positionAvgPrice);

  return { hasProfit, pnl };
}

// Get global unrealized PnL for all long positions
export async function getGlobalLongUnrealizedPnl(): Promise<{
  totalPnlUsd: string;
  totalPnlUsdFormatted: string;
  positionCount: number;
}> {
  const program = getPerpetualsProgram();
  const connection = getConnection();

  const gpaResult = await connection.getProgramAccounts(program.programId, {
    commitment: "confirmed",
    filters: [{ memcmp: program.coder.accounts.memcmp("position") }],
  });

  const positions = gpaResult.map((item) => ({
    publicKey: item.pubkey,
    account: program.coder.accounts.decode(
      "position",
      item.account.data
    ) as IdlAccounts<Perpetuals>["position"],
  }));

  // Filter for open long positions
  const openLongPositions = positions.filter(
    (p) => p.account.sizeUsd.gtn(0) && p.account.side.long
  );

  // Get oracle prices for each custody
  const oraclePrices = await getOraclePrices();
  const priceMap = new Map<string, BN>();

  for (const [custody, priceData] of Object.entries(oraclePrices)) {
    priceMap.set(custody, priceData.price);
  }

  let totalPnl = new BN(0);

  for (const position of openLongPositions) {
    const custodyKey = position.account.custody.toString();
    const tokenPrice = priceMap.get(custodyKey);

    if (!tokenPrice) continue;

    const { hasProfit, pnl } = getPnlForSize(
      position.account.sizeUsd,
      position.account.price,
      "long",
      tokenPrice
    );

    totalPnl = hasProfit ? totalPnl.add(pnl) : totalPnl.sub(pnl);
  }

  return {
    totalPnlUsd: totalPnl.toString(),
    totalPnlUsdFormatted: BNToUSDRepresentation(totalPnl, USDC_DECIMALS),
    positionCount: openLongPositions.length,
  };
}

// Get global unrealized PnL for all short positions
export async function getGlobalShortUnrealizedPnl(): Promise<{
  totalPnlUsd: string;
  totalPnlUsdFormatted: string;
  positionCount: number;
}> {
  const program = getPerpetualsProgram();
  const connection = getConnection();

  const gpaResult = await connection.getProgramAccounts(program.programId, {
    commitment: "confirmed",
    filters: [{ memcmp: program.coder.accounts.memcmp("position") }],
  });

  const positions = gpaResult.map((item) => ({
    publicKey: item.pubkey,
    account: program.coder.accounts.decode(
      "position",
      item.account.data
    ) as IdlAccounts<Perpetuals>["position"],
  }));

  // Filter for open short positions
  const openShortPositions = positions.filter(
    (p) => p.account.sizeUsd.gtn(0) && p.account.side.short
  );

  // Get oracle prices
  const oraclePrices = await getOraclePrices();
  const priceMap = new Map<string, BN>();

  for (const [custody, priceData] of Object.entries(oraclePrices)) {
    priceMap.set(custody, priceData.price);
  }

  let totalPnl = new BN(0);

  for (const position of openShortPositions) {
    const custodyKey = position.account.custody.toString();
    const tokenPrice = priceMap.get(custodyKey);

    if (!tokenPrice) continue;

    const { hasProfit, pnl } = getPnlForSize(
      position.account.sizeUsd,
      position.account.price,
      "short",
      tokenPrice
    );

    totalPnl = hasProfit ? totalPnl.add(pnl) : totalPnl.sub(pnl);
  }

  return {
    totalPnlUsd: totalPnl.toString(),
    totalPnlUsdFormatted: BNToUSDRepresentation(totalPnl, USDC_DECIMALS),
    positionCount: openShortPositions.length,
  };
}

// Get estimated global long PnL (faster, uses custody aggregate data)
export async function getGlobalLongPnlEstimate(): Promise<{
  totalPnlUsd: string;
  totalPnlUsdFormatted: string;
}> {
  const program = getPerpetualsProgram();
  const custodies = await program.account.custody.all();
  const oraclePrices = await getOraclePrices();

  const priceMap = new Map<string, BN>();
  for (const [custody, priceData] of Object.entries(oraclePrices)) {
    priceMap.set(custody, priceData.price);
  }

  let totalPnl = new BN(0);

  for (const custody of custodies) {
    const tokenPrice = priceMap.get(custody.publicKey.toString());
    if (!tokenPrice) continue;

    // Long PnL estimate: locked * price - guaranteedUsd
    const lockedUsd = custody.account.assets.locked.mul(tokenPrice).div(new BN(10).pow(new BN(custody.account.decimals)));
    totalPnl = totalPnl.add(lockedUsd.sub(custody.account.assets.guaranteedUsd));
  }

  return {
    totalPnlUsd: totalPnl.toString(),
    totalPnlUsdFormatted: BNToUSDRepresentation(totalPnl, USDC_DECIMALS),
  };
}

// Get estimated global short PnL (faster, uses custody aggregate data)
export async function getGlobalShortPnlEstimate(): Promise<{
  totalPnlUsd: string;
  totalPnlUsdFormatted: string;
}> {
  const program = getPerpetualsProgram();
  const custodies = await program.account.custody.all();
  const oraclePrices = await getOraclePrices();

  const priceMap = new Map<string, BN>();
  for (const [custodyKey, priceData] of Object.entries(oraclePrices)) {
    priceMap.set(custodyKey, priceData.price);
  }

  let totalPnl = new BN(0);

  for (const custody of custodies) {
    if (custody.account.assets.globalShortSizes.eqn(0)) continue;

    const tokenPrice = priceMap.get(custody.publicKey.toString());
    if (!tokenPrice) continue;

    const averagePrice = custody.account.assets.globalShortAveragePrices;
    if (averagePrice.eqn(0)) continue;

    const priceDelta = averagePrice.sub(tokenPrice).abs();
    const pnlDelta = custody.account.assets.globalShortSizes
      .mul(priceDelta)
      .div(averagePrice);

    // If average price > current price, traders profit (shorts win)
    const tradersProfit = averagePrice.gt(tokenPrice);
    totalPnl = tradersProfit ? totalPnl.add(pnlDelta) : totalPnl.sub(pnlDelta);
  }

  return {
    totalPnlUsd: totalPnl.toString(),
    totalPnlUsdFormatted: BNToUSDRepresentation(totalPnl, USDC_DECIMALS),
  };
}

// Helper functions for AUM calculation
function getDebt(custody: Custody): BN {
  return divCeil(
    BN.max(
      new BN(custody.debt.toString()).sub(new BN(custody.borrowLendInterestsAccured.toString())),
      new BN(0)
    ),
    DEBT_POWER
  );
}

function theoreticallyOwned(custody: Custody): BN {
  return custody.assets.owned.add(getDebt(custody));
}

function totalLocked(custody: Custody): BN {
  return custody.assets.locked.add(getDebt(custody));
}

function getGlobalShortPnl(custody: Custody, price: BN): { tradersPnlDelta: BN; tradersHasProfit: boolean } {
  const averagePrice = custody.assets.globalShortAveragePrices;
  if (averagePrice.eqn(0)) {
    return { tradersPnlDelta: new BN(0), tradersHasProfit: false };
  }

  const priceDelta = averagePrice.sub(price).abs();
  const tradersPnlDelta = custody.assets.globalShortSizes.mul(priceDelta).div(averagePrice);
  const tradersHasProfit = averagePrice.gt(price);

  return { tradersPnlDelta, tradersHasProfit };
}

// Get detailed AUM breakdown by custody
export async function getDetailedAum(): Promise<{
  totalAumUsd: string;
  totalAumUsdFormatted: string;
  custodies: {
    name: string;
    custody: string;
    aumUsd: string;
    aumUsdFormatted: string;
    targetRatioBps: string;
    currentRatioBps: string;
  }[];
}> {
  const pool = await getPoolData();
  const program = getPerpetualsProgram();
  const oraclePrices = await getOraclePrices();

  const priceMap = new Map<string, OraclePrice>();
  for (const [custodyKey, priceData] of Object.entries(oraclePrices)) {
    priceMap.set(custodyKey, {
      price: priceData.price,
      exponent: priceData.expo,
    });
  }

  const custodyData: {
    name: string;
    custody: string;
    aumUsd: string;
    aumUsdFormatted: string;
    targetRatioBps: string;
    currentRatioBps: string;
  }[] = [];

  const totalAum = new BN(pool.aumUsd.toString());

  for (const custodyPubkey of CUSTODY_PUBKEYS) {
    const custody = await getCustodyData(custodyPubkey.toString());
    const details = CUSTODY_DETAILS[custodyPubkey.toString()];
    const custodyPrice = priceMap.get(custodyPubkey.toString());

    if (!custodyPrice) continue;

    const owned = theoreticallyOwned(custody);
    let aumUsd: BN;

    if (custody.isStable) {
      aumUsd = getAssetAmountUsd(
        getOraclePriceForStable(custodyPrice),
        owned,
        custody.decimals
      );
    } else {
      let tradersPnlDelta = new BN(0);
      let tradersHasProfit = false;
      aumUsd = custody.assets.guaranteedUsd;

      const netAssetsToken = BN.max(new BN(0), owned.sub(custody.assets.locked));
      const netAssetsUsd = getAssetAmountUsd(custodyPrice, netAssetsToken, custody.decimals);
      aumUsd = aumUsd.add(netAssetsUsd);

      if (custody.assets.globalShortSizes.gtn(0)) {
        const priceScaled = getPrice(custodyPrice, -USDC_DECIMALS);
        ({ tradersPnlDelta, tradersHasProfit } = getGlobalShortPnl(custody, priceScaled.price));

        if (tradersHasProfit) {
          aumUsd = BN.max(new BN(0), aumUsd.sub(tradersPnlDelta));
        } else {
          aumUsd = aumUsd.add(tradersPnlDelta);
        }
      }
    }

    const currentRatioBps = totalAum.gtn(0)
      ? aumUsd.mul(BPS_POWER).div(totalAum)
      : new BN(0);

    custodyData.push({
      name: details?.name || "Unknown",
      custody: custodyPubkey.toString(),
      aumUsd: aumUsd.toString(),
      aumUsdFormatted: BNToUSDRepresentation(aumUsd, USDC_DECIMALS),
      targetRatioBps: custody.targetRatioBps.toString(),
      currentRatioBps: currentRatioBps.toString(),
    });
  }

  return {
    totalAumUsd: totalAum.toString(),
    totalAumUsdFormatted: BNToUSDRepresentation(totalAum, USDC_DECIMALS),
    custodies: custodyData,
  };
}

// Get pool utilization by custody
export async function getPoolUtilization(): Promise<{
  custodies: {
    name: string;
    custody: string;
    owned: string;
    locked: string;
    utilizationBps: string;
    utilizationPercentage: string;
  }[];
}> {
  const program = getPerpetualsProgram();

  const custodyData: {
    name: string;
    custody: string;
    owned: string;
    locked: string;
    utilizationBps: string;
    utilizationPercentage: string;
  }[] = [];

  for (const custodyPubkey of CUSTODY_PUBKEYS) {
    const custody = await getCustodyData(custodyPubkey.toString());
    const details = CUSTODY_DETAILS[custodyPubkey.toString()];

    const owned = theoreticallyOwned(custody);
    const locked = totalLocked(custody);

    const utilizationBps = owned.gtn(0)
      ? locked.mul(BPS_POWER).div(owned)
      : new BN(0);

    custodyData.push({
      name: details?.name || "Unknown",
      custody: custodyPubkey.toString(),
      owned: owned.toString(),
      locked: locked.toString(),
      utilizationBps: utilizationBps.toString(),
      utilizationPercentage: (utilizationBps.toNumber() / 100).toFixed(2),
    });
  }

  return { custodies: custodyData };
}
