import type { NextFunction, Request, Response } from "express";
import type { SidecarConfig } from "../../config.js";

export function createAuthMiddleware(config: SidecarConfig) {
  return (req: Request, res: Response, next: NextFunction) => {
    const header = req.header("authorization") ?? "";
    const token = header.toLowerCase().startsWith("bearer ")
      ? header.slice(7).trim()
      : (req.header("x-sidecar-token") ?? "").trim();
    if (token !== config.pairingToken) {
      res
        .status(401)
        .json({ error: "Unauthorized", message: "Invalid pairing token" });
      return;
    }
    next();
  };
}
