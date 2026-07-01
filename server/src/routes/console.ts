import { Router } from "express";
import type { Request, Response } from "express";
import { requireAuth } from "../auth";
import { dockerManager } from "../dockerManager";

export const consoleRouter = Router();
consoleRouter.use(requireAuth);

// Run a single console command against the running server.
consoleRouter.post("/command", (req: Request, res: Response) => {
  const command = req.body?.command;
  if (typeof command !== "string" || !command.trim()) {
    return res.status(400).json({ error: "command required" });
  }
  try {
    dockerManager.sendCommand(command.trim());
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});
