import { Router } from "express";
import type { Request, Response } from "express";
import { requireAuth } from "../auth";
import { listVersions } from "../services/versions";

export const versionsRouter = Router();
versionsRouter.use(requireAuth);

versionsRouter.get("/", async (req: Request, res: Response) => {
  const force = req.query.refresh === "1";
  try {
    const versions = await listVersions(force);
    res.json({ versions });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
