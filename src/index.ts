import { buildApp } from "./app";
import { config } from "./config";

const start = async () => {
  const fastify = await buildApp();

  try {
    await fastify.listen({ port: config.port, host: config.host });
    console.log(`
╔════════════════════════════════════════════════════════╗
║           Jupiter Perpetuals API Server                ║
╠════════════════════════════════════════════════════════╣
║  Server running at: http://${config.host}:${config.port}              ║
║  RPC URL: ${config.rpcUrl.substring(0, 40)}...    ║
╠════════════════════════════════════════════════════════╣
║  Endpoints:                                            ║
║    GET  /              - API info                      ║
║    GET  /health        - Health check                  ║
║    GET  /positions     - All open positions            ║
║    GET  /positions/:wallet - Positions by wallet       ║
║    GET  /pool          - Pool data                     ║
║    GET  /pool/aum      - Pool AUM                      ║
║    GET  /pool/apy      - Pool APY                      ║
║    GET  /jlp/price     - JLP virtual price             ║
║    GET  /prices        - All token prices              ║
║    GET  /prices/:token - Specific token price          ║
║    GET  /custodies     - All custody data              ║
║    GET  /custodies/:token - Specific custody           ║
║    POST /trade/increase-position - Open/increase pos   ║
║    POST /trade/decrease-position - Close/decrease pos  ║
╚════════════════════════════════════════════════════════╝
    `);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
