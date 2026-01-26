import { FastifyInstance } from "fastify";
import {
  getAllBorrowPositions,
  getBorrowPositionsByWallet,
  getBorrowPositionByPubkey,
  getBorrowRates,
} from "../services/borrow.service";

export async function borrowRoutes(fastify: FastifyInstance) {
  // Get all borrow positions
  fastify.get("/borrow/positions", async (request, reply) => {
    try {
      const positions = await getAllBorrowPositions();
      return { success: true, data: positions };
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: "Failed to fetch borrow positions",
      });
    }
  });

  // Get borrow positions for a specific wallet
  fastify.get<{ Params: { wallet: string } }>(
    "/borrow/positions/wallet/:wallet",
    async (request, reply) => {
      try {
        const { wallet } = request.params;
        const positions = await getBorrowPositionsByWallet(wallet);
        return { success: true, data: positions };
      } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({
          success: false,
          error: "Failed to fetch borrow positions for wallet",
        });
      }
    }
  );

  // Get specific borrow position by pubkey
  fastify.get<{ Params: { pubkey: string } }>(
    "/borrow/positions/:pubkey",
    async (request, reply) => {
      try {
        const { pubkey } = request.params;
        const position = await getBorrowPositionByPubkey(pubkey);

        if (!position) {
          return reply.status(404).send({
            success: false,
            error: "Borrow position not found",
          });
        }

        return { success: true, data: position };
      } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({
          success: false,
          error: "Failed to fetch borrow position",
        });
      }
    }
  );

  // Get borrow rates for a custody
  fastify.get<{ Params: { custody: string } }>(
    "/borrow/rates/:custody",
    async (request, reply) => {
      try {
        const { custody } = request.params;
        const rates = await getBorrowRates(custody);
        return { success: true, data: rates };
      } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({
          success: false,
          error: "Failed to fetch borrow rates",
        });
      }
    }
  );
}
