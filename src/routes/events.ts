import { FastifyInstance } from "fastify";
import {
  getPerpetualsEvents,
  getTradeEvents,
  getTradeEventsByWallet,
  getLiquidationEvents,
  getLiquidationEventsByWallet,
  getTpslEvents,
} from "../services/events.service";

interface EventsQuerystring {
  limit?: string;
  before?: string;
}

export async function eventRoutes(fastify: FastifyInstance) {
  // Get all perpetuals events
  fastify.get<{ Querystring: EventsQuerystring }>(
    "/events",
    async (request, reply) => {
      try {
        const limit = request.query.limit ? parseInt(request.query.limit) : 50;
        const before = request.query.before;

        const events = await getPerpetualsEvents({ limit, before });
        return {
          success: true,
          data: {
            events,
            count: events.length,
          },
        };
      } catch (error) {
        fastify.log.error(error);
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        return reply.status(500).send({
          success: false,
          error: `Failed to fetch events: ${errorMessage}`,
        });
      }
    }
  );

  // Get trade events (increase/decrease position)
  fastify.get<{ Querystring: EventsQuerystring }>(
    "/events/trades",
    async (request, reply) => {
      try {
        const limit = request.query.limit ? parseInt(request.query.limit) : 50;
        const before = request.query.before;

        const events = await getTradeEvents({ limit, before });
        return {
          success: true,
          data: {
            events,
            count: events.length,
          },
        };
      } catch (error) {
        fastify.log.error(error);
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        return reply.status(500).send({
          success: false,
          error: `Failed to fetch trade events: ${errorMessage}`,
        });
      }
    }
  );

  // Get trade events by wallet
  fastify.get<{ Params: { wallet: string }; Querystring: EventsQuerystring }>(
    "/events/trades/:wallet",
    async (request, reply) => {
      try {
        const { wallet } = request.params;
        const limit = request.query.limit ? parseInt(request.query.limit) : 50;
        const before = request.query.before;

        const events = await getTradeEventsByWallet(wallet, { limit, before });
        return {
          success: true,
          data: {
            wallet,
            events,
            count: events.length,
          },
        };
      } catch (error) {
        fastify.log.error(error);
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        return reply.status(500).send({
          success: false,
          error: `Failed to fetch trade events for wallet: ${errorMessage}`,
        });
      }
    }
  );

  // Get liquidation events
  fastify.get<{ Querystring: EventsQuerystring }>(
    "/events/liquidations",
    async (request, reply) => {
      try {
        const limit = request.query.limit ? parseInt(request.query.limit) : 50;
        const before = request.query.before;

        const events = await getLiquidationEvents({ limit, before });
        return {
          success: true,
          data: {
            events,
            count: events.length,
          },
        };
      } catch (error) {
        fastify.log.error(error);
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        return reply.status(500).send({
          success: false,
          error: `Failed to fetch liquidation events: ${errorMessage}`,
        });
      }
    }
  );

  // Get liquidation events by wallet
  fastify.get<{ Params: { wallet: string }; Querystring: EventsQuerystring }>(
    "/events/liquidations/:wallet",
    async (request, reply) => {
      try {
        const { wallet } = request.params;
        const limit = request.query.limit ? parseInt(request.query.limit) : 50;
        const before = request.query.before;

        const events = await getLiquidationEventsByWallet(wallet, { limit, before });
        return {
          success: true,
          data: {
            wallet,
            events,
            count: events.length,
          },
        };
      } catch (error) {
        fastify.log.error(error);
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        return reply.status(500).send({
          success: false,
          error: `Failed to fetch liquidation events for wallet: ${errorMessage}`,
        });
      }
    }
  );

  // Get TPSL (Take Profit / Stop Loss) execution events
  fastify.get<{ Querystring: EventsQuerystring }>(
    "/events/tpsl",
    async (request, reply) => {
      try {
        const limit = request.query.limit ? parseInt(request.query.limit) : 50;
        const before = request.query.before;

        const events = await getTpslEvents({ limit, before });
        return {
          success: true,
          data: {
            events,
            count: events.length,
          },
        };
      } catch (error) {
        fastify.log.error(error);
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        return reply.status(500).send({
          success: false,
          error: `Failed to fetch TPSL events: ${errorMessage}`,
        });
      }
    }
  );
}
