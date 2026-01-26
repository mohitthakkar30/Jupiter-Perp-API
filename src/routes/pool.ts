import { FastifyInstance } from "fastify";
import {
  getPoolResponse,
  getPoolAum,
  getPoolApy,
  getJlpVirtualPrice,
} from "../services/pool.service";

export async function poolRoutes(fastify: FastifyInstance) {
  // Get full pool data
  fastify.get("/pool", async (request, reply) => {
    try {
      const pool = await getPoolResponse();
      return { success: true, data: pool };
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: "Failed to fetch pool data",
      });
    }
  });

  // Get pool AUM
  fastify.get("/pool/aum", async (request, reply) => {
    try {
      const aum = await getPoolAum();
      return { success: true, data: aum };
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: "Failed to fetch pool AUM",
      });
    }
  });

  // Get pool APY
  fastify.get("/pool/apy", async (request, reply) => {
    try {
      const apy = await getPoolApy();
      return { success: true, data: apy };
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: "Failed to fetch pool APY",
      });
    }
  });

  // Get JLP virtual price
  fastify.get("/jlp/price", async (request, reply) => {
    try {
      const price = await getJlpVirtualPrice();
      return { success: true, data: price };
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: "Failed to fetch JLP price",
      });
    }
  });
}
