import express from "express";
import type { SidecarContext } from "../sidecar-context.js";
import { createAuthMiddleware } from "./middleware/auth.js";
import { createAgentsRouter } from "./routes/agents.js";
import { createInboxRouter } from "./routes/inbox.js";
import {
  createAuthedMetaRouter,
  mountHealthRoute,
} from "./routes/meta.js";

export function createApp(ctx: SidecarContext) {
  const app = express();
  app.use(express.json({ limit: "20mb" }));

  mountHealthRoute(app, ctx);
  app.use(createAuthMiddleware(ctx.config));
  app.use("/v1", createAuthedMetaRouter(ctx));
  app.use("/v1/agents", createAgentsRouter(ctx));
  app.use("/v1/inbox", createInboxRouter(ctx));

  return app;
}
