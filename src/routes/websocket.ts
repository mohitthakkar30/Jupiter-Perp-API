import { FastifyInstance, FastifyRequest } from "fastify";
import {
  subscribeToPositionChanges,
  subscribeToPoolChanges,
  subscribeToCustodyChanges,
  unsubscribe,
  getActiveSubscriptionCount,
} from "../services/websocket.service";

// Track WebSocket connections
const wsConnections = new Map<
  string,
  { socket: any; subscriptionIds: number[] }
>();
let connectionIdCounter = 0;

export async function websocketRoutes(fastify: FastifyInstance) {
  // WebSocket endpoint for position updates
  fastify.get<{ Params: { wallet: string } }>(
    "/ws/positions/:wallet",
    { websocket: true },
    (socket, request) => {
      const { wallet } = request.params;
      const connectionId = `pos_${++connectionIdCounter}`;

      fastify.log.info(`WebSocket connection opened: ${connectionId} for wallet ${wallet}`);

      // Send initial connection message
      socket.send(
        JSON.stringify({
          type: "connected",
          timestamp: Date.now(),
          message: `Subscribed to position updates for wallet: ${wallet}`,
        })
      );

      // Subscribe to position changes
      let subscriptionId: number | null = null;
      try {
        subscriptionId = subscribeToPositionChanges(
          wallet,
          (update) => {
            try {
              socket.send(JSON.stringify(update));
            } catch {
              // Socket may be closed
            }
          },
          (error) => {
            fastify.log.error(`Position subscription error: ${error.message}`);
            try {
              socket.send(
                JSON.stringify({
                  type: "error",
                  timestamp: Date.now(),
                  message: error.message,
                })
              );
            } catch {
              // Socket may be closed
            }
          }
        );

        wsConnections.set(connectionId, {
          socket,
          subscriptionIds: subscriptionId ? [subscriptionId] : [],
        });
      } catch (error) {
        fastify.log.error(`Failed to subscribe: ${error}`);
        socket.send(
          JSON.stringify({
            type: "error",
            timestamp: Date.now(),
            message: "Failed to subscribe to position updates",
          })
        );
      }

      // Handle incoming messages (for ping/pong or commands)
      socket.on("message", (message: Buffer) => {
        try {
          const data = JSON.parse(message.toString());
          if (data.type === "ping") {
            socket.send(JSON.stringify({ type: "pong", timestamp: Date.now() }));
          }
        } catch {
          // Ignore invalid messages
        }
      });

      // Cleanup on close
      socket.on("close", async () => {
        fastify.log.info(`WebSocket connection closed: ${connectionId}`);
        const conn = wsConnections.get(connectionId);
        if (conn) {
          for (const subId of conn.subscriptionIds) {
            await unsubscribe(subId);
          }
          wsConnections.delete(connectionId);
        }
      });

      socket.on("error", (error: Error) => {
        fastify.log.error(`WebSocket error: ${error.message}`);
      });
    }
  );

  // WebSocket endpoint for pool AUM updates
  fastify.get(
    "/ws/pool/aum",
    { websocket: true },
    (socket, request) => {
      const connectionId = `pool_${++connectionIdCounter}`;

      fastify.log.info(`WebSocket connection opened: ${connectionId} for pool AUM`);

      // Send initial connection message
      socket.send(
        JSON.stringify({
          type: "connected",
          timestamp: Date.now(),
          message: "Subscribed to pool AUM updates",
        })
      );

      // Subscribe to pool changes
      let subscriptionId: number | null = null;
      try {
        subscriptionId = subscribeToPoolChanges(
          (update) => {
            try {
              socket.send(JSON.stringify(update));
            } catch {
              // Socket may be closed
            }
          },
          (error) => {
            fastify.log.error(`Pool subscription error: ${error.message}`);
          }
        );

        wsConnections.set(connectionId, {
          socket,
          subscriptionIds: subscriptionId ? [subscriptionId] : [],
        });
      } catch (error) {
        fastify.log.error(`Failed to subscribe to pool: ${error}`);
        socket.send(
          JSON.stringify({
            type: "error",
            timestamp: Date.now(),
            message: "Failed to subscribe to pool updates",
          })
        );
      }

      // Handle ping/pong
      socket.on("message", (message: Buffer) => {
        try {
          const data = JSON.parse(message.toString());
          if (data.type === "ping") {
            socket.send(JSON.stringify({ type: "pong", timestamp: Date.now() }));
          }
        } catch {
          // Ignore invalid messages
        }
      });

      // Cleanup on close
      socket.on("close", async () => {
        fastify.log.info(`WebSocket connection closed: ${connectionId}`);
        const conn = wsConnections.get(connectionId);
        if (conn) {
          for (const subId of conn.subscriptionIds) {
            await unsubscribe(subId);
          }
          wsConnections.delete(connectionId);
        }
      });

      socket.on("error", (error: Error) => {
        fastify.log.error(`WebSocket error: ${error.message}`);
      });
    }
  );

  // WebSocket endpoint for all custody updates
  fastify.get(
    "/ws/custodies",
    { websocket: true },
    (socket, request) => {
      const connectionId = `custody_all_${++connectionIdCounter}`;

      fastify.log.info(`WebSocket connection opened: ${connectionId} for all custodies`);

      // Send initial connection message
      socket.send(
        JSON.stringify({
          type: "connected",
          timestamp: Date.now(),
          message: "Subscribed to all custody updates",
        })
      );

      // Subscribe to custody changes
      let subscriptionId: number | null = null;
      try {
        subscriptionId = subscribeToCustodyChanges(
          undefined,
          (update) => {
            try {
              socket.send(JSON.stringify(update));
            } catch {
              // Socket may be closed
            }
          },
          (error) => {
            fastify.log.error(`Custody subscription error: ${error.message}`);
          }
        );

        wsConnections.set(connectionId, {
          socket,
          subscriptionIds: subscriptionId ? [subscriptionId] : [],
        });
      } catch (error) {
        fastify.log.error(`Failed to subscribe to custodies: ${error}`);
        socket.send(
          JSON.stringify({
            type: "error",
            timestamp: Date.now(),
            message: "Failed to subscribe to custody updates",
          })
        );
      }

      // Handle ping/pong
      socket.on("message", (message: Buffer) => {
        try {
          const data = JSON.parse(message.toString());
          if (data.type === "ping") {
            socket.send(JSON.stringify({ type: "pong", timestamp: Date.now() }));
          }
        } catch {
          // Ignore invalid messages
        }
      });

      // Cleanup on close
      socket.on("close", async () => {
        fastify.log.info(`WebSocket connection closed: ${connectionId}`);
        const conn = wsConnections.get(connectionId);
        if (conn) {
          for (const subId of conn.subscriptionIds) {
            await unsubscribe(subId);
          }
          wsConnections.delete(connectionId);
        }
      });

      socket.on("error", (error: Error) => {
        fastify.log.error(`WebSocket error: ${error.message}`);
      });
    }
  );

  // WebSocket endpoint for specific token custody updates
  fastify.get<{ Params: { token: string } }>(
    "/ws/custodies/:token",
    { websocket: true },
    (socket, request) => {
      const { token } = request.params;
      const connectionId = `custody_${token}_${++connectionIdCounter}`;

      fastify.log.info(
        `WebSocket connection opened: ${connectionId} for ${token} custody`
      );

      // Send initial connection message
      socket.send(
        JSON.stringify({
          type: "connected",
          timestamp: Date.now(),
          message: `Subscribed to ${token.toUpperCase()} custody updates`,
        })
      );

      // Subscribe to custody changes
      let subscriptionId: number | null = null;
      try {
        subscriptionId = subscribeToCustodyChanges(
          token,
          (update) => {
            try {
              socket.send(JSON.stringify(update));
            } catch {
              // Socket may be closed
            }
          },
          (error) => {
            fastify.log.error(`Custody subscription error: ${error.message}`);
          }
        );

        wsConnections.set(connectionId, {
          socket,
          subscriptionIds: subscriptionId ? [subscriptionId] : [],
        });
      } catch (error) {
        fastify.log.error(`Failed to subscribe to ${token} custody: ${error}`);
        socket.send(
          JSON.stringify({
            type: "error",
            timestamp: Date.now(),
            message: `Failed to subscribe to ${token} custody updates`,
          })
        );
      }

      // Handle ping/pong
      socket.on("message", (message: Buffer) => {
        try {
          const data = JSON.parse(message.toString());
          if (data.type === "ping") {
            socket.send(JSON.stringify({ type: "pong", timestamp: Date.now() }));
          }
        } catch {
          // Ignore invalid messages
        }
      });

      // Cleanup on close
      socket.on("close", async () => {
        fastify.log.info(`WebSocket connection closed: ${connectionId}`);
        const conn = wsConnections.get(connectionId);
        if (conn) {
          for (const subId of conn.subscriptionIds) {
            await unsubscribe(subId);
          }
          wsConnections.delete(connectionId);
        }
      });

      socket.on("error", (error: Error) => {
        fastify.log.error(`WebSocket error: ${error.message}`);
      });
    }
  );

  // REST endpoint to get WebSocket stats
  fastify.get("/ws/stats", async (request, reply) => {
    return {
      success: true,
      data: {
        activeConnections: wsConnections.size,
        activeSubscriptions: getActiveSubscriptionCount(),
      },
    };
  });
}
