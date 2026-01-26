import { FastifyInstance } from "fastify";
import { getWalletSummary } from "../services/wallet.service";

export async function walletRoutes(fastify: FastifyInstance) {
  // Get wallet summary (positions, borrow positions, pending requests)
  fastify.get<{ Params: { wallet: string } }>(
    "/wallet/:wallet/summary",
    async (request, reply) => {
      try {
        const { wallet } = request.params;
        const summary = await getWalletSummary(wallet);
        return { success: true, data: summary };
      } catch (error) {
        fastify.log.error(error);
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        return reply.status(500).send({
          success: false,
          error: `Failed to fetch wallet summary: ${errorMessage}`,
        });
      }
    }
  );
}
