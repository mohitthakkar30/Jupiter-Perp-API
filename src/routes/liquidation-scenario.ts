import { FastifyInstance } from "fastify";
import {
  analyzeLiquidationScenarios,
  ScenarioOptions,
} from "../services/liquidation-scenario.service";

interface LiquidationScenarioBody {
  positionPubkey: string;
  priceScenarios?: number[];
  percentageScenarios?: number[];
  timeHorizon?: number;
}

export async function liquidationScenarioRoutes(fastify: FastifyInstance) {
  // Analyze liquidation scenarios for a position
  fastify.post<{ Body: LiquidationScenarioBody }>(
    "/positions/liquidation-scenario",
    async (request, reply) => {
      try {
        const { positionPubkey, priceScenarios, percentageScenarios, timeHorizon } =
          request.body;

        if (!positionPubkey) {
          return reply.status(400).send({
            success: false,
            error: "Missing required field: positionPubkey",
          });
        }

        const options: ScenarioOptions = {};

        if (priceScenarios && Array.isArray(priceScenarios)) {
          options.priceScenarios = priceScenarios;
        }

        if (percentageScenarios && Array.isArray(percentageScenarios)) {
          options.percentageScenarios = percentageScenarios;
        }

        if (timeHorizon && typeof timeHorizon === "number") {
          options.timeHorizon = timeHorizon;
        }

        const result = await analyzeLiquidationScenarios(positionPubkey, options);

        return { success: true, data: result };
      } catch (error) {
        fastify.log.error(error);
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        return reply.status(500).send({
          success: false,
          error: `Failed to analyze liquidation scenarios: ${errorMessage}`,
        });
      }
    }
  );

  // GET endpoint for quick analysis with default scenarios
  fastify.get<{ Params: { positionPubkey: string } }>(
    "/positions/:positionPubkey/liquidation-scenario",
    async (request, reply) => {
      try {
        const { positionPubkey } = request.params;

        const result = await analyzeLiquidationScenarios(positionPubkey);

        return { success: true, data: result };
      } catch (error) {
        fastify.log.error(error);
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        return reply.status(500).send({
          success: false,
          error: `Failed to analyze liquidation scenarios: ${errorMessage}`,
        });
      }
    }
  );
}
