import { FastifyInstance } from "fastify";
import { getAllPrices, getOraclePriceByToken } from "../services/oracle.service";

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
}
