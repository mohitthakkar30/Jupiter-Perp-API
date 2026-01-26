import { FastifyInstance } from "fastify";
import {
  getOpenCloseBaseFees,
  getOpenFeeForCustody,
  getCloseFeeForCustody,
  calculatePriceImpactFee,
  calculateSwapFee,
} from "../services/fee.service";

interface SwapFeeBody {
  inputToken: string;
  outputToken: string;
  amountIn: string;
}

interface PriceImpactBody {
  custody: string;
  tradeSizeUsd: string;
  isIncrease?: boolean;
}

export async function feeRoutes(fastify: FastifyInstance) {
  // Get base open/close fees for all custodies
  fastify.get("/fees/open-close-base", async (request, reply) => {
    try {
      const fees = await getOpenCloseBaseFees();
      return { success: true, data: fees };
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: "Failed to fetch open/close base fees",
      });
    }
  });

  // Get open position fee for specific custody
  fastify.get<{ Params: { custody: string }; Querystring: { tradeSizeUsd?: string } }>(
    "/fees/open/:custody",
    async (request, reply) => {
      try {
        const { custody } = request.params;
        const tradeSizeUsd = request.query.tradeSizeUsd || "1000000000"; // Default 1000 USD

        const fee = await getOpenFeeForCustody(custody, tradeSizeUsd);
        return { success: true, data: fee };
      } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({
          success: false,
          error: "Failed to calculate open position fee",
        });
      }
    }
  );

  // Get close position fee for specific custody
  fastify.get<{ Params: { custody: string }; Querystring: { tradeSizeUsd?: string } }>(
    "/fees/close/:custody",
    async (request, reply) => {
      try {
        const { custody } = request.params;
        const tradeSizeUsd = request.query.tradeSizeUsd || "1000000000"; // Default 1000 USD

        const fee = await getCloseFeeForCustody(custody, tradeSizeUsd);
        return { success: true, data: fee };
      } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({
          success: false,
          error: "Failed to calculate close position fee",
        });
      }
    }
  );

  // Calculate price impact fee
  fastify.post<{ Body: PriceImpactBody }>(
    "/fees/price-impact",
    async (request, reply) => {
      try {
        const { custody, tradeSizeUsd, isIncrease = true } = request.body;

        if (!custody || !tradeSizeUsd) {
          return reply.status(400).send({
            success: false,
            error: "Missing required fields: custody, tradeSizeUsd",
          });
        }

        const fee = await calculatePriceImpactFee(custody, tradeSizeUsd, isIncrease);
        return { success: true, data: fee };
      } catch (error) {
        fastify.log.error(error);
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        return reply.status(500).send({
          success: false,
          error: `Failed to calculate price impact fee: ${errorMessage}`,
        });
      }
    }
  );

  // Calculate swap fee
  fastify.post<{ Body: SwapFeeBody }>("/fees/swap", async (request, reply) => {
    try {
      const { inputToken, outputToken, amountIn } = request.body;

      if (!inputToken || !outputToken || !amountIn) {
        return reply.status(400).send({
          success: false,
          error: "Missing required fields: inputToken, outputToken, amountIn",
        });
      }

      const result = await calculateSwapFee({ inputToken, outputToken, amountIn });
      return { success: true, data: result };
    } catch (error) {
      fastify.log.error(error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      return reply.status(500).send({
        success: false,
        error: `Failed to calculate swap fee: ${errorMessage}`,
      });
    }
  });
}
