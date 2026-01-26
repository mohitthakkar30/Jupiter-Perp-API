import { FastifyInstance } from "fastify";
import {
  buildIncreasePositionTransaction,
  buildDecreasePositionTransaction,
  IncreasePositionParams,
  DecreasePositionParams,
} from "../services/trade.service";

interface IncreasePositionBody {
  owner: string;
  inputMint: string;
  custody: string;
  collateralCustody: string;
  side: "long" | "short";
  sizeUsd: string;
  collateralAmount: string;
  priceSlippage?: string;
}

interface DecreasePositionBody {
  owner: string;
  positionPubkey: string;
  desiredMint: string;
  entirePosition?: boolean;
  sizeUsdDelta?: string;
  collateralUsdDelta?: string;
  priceSlippage?: string;
}

export async function tradeRoutes(fastify: FastifyInstance) {
  // Create increase position transaction
  fastify.post<{ Body: IncreasePositionBody }>(
    "/trade/increase-position",
    async (request, reply) => {
      try {
        const {
          owner,
          inputMint,
          custody,
          collateralCustody,
          side,
          sizeUsd,
          collateralAmount,
          priceSlippage,
        } = request.body;

        // Validate required fields
        if (
          !owner ||
          !inputMint ||
          !custody ||
          !collateralCustody ||
          !side ||
          !sizeUsd ||
          !collateralAmount
        ) {
          return reply.status(400).send({
            success: false,
            error:
              "Missing required fields: owner, inputMint, custody, collateralCustody, side, sizeUsd, collateralAmount",
          });
        }

        if (side !== "long" && side !== "short") {
          return reply.status(400).send({
            success: false,
            error: 'Invalid side. Must be "long" or "short"',
          });
        }

        const params: IncreasePositionParams = {
          owner,
          inputMint,
          custody,
          collateralCustody,
          side,
          sizeUsd,
          collateralAmount,
          priceSlippage,
        };

        const result = await buildIncreasePositionTransaction(params);

        return {
          success: true,
          data: result,
        };
      } catch (error) {
        fastify.log.error(error);
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        return reply.status(500).send({
          success: false,
          error: `Failed to build increase position transaction: ${errorMessage}`,
        });
      }
    }
  );

  // Create decrease position transaction
  fastify.post<{ Body: DecreasePositionBody }>(
    "/trade/decrease-position",
    async (request, reply) => {
      try {
        const {
          owner,
          positionPubkey,
          desiredMint,
          entirePosition,
          sizeUsdDelta,
          collateralUsdDelta,
          priceSlippage,
        } = request.body;

        // Validate required fields
        if (!owner || !positionPubkey || !desiredMint) {
          return reply.status(400).send({
            success: false,
            error:
              "Missing required fields: owner, positionPubkey, desiredMint",
          });
        }

        const params: DecreasePositionParams = {
          owner,
          positionPubkey,
          desiredMint,
          entirePosition,
          sizeUsdDelta,
          collateralUsdDelta,
          priceSlippage,
        };

        const result = await buildDecreasePositionTransaction(params);

        return {
          success: true,
          data: result,
        };
      } catch (error) {
        fastify.log.error(error);
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        return reply.status(500).send({
          success: false,
          error: `Failed to build decrease position transaction: ${errorMessage}`,
        });
      }
    }
  );
}
