import { FastifyInstance } from "fastify";
import {
  simulateTransaction,
  estimateComputeUnits,
  estimateFees,
  validateTransaction,
  simulateWithFees,
} from "../services/simulation.service";

interface TransactionBody {
  transaction: string;
}

export async function simulationRoutes(fastify: FastifyInstance) {
  // Simulate a transaction and get detailed results
  fastify.post<{ Body: TransactionBody }>(
    "/simulation/simulate",
    async (request, reply) => {
      try {
        const { transaction } = request.body;

        if (!transaction) {
          return reply.status(400).send({
            success: false,
            error: "Missing required field: transaction (base64 encoded)",
          });
        }

        const result = await simulateWithFees(transaction);

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
          error: `Failed to simulate transaction: ${errorMessage}`,
        });
      }
    }
  );

  // Estimate compute units only
  fastify.post<{ Body: TransactionBody }>(
    "/simulation/estimate-cu",
    async (request, reply) => {
      try {
        const { transaction } = request.body;

        if (!transaction) {
          return reply.status(400).send({
            success: false,
            error: "Missing required field: transaction (base64 encoded)",
          });
        }

        const computeUnits = await estimateComputeUnits(transaction);

        return {
          success: true,
          data: {
            computeUnits,
            computeUnitsWithBuffer: Math.ceil(computeUnits * 1.1),
          },
        };
      } catch (error) {
        fastify.log.error(error);
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        return reply.status(500).send({
          success: false,
          error: `Failed to estimate compute units: ${errorMessage}`,
        });
      }
    }
  );

  // Estimate fees for a transaction
  fastify.post<{ Body: TransactionBody }>(
    "/simulation/estimate-fees",
    async (request, reply) => {
      try {
        const { transaction } = request.body;

        if (!transaction) {
          return reply.status(400).send({
            success: false,
            error: "Missing required field: transaction (base64 encoded)",
          });
        }

        const fees = await estimateFees(transaction);

        return {
          success: true,
          data: {
            ...fees,
            estimatedBaseFeeSOL: fees.estimatedBaseFee / 1_000_000_000,
            recommendedPriorityFeeSOL: fees.recommendedPriorityFee / 1_000_000_000,
            totalEstimatedFeeSOL: fees.totalEstimatedFee / 1_000_000_000,
          },
        };
      } catch (error) {
        fastify.log.error(error);
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        return reply.status(500).send({
          success: false,
          error: `Failed to estimate fees: ${errorMessage}`,
        });
      }
    }
  );

  // Validate a transaction without simulating
  fastify.post<{ Body: TransactionBody }>(
    "/simulation/validate",
    async (request, reply) => {
      try {
        const { transaction } = request.body;

        if (!transaction) {
          return reply.status(400).send({
            success: false,
            error: "Missing required field: transaction (base64 encoded)",
          });
        }

        const validation = await validateTransaction(transaction);

        return {
          success: true,
          data: validation,
        };
      } catch (error) {
        fastify.log.error(error);
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        return reply.status(500).send({
          success: false,
          error: `Failed to validate transaction: ${errorMessage}`,
        });
      }
    }
  );
}
