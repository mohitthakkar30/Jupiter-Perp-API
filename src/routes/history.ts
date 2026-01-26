import { FastifyInstance } from "fastify";
import {
  getFundingRateHistory,
  getVolumeHistory,
  getVolumeStats,
  FundingRateHistoryParams,
  VolumeHistoryParams,
} from "../services/history.service";

interface FundingRateHistoryQuery {
  limit?: string;
  before?: string;
  interval?: "hourly" | "daily";
}

interface VolumeHistoryQuery {
  limit?: string;
  interval?: "hourly" | "daily" | "weekly";
  token?: string;
  before?: string;
}

interface VolumeStatsQuery {
  token?: string;
  days?: string;
}

export async function historyRoutes(fastify: FastifyInstance) {
  // Get funding rate history for a token
  fastify.get<{
    Params: { token: string };
    Querystring: FundingRateHistoryQuery;
  }>("/custodies/:token/funding-rate/history", async (request, reply) => {
    try {
      const { token } = request.params;
      const { limit, before, interval } = request.query;

      const params: FundingRateHistoryParams = {};

      if (limit) {
        params.limit = parseInt(limit, 10);
        if (isNaN(params.limit) || params.limit < 1) {
          return reply.status(400).send({
            success: false,
            error: "Invalid limit parameter",
          });
        }
      }

      if (before) {
        params.before = before;
      }

      if (interval) {
        if (interval !== "hourly" && interval !== "daily") {
          return reply.status(400).send({
            success: false,
            error: "Invalid interval. Must be 'hourly' or 'daily'",
          });
        }
        params.interval = interval;
      }

      const history = await getFundingRateHistory(token, params);

      return {
        success: true,
        data: {
          token: token.toUpperCase(),
          interval: params.interval || "hourly",
          count: history.length,
          history,
        },
      };
    } catch (error) {
      fastify.log.error(error);
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return reply.status(500).send({
        success: false,
        error: `Failed to fetch funding rate history: ${errorMessage}`,
      });
    }
  });

  // Get volume history
  fastify.get<{ Querystring: VolumeHistoryQuery }>(
    "/analytics/volume/history",
    async (request, reply) => {
      try {
        const { limit, interval, token, before } = request.query;

        const params: VolumeHistoryParams = {};

        if (limit) {
          params.limit = parseInt(limit, 10);
          if (isNaN(params.limit) || params.limit < 1) {
            return reply.status(400).send({
              success: false,
              error: "Invalid limit parameter",
            });
          }
        }

        if (interval) {
          if (
            interval !== "hourly" &&
            interval !== "daily" &&
            interval !== "weekly"
          ) {
            return reply.status(400).send({
              success: false,
              error: "Invalid interval. Must be 'hourly', 'daily', or 'weekly'",
            });
          }
          params.interval = interval;
        }

        if (token) {
          params.token = token;
        }

        if (before) {
          params.before = before;
        }

        const history = await getVolumeHistory(params);

        return {
          success: true,
          data: {
            interval: params.interval || "daily",
            token: params.token?.toUpperCase() || "ALL",
            count: history.length,
            history,
          },
        };
      } catch (error) {
        fastify.log.error(error);
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        return reply.status(500).send({
          success: false,
          error: `Failed to fetch volume history: ${errorMessage}`,
        });
      }
    }
  );

  // Get volume statistics summary
  fastify.get<{ Querystring: VolumeStatsQuery }>(
    "/analytics/volume/stats",
    async (request, reply) => {
      try {
        const { token, days } = request.query;

        const params: { token?: string; days?: number } = {};

        if (token) {
          params.token = token;
        }

        if (days) {
          params.days = parseInt(days, 10);
          if (isNaN(params.days) || params.days < 1 || params.days > 30) {
            return reply.status(400).send({
              success: false,
              error: "Invalid days parameter. Must be between 1 and 30",
            });
          }
        }

        const stats = await getVolumeStats(params);

        return {
          success: true,
          data: {
            period: `${params.days || 7} days`,
            token: params.token?.toUpperCase() || "ALL",
            ...stats,
          },
        };
      } catch (error) {
        fastify.log.error(error);
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        return reply.status(500).send({
          success: false,
          error: `Failed to fetch volume stats: ${errorMessage}`,
        });
      }
    }
  );
}
