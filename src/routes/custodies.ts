import { FastifyInstance } from "fastify";
import { getAllCustodies, getCustodyByToken, getCustodyFundingRate, getCustodyUtilization } from "../services/custody.service";

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

  // Get funding rate for a specific custody
  fastify.get<{ Params: { token: string } }>(
    "/custodies/:token/funding-rate",
    async (request, reply) => {
      try {
        const { token } = request.params;
        const fundingRate = await getCustodyFundingRate(token);

        if (!fundingRate) {
          return reply.status(404).send({
            success: false,
            error: `Token ${token} not found`,
          });
        }

        return { success: true, data: fundingRate };
      } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({
          success: false,
          error: "Failed to fetch funding rate",
        });
      }
    }
  );

  // Get utilization for a specific custody
  fastify.get<{ Params: { token: string } }>(
    "/custodies/:token/utilization",
    async (request, reply) => {
      try {
        const { token } = request.params;
        const utilization = await getCustodyUtilization(token);

        if (!utilization) {
          return reply.status(404).send({
            success: false,
            error: `Token ${token} not found`,
          });
        }

        return { success: true, data: utilization };
      } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({
          success: false,
          error: "Failed to fetch custody utilization",
        });
      }
    }
  );
}
