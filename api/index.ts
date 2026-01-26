import { buildApp } from "../src/app";
import type { VercelRequest, VercelResponse } from "@vercel/node";

let app: Awaited<ReturnType<typeof buildApp>> | null = null;

async function getApp() {
  if (!app) {
    app = await buildApp();
    await app.ready();
  }
  return app;
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  const fastify = await getApp();

  const response = await fastify.inject({
    method: (req.method || "GET") as any,
    url: req.url || "/",
    headers: req.headers as Record<string, string>,
    payload: req.body,
  });

  Object.entries(response.headers).forEach(([key, value]) => {
    res.setHeader(key, value as any);
  });

  res.status(response.statusCode).send(response.body);
}
