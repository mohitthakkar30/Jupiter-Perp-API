import { FastifyInstance } from "fastify";
import {
  getCustodyMetas,
  getCustodyMetasForToken,
  getAllOracleAccounts,
  getRemainingAccountsForInstruction,
  getCustodyTokenAccounts,
} from "../services/remaining-accounts.service";

export async function remainingAccountsRoutes(fastify: FastifyInstance) {
  // Get all custody remaining accounts (for instructions that need remainingAccounts)
  fastify.get("/accounts/custody-metas", async (request, reply) => {
    try {
      const result = await getCustodyMetas();
      return { success: true, data: result };
    } catch (error) {
      fastify.log.error(error);
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return reply.status(500).send({
        success: false,
        error: `Failed to fetch custody metas: ${errorMessage}`,
      });
    }
  });

  // Get custody metas for a specific token
  fastify.get<{ Params: { token: string } }>(
    "/accounts/custody-metas/:token",
    async (request, reply) => {
      try {
        const { token } = request.params;
        const metas = await getCustodyMetasForToken(token);
        return {
          success: true,
          data: {
            token: token.toUpperCase(),
            metas,
            count: metas.length,
          },
        };
      } catch (error) {
        fastify.log.error(error);
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        return reply.status(500).send({
          success: false,
          error: `Failed to fetch custody metas for token: ${errorMessage}`,
        });
      }
    }
  );

  // Get all oracle accounts
  fastify.get("/accounts/oracles", async (request, reply) => {
    try {
      const result = getAllOracleAccounts();
      return { success: true, data: result };
    } catch (error) {
      fastify.log.error(error);
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return reply.status(500).send({
        success: false,
        error: `Failed to fetch oracle accounts: ${errorMessage}`,
      });
    }
  });

  // Get remaining accounts for a specific instruction type
  fastify.get<{ Params: { instruction: string } }>(
    "/accounts/remaining/:instruction",
    async (request, reply) => {
      try {
        const { instruction } = request.params;
        const validInstructions = [
          "addLiquidity",
          "removeLiquidity",
          "increasePosition",
          "decreasePosition",
          "swap",
        ];

        if (!validInstructions.includes(instruction)) {
          return reply.status(400).send({
            success: false,
            error: `Invalid instruction. Valid options: ${validInstructions.join(", ")}`,
          });
        }

        const metas = await getRemainingAccountsForInstruction(
          instruction as
            | "addLiquidity"
            | "removeLiquidity"
            | "increasePosition"
            | "decreasePosition"
            | "swap"
        );

        return {
          success: true,
          data: {
            instruction,
            remainingAccounts: metas,
            count: metas.length,
          },
        };
      } catch (error) {
        fastify.log.error(error);
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        return reply.status(500).send({
          success: false,
          error: `Failed to fetch remaining accounts: ${errorMessage}`,
        });
      }
    }
  );

  // Get custody token accounts
  fastify.get("/accounts/token-accounts", async (request, reply) => {
    try {
      const accounts = getCustodyTokenAccounts();
      return {
        success: true,
        data: {
          tokenAccounts: accounts,
          count: accounts.length,
        },
      };
    } catch (error) {
      fastify.log.error(error);
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return reply.status(500).send({
        success: false,
        error: `Failed to fetch token accounts: ${errorMessage}`,
      });
    }
  });
}
