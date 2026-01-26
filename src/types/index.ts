import type { IdlAccounts, ProgramAccount, IdlTypes } from "@coral-xyz/anchor";
import type { Perpetuals } from "../idl/jupiter-perpetuals-idl";
import { BN } from "@coral-xyz/anchor";

// Account Types from IDL
export type Position = IdlAccounts<Perpetuals>["position"];
export type PositionAccount = ProgramAccount<Position>;

export type PositionRequest = IdlAccounts<Perpetuals>["positionRequest"];
export type PositionRequestAccount = ProgramAccount<PositionRequest>;

export type Custody = IdlAccounts<Perpetuals>["custody"];
export type CustodyAccount = ProgramAccount<Custody>;

export type Pool = IdlAccounts<Perpetuals>["pool"];
export type BorrowPosition = IdlAccounts<Perpetuals>["borrowPosition"];

export type ContractTypes = IdlTypes<Perpetuals>;
export type PoolApr = ContractTypes["PoolApr"];

// Oracle Price Type
export interface OraclePrice {
  price: BN;
  exponent: number;
}

// API Response Types
export interface PositionResponse {
  publicKey: string;
  owner: string;
  pool: string;
  custody: string;
  collateralCustody: string;
  openTime: number;
  updateTime: number;
  side: "long" | "short";
  price: string;
  sizeUsd: string;
  collateralUsd: string;
  realisedPnlUsd: string;
  lockedAmount: string;
}

export interface CustodyResponse {
  publicKey: string;
  name: string;
  mint: string;
  decimals: number;
  isStable: boolean;
  targetRatioBps: string;
  assets: {
    feesReserves: string;
    owned: string;
    locked: string;
    guaranteedUsd: string;
    globalShortSizes: string;
    globalShortAveragePrices: string;
  };
}

export interface PoolResponse {
  publicKey: string;
  name: string;
  aumUsd: string;
  custodies: string[];
  fees: {
    swapBps: string;
    addRemoveLiquidityBps: string;
    taxBps: string;
  };
  poolApr: {
    feeAprBps: string;
    realizedFeeUsd: string;
  };
}

export interface PriceResponse {
  token: string;
  price: string;
  priceUsd: string;
  exponent: number;
  timestamp: number;
}

export interface PnlResponse {
  positionPubkey: string;
  pnlUsd: string;
  hasProfit: boolean;
  entryPrice: string;
  currentPrice: string;
  sizeUsd: string;
}

export interface LiquidationPriceResponse {
  positionPubkey: string;
  liquidationPrice: string;
  currentPrice: string;
  marginUsd: string;
  maxLossUsd: string;
}

export interface SwapFeeResponse {
  feeBps: string;
  feePercentage: string;
  amountIn: string;
  amountOut: string;
  amountOutAfterFees: string;
}

export interface MintJlpResponse {
  inputAmount: string;
  inputToken: string;
  mintFeeBps: string;
  jlpMintAmount: string;
  mintAmountUsd: string;
}

export interface BurnJlpResponse {
  jlpBurnAmount: string;
  outputToken: string;
  burnFeeBps: string;
  outputAmount: string;
  outputAmountUsd: string;
}
