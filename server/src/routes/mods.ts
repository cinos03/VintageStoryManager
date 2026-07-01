import { Router } from "express";
import type { Request, Response } from "express";
import multer from "multer";
import { requireAuth } from "../auth";
import { searchMods } from "../services/moddb";
import {
  listInstalledMods,
  installModFromDb,
  installModFromUpload,
  deleteMod,
} from "../services/mods";
import { getSettings } from "../db";

export const modsRouter = Router();
modsRouter.use(requireAuth);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 },
});

// Currently installed mods
modsRouter.get("/installed", (_req: Request, res: Response) => {
  try {
    res.json({ mods: listInstalledMods() });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Search mods.vintagestory.at
modsRouter.get("/search", async (req: Request, res: Response) => {
  const text = typeof req.query.q === "string" ? req.query.q : "";
  const gv = typeof req.query.gv === "string" ? req.query.gv : getSettings().version;
  try {
    const mods = await searchMods(text, gv);
    res.json({ mods });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Install a mod from the mod DB by numeric mod id
modsRouter.post("/install", async (req: Request, res: Response) => {
  const modId = Number(req.body?.modId);
  const gv = typeof req.body?.gameVersion === "string" ? req.body.gameVersion : getSettings().version;
  if (!Number.isFinite(modId)) {
    return res.status(400).json({ error: "modId (number) required" });
  }
  try {
    const mod = await installModFromDb(modId, gv);
    res.json({ ok: true, mod });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Import a mod by uploading a file from the web UI
modsRouter.post("/upload", upload.single("mod"), (req: Request, res: Response) => {
  const file = (req as Request & { file?: Express.Multer.File }).file;
  if (!file) return res.status(400).json({ error: "No file uploaded" });
  try {
    const mod = installModFromUpload(file.originalname, file.buffer);
    res.json({ ok: true, mod });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

// Remove an installed mod
modsRouter.delete("/:file", (req: Request, res: Response) => {
  try {
    deleteMod(req.params.file);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});
