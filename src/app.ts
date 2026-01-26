import Fastify, { FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import {
  positionRoutes,
  poolRoutes,
  priceRoutes,
  custodyRoutes,
  tradeRoutes,
} from "./routes";

export async function buildApp(): Promise<FastifyInstance> {
  const fastify = Fastify({
    logger: true,
  });

  // Register CORS
  await fastify.register(cors, {
    origin: true,
  });

  // Health check
  fastify.get("/health", async () => {
    return { status: "ok", timestamp: new Date().toISOString() };
  });

  // API info
  fastify.get("/", async () => {
    return {
      name: "Jupiter Perpetuals API",
      version: "1.0.0",
      endpoints: {
        positions: {
          "GET /positions": "Get all open positions",
          "GET /positions/:wallet": "Get positions for specific wallet",
          "GET /positions/:wallet/:positionPubkey": "Get specific position",
          "GET /positions/pnl/:positionPubkey": "Calculate position PnL",
          "GET /positions/liquidation/:positionPubkey": "Calculate liquidation price",
          "GET /positions/borrow-fee/:positionPubkey": "Calculate borrow fee",
        },
        pool: {
          "GET /pool": "Get pool data",
          "GET /pool/aum": "Get pool AUM",
          "GET /pool/apy": "Get pool APY",
          "GET /jlp/price": "Get JLP virtual price",
        },
        prices: {
          "GET /prices": "Get all token prices",
          "GET /prices/:token": "Get specific token price (SOL, ETH, BTC, USDC, USDT)",
        },
        custodies: {
          "GET /custodies": "Get all custodies",
          "GET /custodies/:token": "Get specific custody data",
        },
        trade: {
          "POST /trade/increase-position": {
            description: "Build transaction to open/increase position",
            body: {
              owner: "string - Wallet address",
              inputMint: "string - Token name (SOL, ETH, BTC, USDC, USDT)",
              custody: "string - Position custody (token name or pubkey)",
              collateralCustody: "string - Collateral custody (token name or pubkey)",
              side: "string - 'long' or 'short'",
              sizeUsd: "string - Position size in USD (6 decimals)",
              collateralAmount: "string - Collateral amount in token decimals",
              priceSlippage: "string (optional) - Slippage tolerance (default 0.3%)",
            },
          },
          "POST /trade/decrease-position": {
            description: "Build transaction to close/decrease position",
            body: {
              owner: "string - Wallet address",
              positionPubkey: "string - Existing position pubkey",
              desiredMint: "string - Output token name (SOL, ETH, BTC, USDC, USDT)",
              entirePosition: "boolean (optional) - Close entire position (default true)",
              sizeUsdDelta: "string (optional) - Partial close amount in USD",
              collateralUsdDelta: "string (optional) - Collateral to withdraw",
              priceSlippage: "string (optional) - Slippage tolerance",
            },
          },
        },
      },
    };
  });

  // Register routes
  await fastify.register(positionRoutes);
  await fastify.register(poolRoutes);
  await fastify.register(priceRoutes);
  await fastify.register(custodyRoutes);
  await fastify.register(tradeRoutes);

  return fastify;
}

export default buildApp;
