import Fastify, { FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import {
  positionRoutes,
  poolRoutes,
  priceRoutes,
  custodyRoutes,
  tradeRoutes,
  feeRoutes,
  analyticsRoutes,
  jlpRoutes,
  positionRequestRoutes,
  borrowRoutes,
  walletRoutes,
  pdaRoutes,
  eventRoutes,
  simulationRoutes,
  remainingAccountsRoutes,
  liquidationScenarioRoutes,
  historyRoutes,
  websocketRoutes,
} from "./routes";

export async function buildApp(): Promise<FastifyInstance> {
  const fastify = Fastify({
    logger: true,
  });

  // Register CORS
  await fastify.register(cors, {
    origin: true,
  });

  // Register WebSocket support
  await fastify.register(websocket);

  // Health check
  fastify.get("/health", async () => {
    return { status: "ok", timestamp: new Date().toISOString() };
  });

  // API info
  fastify.get("/", async () => {
    return {
      name: "Jupiter Perpetuals API",
      version: "2.0.0",
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
        },
        prices: {
          "GET /prices": "Get all token prices",
          "GET /prices/:token": "Get specific token price (SOL, ETH, BTC, USDC, USDT)",
        },
        custodies: {
          "GET /custodies": "Get all custodies",
          "GET /custodies/:token": "Get specific custody data",
          "GET /custodies/:token/funding-rate": "Get funding rate for custody",
          "GET /custodies/:token/utilization": "Get utilization for custody",
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
        fees: {
          "GET /fees/open-close-base": "Get base open/close position fees",
          "GET /fees/open/:custody": "Get open position fee for custody",
          "GET /fees/close/:custody": "Get close position fee for custody",
          "POST /fees/price-impact": "Calculate price impact fee",
          "POST /fees/swap": "Calculate swap fee",
        },
        analytics: {
          "GET /analytics/global-pnl/longs": "Get global unrealized PnL for longs",
          "GET /analytics/global-pnl/shorts": "Get global unrealized PnL for shorts",
          "GET /analytics/global-pnl/estimate/longs": "Estimate global long PnL",
          "GET /analytics/global-pnl/estimate/shorts": "Estimate global short PnL",
          "GET /analytics/pool/aum/detailed": "Get detailed AUM breakdown",
          "GET /analytics/pool/utilization": "Get pool utilization by custody",
        },
        jlp: {
          "GET /jlp/price": "Get JLP virtual price",
          "POST /jlp/calculate-mint": "Calculate JLP tokens for deposit",
          "POST /jlp/calculate-burn": "Calculate tokens for JLP burn",
        },
        positionRequests: {
          "GET /position-requests": "Get all pending position requests",
          "GET /position-requests/wallet/:wallet": "Get position requests by wallet",
          "GET /position-requests/:pubkey": "Get specific position request",
          "POST /position-requests/close": "Build close position request transaction",
        },
        borrow: {
          "GET /borrow/positions": "Get all borrow positions",
          "GET /borrow/positions/wallet/:wallet": "Get borrow positions by wallet",
          "GET /borrow/positions/:pubkey": "Get specific borrow position",
          "GET /borrow/rates/:custody": "Get borrow rates for custody",
        },
        wallet: {
          "GET /wallet/:wallet/summary": "Get complete wallet portfolio summary",
        },
        pda: {
          "POST /pda/position": "Generate position PDA",
          "POST /pda/position-request": "Generate position request PDA",
          "POST /pda/borrow-position": "Generate borrow position PDA",
          "GET /pda/perpetuals": "Get perpetuals global state PDA",
        },
        events: {
          "GET /events": "Get all perpetuals events",
          "GET /events/trades": "Get trade events (increase/decrease position)",
          "GET /events/trades/:wallet": "Get trade events by wallet",
          "GET /events/liquidations": "Get liquidation events",
          "GET /events/liquidations/:wallet": "Get liquidation events by wallet",
          "GET /events/tpsl": "Get TPSL execution events",
        },
        priceStreaming: {
          "GET /prices/stream": "SSE stream of all token prices",
          "GET /prices/:token/stream": "SSE stream for specific token price",
        },
        simulation: {
          "POST /simulation/simulate": "Simulate transaction and get detailed results",
          "POST /simulation/estimate-cu": "Estimate compute units",
          "POST /simulation/estimate-fees": "Estimate transaction fees",
          "POST /simulation/validate": "Validate transaction before signing",
        },
        accounts: {
          "GET /accounts/custody-metas": "Get all custody remaining accounts",
          "GET /accounts/custody-metas/:token": "Get custody metas for specific token",
          "GET /accounts/oracles": "Get all oracle accounts",
          "GET /accounts/remaining/:instruction": "Get remaining accounts for instruction",
          "GET /accounts/token-accounts": "Get custody token accounts",
        },
        advancedFees: {
          "POST /fees/price-impact/detailed": "Calculate detailed price impact with delta imbalance",
        },
        liquidationScenarios: {
          "POST /positions/liquidation-scenario": "Analyze liquidation scenarios at various prices",
          "GET /positions/:positionPubkey/liquidation-scenario": "Quick liquidation scenario analysis",
        },
        history: {
          "GET /custodies/:token/funding-rate/history": "Get historical funding rates",
          "GET /analytics/volume/history": "Get historical trading volume",
          "GET /analytics/volume/stats": "Get volume statistics summary",
        },
        websocket: {
          "WS /ws/positions/:wallet": "Real-time position updates for wallet",
          "WS /ws/pool/aum": "Real-time pool AUM updates",
          "WS /ws/custodies": "Real-time all custody updates",
          "WS /ws/custodies/:token": "Real-time specific custody updates",
          "GET /ws/stats": "Get WebSocket connection statistics",
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
  await fastify.register(feeRoutes);
  await fastify.register(analyticsRoutes);
  await fastify.register(jlpRoutes);
  await fastify.register(positionRequestRoutes);
  await fastify.register(borrowRoutes);
  await fastify.register(walletRoutes);
  await fastify.register(pdaRoutes);
  await fastify.register(eventRoutes);
  await fastify.register(simulationRoutes);
  await fastify.register(remainingAccountsRoutes);
  await fastify.register(liquidationScenarioRoutes);
  await fastify.register(historyRoutes);
  await fastify.register(websocketRoutes);

  return fastify;
}

export default buildApp;
