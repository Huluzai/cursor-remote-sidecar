import { existsSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { Cursor } from "@cursor/sdk";
import express from "express";
import type { SidecarContext } from "../../sidecar-context.js";
import { sdkAuthOptions } from "../../sdk-auth.js";
import {
  folderParentIfAllowed,
  isPathAllowed,
  resolveFolderListPath,
} from "../../utils/folders.js";
import { nowIso } from "../../utils/time.js";

export function mountHealthRoute(app: express.Application, ctx: SidecarContext) {
  app.get("/health", (_req, res) => {
    res.json({
      ok: true,
      mode: "path-c-local",
      cwd: ctx.config.defaultCwd,
      model: ctx.config.defaultModel,
      sessions: ctx.sessions.size,
      uptimeSec: Math.floor(process.uptime()),
      recycleMs: ctx.config.recycleMs,
    });
  });
}

export function createAuthedMetaRouter(ctx: SidecarContext) {
  const router = express.Router();

  router.get("/me", (_req, res) => {
    const email = ctx.config.cursorEmail;
    res.json({
      apiKeyName: "sidecar-pairing-token",
      userEmail: email ?? "local@sidecar",
      userFirstName: email ? email.split("@")[0] : "Path",
      userLastName: email ? "C" : "C",
      createdAt: nowIso(),
    });
  });

  router.get("/models", async (_req, res) => {
    try {
      const models = await Cursor.models.list(sdkAuthOptions(ctx.config));
      const items = models.map((m) => ({
        id: m.id,
        displayName: m.displayName || m.id,
        description: m.description,
        aliases: m.aliases,
        parameters: m.parameters,
        variants: m.variants,
      }));
      res.json({ items });
    } catch (err) {
      console.warn("[sidecar] Cursor.models.list failed", err);
      res.json({
        items: [
          {
            id: ctx.config.defaultModel,
            displayName: ctx.config.defaultModel,
          },
        ],
      });
    }
  });

  router.get("/folders", (req, res) => {
    try {
      const homeDir = ctx.config.homeDir;
      const defaultCwd = ctx.config.defaultCwd;
      const base = resolveFolderListPath(req.query.path, homeDir, defaultCwd);
      if (!isPathAllowed(base, homeDir, defaultCwd)) {
        res
          .status(403)
          .json({ error: "Forbidden", message: "path_not_allowed" });
        return;
      }
      if (!existsSync(base) || !statSync(base).isDirectory()) {
        res
          .status(404)
          .json({ error: "Not Found", message: "not_a_directory" });
        return;
      }
      const entries = readdirSync(base, { withFileTypes: true })
        .filter((d) => d.isDirectory() && !d.name.startsWith("."))
        .map((d) => {
          const childPath = resolve(base, d.name);
          return { name: d.name, path: childPath };
        })
        .filter((e) => isPathAllowed(e.path, homeDir, defaultCwd))
        .sort((a, b) => a.name.localeCompare(b.name));
      res.json({
        path: base,
        parent: folderParentIfAllowed(base, homeDir, defaultCwd),
        home: homeDir,
        entries,
      });
    } catch (err) {
      console.warn("[sidecar] /v1/folders failed", err);
      res
        .status(500)
        .json({ error: "Internal Server Error", message: "folder_list_failed" });
    }
  });

  router.get("/artifacts", (_req, res) => {
    res.json({ items: [] });
  });

  return router;
}
