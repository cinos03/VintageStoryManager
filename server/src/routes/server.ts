import { Router } from "express";
import type { Request, Response } from "express";
import { requireAuth } from "../auth";
import { registry } from "../dockerManager";
import {
  listServers,
  getServer,
  addServer,
  updateServer,
  removeServer,
} from "../db";
import { config } from "../config";
import { readServerConfig, writeServerConfig } from "../services/serverconfig";
import { modsRouter } from "./mods";
import { consoleRouter } from "./console";

export const serversRouter = Router();
serversRouter.use(requireAuth);

// List every managed server with its live container status.
serversRouter.get("/", async (_req: Request, res: Response) => {
  const servers = listServers();
  const withStatus = await Promise.all(
    servers.map(async (s) => ({ ...s, status: await registry.get(s).status() }))
  );
  res.json({ servers: withStatus });
});

// Create a new managed server.
serversRouter.post("/", (req: Request, res: Response) => {
  const name = typeof req.body?.name === "string" ? req.body.name : "";
  const version = typeof req.body?.version === "string" ? req.body.version : config.vs.defaultVersion;
  const channel = typeof req.body?.channel === "string" ? req.body.channel : config.vs.defaultChannel;
  const gamePort = Number(req.body?.gamePort);
  try {
    const server = addServer({
      name,
      version,
      channel,
      gamePort: Number.isFinite(gamePort) ? gamePort : undefined,
    });
    res.json({ ok: true, server });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

// Rename / change desired version of a server (does not restart it).
serversRouter.patch("/:id", (req: Request, res: Response) => {
  const patch: Record<string, unknown> = {};
  if (typeof req.body?.name === "string") patch.name = req.body.name;
  if (typeof req.body?.version === "string") patch.version = req.body.version;
  if (typeof req.body?.channel === "string") patch.channel = req.body.channel;
  const server = updateServer(req.params.id, patch);
  if (!server) return res.status(404).json({ error: `No server "${req.params.id}"` });
  res.json({ ok: true, server });
});

// Delete a server: stop + remove its container, then drop the record.
serversRouter.delete("/:id", async (req: Request, res: Response) => {
  const server = getServer(req.params.id);
  if (!server) return res.status(404).json({ error: `No server "${req.params.id}"` });
  try {
    await registry.remove(server);
    removeServer(server.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

serversRouter.get("/:id/status", async (req: Request, res: Response) => {
  const server = getServer(req.params.id);
  if (!server) return res.status(404).json({ error: `No server "${req.params.id}"` });
  res.json({ ...(await registry.get(server).status()), server });
});

serversRouter.post("/:id/start", async (req: Request, res: Response) => {
  const server = getServer(req.params.id);
  if (!server) return res.status(404).json({ error: `No server "${req.params.id}"` });
  const version = typeof req.body?.version === "string" ? req.body.version : server.version;
  const channel = typeof req.body?.channel === "string" ? req.body.channel : server.channel;
  // Persist the desired version/channel so it survives restarts.
  updateServer(server.id, { version, channel });
  try {
    const runner = registry.get(server);
    await runner.start(server, version, channel);
    res.json({ ok: true, ...(await runner.status()) });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

serversRouter.post("/:id/stop", async (req: Request, res: Response) => {
  const server = getServer(req.params.id);
  if (!server) return res.status(404).json({ error: `No server "${req.params.id}"` });
  try {
    const runner = registry.get(server);
    await runner.stop();
    res.json({ ok: true, ...(await runner.status()) });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

serversRouter.post("/:id/restart", async (req: Request, res: Response) => {
  const server = getServer(req.params.id);
  if (!server) return res.status(404).json({ error: `No server "${req.params.id}"` });
  try {
    const runner = registry.get(server);
    await runner.restart(server);
    res.json({ ok: true, ...(await runner.status()) });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// --- serverconfig.json ---

serversRouter.get("/:id/config", async (req: Request, res: Response) => {
  const server = getServer(req.params.id);
  if (!server) return res.status(404).json({ error: `No server "${req.params.id}"` });
  try {
    const cfg = readServerConfig(server.dataDir);
    res.json({ exists: cfg !== null, config: cfg ?? {} });
  } catch (err) {
    res.status(500).json({ error: `Could not read serverconfig.json: ${(err as Error).message}` });
  }
});

serversRouter.put("/:id/config", async (req: Request, res: Response) => {
  const server = getServer(req.params.id);
  if (!server) return res.status(404).json({ error: `No server "${req.params.id}"` });
  const incoming = req.body?.config;
  if (typeof incoming !== "object" || incoming === null || Array.isArray(incoming)) {
    return res.status(400).json({ error: "config (object) required" });
  }
  const restart = req.body?.restart === true;
  try {
    writeServerConfig(server.dataDir, incoming as Record<string, unknown>);
    // Keep the manager's server name in sync with the config's ServerName.
    const serverName = (incoming as Record<string, unknown>).ServerName;
    if (typeof serverName === "string" && serverName.trim()) {
      updateServer(server.id, { name: serverName.trim() });
    }
    let restarted = false;
    if (restart) {
      const runner = registry.get(server);
      const status = await runner.status();
      if (status.state === "running") {
        await runner.restart(server);
        restarted = true;
      }
    }
    res.json({ ok: true, restarted });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Per-server nested resources.
serversRouter.use("/:id/mods", modsRouter);
serversRouter.use("/:id/console", consoleRouter);
