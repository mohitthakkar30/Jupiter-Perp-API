import { FastifyInstance } from "fastify";
import {
  getAllOpenPositions,
  getPositionsForWallet,
  getPositionByPubkey,
  calculatePositionPnl,
  calculateLiquidationPrice,
  calculateBorrowFee,
} from "../services/position.service";

export async function positionRoutes(fastify: FastifyInstance) {
  // Get all open positions
  fastify.get("/positions", async (request, reply) => {
    try {
      const positions = await getAllOpenPositions();
      return { success: true, data: positions };
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: "Failed to fetch positions",
      });
    }
  });

  // Get positions for specific wallet
  fastify.get<{ Params: { wallet: string } }>(
    "/positions/:wallet",
    async (request, reply) => {
      try {
        const { wallet } = request.params;
        const positions = await getPositionsForWallet(wallet);
        return { success: true, data: positions };
      } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({
          success: false,
          error: "Failed to fetch positions for wallet",
        });
      }
    }
  );

  // Get specific position by pubkey
  fastify.get<{ Params: { wallet: string; positionPubkey: string } }>(
    "/positions/:wallet/:positionPubkey",
    async (request, reply) => {
      try {
        const { positionPubkey } = request.params;
        const position = await getPositionByPubkey(positionPubkey);

        if (!position) {
          return reply.status(404).send({
            success: false,
            error: "Position not found",
          });
        }

        return { success: true, data: position };
      } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({
          success: false,
          error: "Failed to fetch position",
        });
      }
    }
  );

  // Calculate PnL for a position
  fastify.get<{ Params: { positionPubkey: string } }>(
    "/positions/pnl/:positionPubkey",
    async (request, reply) => {
      try {
        const { positionPubkey } = request.params;
        const pnl = await calculatePositionPnl(positionPubkey);
        return { success: true, data: pnl };
      } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({
          success: false,
          error: "Failed to calculate PnL",
        });
      }
    }
  );

  // Calculate liquidation price for a position
  fastify.get<{ Params: { positionPubkey: string } }>(
    "/positions/liquidation/:positionPubkey",
    async (request, reply) => {
      try {
        const { positionPubkey } = request.params;
        const liquidation = await calculateLiquidationPrice(positionPubkey);
        return { success: true, data: liquidation };
      } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({
          success: false,
          error: "Failed to calculate liquidation price",
        });
      }
    }
  );

  // Calculate borrow fee for a position
  fastify.get<{ Params: { positionPubkey: string } }>(
    "/positions/borrow-fee/:positionPubkey",
    async (request, reply) => {
      try {
        const { positionPubkey } = request.params;
        const borrowFee = await calculateBorrowFee(positionPubkey);
        return { success: true, data: borrowFee };
      } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({
          success: false,
          error: "Failed to calculate borrow fee",
        });
      }
    }
  );
}
