import { FastifyInstance } from "fastify";
import {
  getAllPositionRequests,
  getPositionRequestsByWallet,
  getPositionRequestByPubkey,
  buildClosePositionRequestTransaction,
} from "../services/position-request.service";

interface ClosePositionRequestBody {
  positionRequestPubkey: string;
}

export async function positionRequestRoutes(fastify: FastifyInstance) {
  // Get all pending position requests
  fastify.get("/position-requests", async (request, reply) => {
    try {
      const requests = await getAllPositionRequests();
      return { success: true, data: requests };
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: "Failed to fetch position requests",
      });
    }
  });

  // Get position requests for a specific wallet
  fastify.get<{ Params: { wallet: string } }>(
    "/position-requests/wallet/:wallet",
    async (request, reply) => {
      try {
        const { wallet } = request.params;
        const requests = await getPositionRequestsByWallet(wallet);
        return { success: true, data: requests };
      } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({
          success: false,
          error: "Failed to fetch position requests for wallet",
        });
      }
    }
  );

  // Get specific position request by pubkey
  fastify.get<{ Params: { pubkey: string } }>(
    "/position-requests/:pubkey",
    async (request, reply) => {
      try {
        const { pubkey } = request.params;
        const positionRequest = await getPositionRequestByPubkey(pubkey);

        if (!positionRequest) {
          return reply.status(404).send({
            success: false,
            error: "Position request not found",
          });
        }

        return { success: true, data: positionRequest };
      } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({
          success: false,
          error: "Failed to fetch position request",
        });
      }
    }
  );

  // Build transaction to close a position request
  fastify.post<{ Body: ClosePositionRequestBody }>(
    "/position-requests/close",
    async (request, reply) => {
      try {
        const { positionRequestPubkey } = request.body;

        if (!positionRequestPubkey) {
          return reply.status(400).send({
            success: false,
            error: "Missing required field: positionRequestPubkey",
          });
        }

        const result = await buildClosePositionRequestTransaction({
          positionRequestPubkey,
        });

        return { success: true, data: result };
      } catch (error) {
        fastify.log.error(error);
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        return reply.status(500).send({
          success: false,
          error: `Failed to build close position request transaction: ${errorMessage}`,
        });
      }
    }
  );
}
