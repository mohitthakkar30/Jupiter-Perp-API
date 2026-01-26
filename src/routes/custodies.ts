import { FastifyInstance } from "fastify";
import { getAllCustodies, getCustodyByToken } from "../services/custody.service";

export async function custodyRoutes(fastify: FastifyInstance) {
  // Get all custodies
  fastify.get("/custodies", async (request, reply) => {
    try {
      const custodies = await getAllCustodies();
      return { success: true, data: custodies };
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: "Failed to fetch custodies",
      });
    }
  });

  // Get specific custody by token
  fastify.get<{ Params: { token: string } }>(
    "/custodies/:token",
    async (request, reply) => {
      try {
        const { token } = request.params;
        const custody = await getCustodyByToken(token);

        if (!custody) {
          return reply.status(404).send({
            success: false,
            error: `Token ${token} not found. Available tokens: SOL, ETH, BTC, USDC, USDT`,
          });
        }

        return { success: true, data: custody };
      } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({
          success: false,
          error: "Failed to fetch custody data",
        });
      }
    }
  );
}
