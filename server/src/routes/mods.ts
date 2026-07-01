import { Router } from "express";
import type { Request, Response } from "express";
import path from "node:path";
import multer from "multer";
import { requireAuth } from "../auth";
import { searchMods } from "../services/moddb";
import {
  listInstalledMods,
  installModFromDb,
  installModFromUpload,
  deleteMod,
} from "../services/mods";
import { getServer, type ServerConfig } from "../db";

// mergeParams so ":id" from the parent /api/servers/:id/mods route is available.
export const modsRouter = Router({ mergeParams: true });
modsRouter.use(requireAuth);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 },
});

/** Resolve the target server + its Mods directory, or send a 404. */
function resolve(req: Request, res: Response): { server: ServerConfig; modsDir: string } | null {
  const server = getServer(req.params.id);
  if (!server) {
    res.status(404).json({ error: `No server "${req.params.id}"` });
    return null;
  }
  return { server, modsDir: path.join(server.dataDir, "Mods") };
}

// Currently installed mods
modsRouter.get("/installed", (req: Request, res: Response) => {
  const ctx = resolve(req, res);
  if (!ctx) return;
  try {
    res.json({ mods: listInstalledMods(ctx.modsDir) });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Search mods.vintagestory.at
modsRouter.get("/search", async (req: Request, res: Response) => {
  const ctx = resolve(req, res);
  if (!ctx) return;
  const text = typeof req.query.q === "string" ? req.query.q : "";
  const gv = typeof req.query.gv === "string" ? req.query.gv : ctx.server.version;
  try {
    const mods = await searchMods(text, gv);
    res.json({ mods });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Install a mod from the mod DB by numeric mod id
modsRouter.post("/install", async (req: Request, res: Response) => {
  const ctx = resolve(req, res);
  if (!ctx) return;
  const modId = Number(req.body?.modId);
  const gv = typeof req.body?.gameVersion === "string" ? req.body.gameVersion : ctx.server.version;
  if (!Number.isFinite(modId)) {
    return res.status(400).json({ error: "modId (number) required" });
  }
  try {
    const mod = await installModFromDb(ctx.modsDir, modId, gv);
    res.json({ ok: true, mod });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Import a mod by uploading a file from the web UI
modsRouter.post("/upload", upload.single("mod"), (req: Request, res: Response) => {
  const ctx = resolve(req, res);
  if (!ctx) return;
  const file = (req as Request & { file?: Express.Multer.File }).file;
  if (!file) return res.status(400).json({ error: "No file uploaded" });
  try {
    const mod = installModFromUpload(ctx.modsDir, file.originalname, file.buffer);
    res.json({ ok: true, mod });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

// Remove an installed mod
modsRouter.delete("/:file", (req: Request, res: Response) => {
  const ctx = resolve(req, res);
  if (!ctx) return;
  try {
    deleteMod(ctx.modsDir, req.params.file);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});
