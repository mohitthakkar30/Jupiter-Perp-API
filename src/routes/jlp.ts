import { FastifyInstance } from "fastify";
import { getJlpVirtualPrice } from "../services/pool.service";
import { calculateMintJlp, calculateBurnJlp } from "../services/jlp.service";

interface MintJlpBody {
  inputToken: string;
  inputAmount: string;
}

interface BurnJlpBody {
  outputToken: string;
  jlpAmount: string;
}

export async function jlpRoutes(fastify: FastifyInstance) {
  // Get JLP virtual price (already exists, moved here for organization)
  // fastify.get("/jlp/price", async (request, reply) => {
  //   try {
  //     const price = await getJlpVirtualPrice();
  //     return { success: true, data: price };
  //   } catch (error) {
  //     fastify.log.error(error);
  //     return reply.status(500).send({
  //       success: false,
  //       error: "Failed to fetch JLP price",
  //     });
  //   }
  // });

  // Calculate JLP tokens received for depositing liquidity
  fastify.post<{ Body: MintJlpBody }>("/jlp/calculate-mint", async (request, reply) => {
    try {
      const { inputToken, inputAmount } = request.body;

      if (!inputToken || !inputAmount) {
        return reply.status(400).send({
          success: false,
          error: "Missing required fields: inputToken, inputAmount",
        });
      }

      const result = await calculateMintJlp({ inputToken, inputAmount });
      return { success: true, data: result };
    } catch (error) {
      fastify.log.error(error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      return reply.status(500).send({
        success: false,
        error: `Failed to calculate JLP mint: ${errorMessage}`,
      });
    }
  });

  // Calculate tokens received for burning JLP
  fastify.post<{ Body: BurnJlpBody }>("/jlp/calculate-burn", async (request, reply) => {
    try {
      const { outputToken, jlpAmount } = request.body;

      if (!outputToken || !jlpAmount) {
        return reply.status(400).send({
          success: false,
          error: "Missing required fields: outputToken, jlpAmount",
        });
      }

      const result = await calculateBurnJlp({ outputToken, jlpAmount });
      return { success: true, data: result };
    } catch (error) {
      fastify.log.error(error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      return reply.status(500).send({
        success: false,
        error: `Failed to calculate JLP burn: ${errorMessage}`,
      });
    }
  });
}
