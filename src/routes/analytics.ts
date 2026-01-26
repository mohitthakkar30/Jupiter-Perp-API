import { FastifyInstance } from "fastify";
import {
  getGlobalLongUnrealizedPnl,
  getGlobalShortUnrealizedPnl,
  getGlobalLongPnlEstimate,
  getGlobalShortPnlEstimate,
  getDetailedAum,
  getPoolUtilization,
} from "../services/analytics.service";

export async function analyticsRoutes(fastify: FastifyInstance) {
  // Get global unrealized PnL for long positions
  fastify.get("/analytics/global-pnl/longs", async (request, reply) => {
    try {
      const pnl = await getGlobalLongUnrealizedPnl();
      return { success: true, data: pnl };
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: "Failed to calculate global long PnL",
      });
    }
  });

  // Get global unrealized PnL for short positions
  fastify.get("/analytics/global-pnl/shorts", async (request, reply) => {
    try {
      const pnl = await getGlobalShortUnrealizedPnl();
      return { success: true, data: pnl };
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: "Failed to calculate global short PnL",
      });
    }
  });

  // Get estimated global long PnL (faster)
  fastify.get("/analytics/global-pnl/estimate/longs", async (request, reply) => {
    try {
      const pnl = await getGlobalLongPnlEstimate();
      return { success: true, data: pnl };
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: "Failed to calculate estimated long PnL",
      });
    }
  });

  // Get estimated global short PnL (faster)
  fastify.get("/analytics/global-pnl/estimate/shorts", async (request, reply) => {
    try {
      const pnl = await getGlobalShortPnlEstimate();
      return { success: true, data: pnl };
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: "Failed to calculate estimated short PnL",
      });
    }
  });

  // Get detailed AUM breakdown by custody
  fastify.get("/analytics/pool/aum/detailed", async (request, reply) => {
    try {
      const aum = await getDetailedAum();
      return { success: true, data: aum };
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: "Failed to get detailed AUM",
      });
    }
  });

  // Get pool utilization by custody
  fastify.get("/analytics/pool/utilization", async (request, reply) => {
    try {
      const utilization = await getPoolUtilization();
      return { success: true, data: utilization };
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: "Failed to get pool utilization",
      });
    }
  });
}
