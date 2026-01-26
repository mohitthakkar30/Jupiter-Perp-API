import Fastify, { FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import {
  positionRoutes,
  poolRoutes,
  priceRoutes,
  custodyRoutes,
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
      },
    };
  });

  // Register routes
  await fastify.register(positionRoutes);
  await fastify.register(poolRoutes);
  await fastify.register(priceRoutes);
  await fastify.register(custodyRoutes);

  return fastify;
}

export default buildApp;
