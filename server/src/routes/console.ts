import { Router } from "express";
import type { Request, Response } from "express";
import { requireAuth } from "../auth";
import { registry } from "../dockerManager";
import { getServer } from "../db";

// mergeParams so ":id" from /api/servers/:id/console is available.
export const consoleRouter = Router({ mergeParams: true });
consoleRouter.use(requireAuth);

// Run a single console command against the running server.
consoleRouter.post("/command", (req: Request, res: Response) => {
  const server = getServer(req.params.id);
  if (!server) return res.status(404).json({ error: `No server "${req.params.id}"` });
  const command = req.body?.command;
  if (typeof command !== "string" || !command.trim()) {
    return res.status(400).json({ error: "command required" });
  }
  try {
    registry.get(server).sendCommand(command.trim());
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});
