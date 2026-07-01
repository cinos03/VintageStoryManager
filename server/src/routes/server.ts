import { Router } from "express";
import type { Request, Response } from "express";
import { requireAuth } from "../auth";
import { dockerManager } from "../dockerManager";
import { getSettings, updateSettings } from "../db";

export const serverRouter = Router();
serverRouter.use(requireAuth);

serverRouter.get("/status", async (_req: Request, res: Response) => {
  const status = await dockerManager.status();
  const settings = getSettings();
  res.json({ ...status, settings });
});

serverRouter.post("/start", async (req: Request, res: Response) => {
  const settings = getSettings();
  const version = typeof req.body?.version === "string" ? req.body.version : settings.version;
  const channel = typeof req.body?.channel === "string" ? req.body.channel : settings.channel;
  updateSettings({ version, channel });
  try {
    await dockerManager.start(version, channel);
    res.json({ ok: true, ...(await dockerManager.status()) });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

serverRouter.post("/stop", async (_req: Request, res: Response) => {
  try {
    await dockerManager.stop();
    res.json({ ok: true, ...(await dockerManager.status()) });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

serverRouter.post("/restart", async (_req: Request, res: Response) => {
  try {
    await dockerManager.restart();
    res.json({ ok: true, ...(await dockerManager.status()) });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
