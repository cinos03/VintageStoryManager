import { Router } from "express";
import type { Request, Response } from "express";
import { requireAuth } from "../auth";
import { COMMANDS } from "../services/commands";

export const commandsRouter = Router();
commandsRouter.use(requireAuth);

// The static command catalog for the command palette.
commandsRouter.get("/", (_req: Request, res: Response) => {
  res.json({ commands: COMMANDS });
});
