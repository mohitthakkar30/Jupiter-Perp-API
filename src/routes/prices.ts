import { FastifyInstance, FastifyReply } from "fastify";
import { getAllPrices, getOraclePriceByToken, fetchOraclePrices } from "../services/oracle.service";

// SSE helper to send events
function sendSSE(reply: FastifyReply, event: string, data: unknown) {
  reply.raw.write(`event: ${event}\n`);
  reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
}

export async function priceRoutes(fastify: FastifyInstance) {
  // Get all token prices
  fastify.get("/prices", async (request, reply) => {
    try {
      const prices = await getAllPrices();
      return { success: true, data: prices };
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: "Failed to fetch prices",
      });
    }
  });

  // Get specific token price
  fastify.get<{ Params: { token: string } }>(
    "/prices/:token",
    async (request, reply) => {
      try {
        const { token } = request.params;
        const price = await getOraclePriceByToken(token);

        if (!price) {
          return reply.status(404).send({
            success: false,
            error: `Token ${token} not found. Available tokens: SOL, ETH, BTC, USDC, USDT`,
          });
        }

        return { success: true, data: price };
      } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({
          success: false,
          error: "Failed to fetch token price",
        });
      }
    }
  );

  // SSE stream for all prices
  fastify.get<{ Querystring: { interval?: string } }>(
    "/prices/stream",
    async (request, reply) => {
      const intervalMs = request.query.interval
        ? parseInt(request.query.interval)
        : 1000; // Default 1 second

      // Set SSE headers
      reply.raw.setHeader("Content-Type", "text/event-stream");
      reply.raw.setHeader("Cache-Control", "no-cache");
      reply.raw.setHeader("Connection", "keep-alive");
      reply.raw.setHeader("Access-Control-Allow-Origin", "*");
      reply.raw.flushHeaders();

      // Send initial prices
      try {
        const prices = await getAllPrices();
        sendSSE(reply, "prices", { prices, timestamp: Date.now() });
      } catch (error) {
        sendSSE(reply, "error", { message: "Failed to fetch initial prices" });
      }

      // Set up polling interval
      const interval = setInterval(async () => {
        try {
          // Force fresh fetch
          await fetchOraclePrices();
          const prices = await getAllPrices();
          sendSSE(reply, "prices", { prices, timestamp: Date.now() });
        } catch (error) {
          sendSSE(reply, "error", { message: "Failed to fetch prices" });
        }
      }, intervalMs);

      // Handle client disconnect
      request.raw.on("close", () => {
        clearInterval(interval);
        reply.raw.end();
      });

      // Keep connection alive
      const keepAlive = setInterval(() => {
        reply.raw.write(":keepalive\n\n");
      }, 15000);

      request.raw.on("close", () => {
        clearInterval(keepAlive);
      });
    }
  );

  // SSE stream for specific token price
  fastify.get<{ Params: { token: string }; Querystring: { interval?: string } }>(
    "/prices/:token/stream",
    async (request, reply) => {
      const { token } = request.params;
      const intervalMs = request.query.interval
        ? parseInt(request.query.interval)
        : 1000; // Default 1 second

      // Validate token
      const validTokens = ["SOL", "ETH", "BTC", "USDC", "USDT"];
      if (!validTokens.includes(token.toUpperCase())) {
        return reply.status(400).send({
          success: false,
          error: `Invalid token. Available tokens: ${validTokens.join(", ")}`,
        });
      }

      // Set SSE headers
      reply.raw.setHeader("Content-Type", "text/event-stream");
      reply.raw.setHeader("Cache-Control", "no-cache");
      reply.raw.setHeader("Connection", "keep-alive");
      reply.raw.setHeader("Access-Control-Allow-Origin", "*");
      reply.raw.flushHeaders();

      // Send initial price
      try {
        const price = await getOraclePriceByToken(token);
        if (price) {
          sendSSE(reply, "price", { ...price, timestamp: Date.now() });
        }
      } catch (error) {
        sendSSE(reply, "error", { message: "Failed to fetch initial price" });
      }

      // Set up polling interval
      const interval = setInterval(async () => {
        try {
          await fetchOraclePrices();
          const price = await getOraclePriceByToken(token);
          if (price) {
            sendSSE(reply, "price", { ...price, timestamp: Date.now() });
          }
        } catch (error) {
          sendSSE(reply, "error", { message: "Failed to fetch price" });
        }
      }, intervalMs);

      // Handle client disconnect
      request.raw.on("close", () => {
        clearInterval(interval);
        reply.raw.end();
      });

      // Keep connection alive
      const keepAlive = setInterval(() => {
        reply.raw.write(":keepalive\n\n");
      }, 15000);

      request.raw.on("close", () => {
        clearInterval(keepAlive);
      });
    }
  );
}
