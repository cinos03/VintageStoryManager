import fs from "node:fs";
import path from "node:path";
import AdmZip from "adm-zip";
import { log } from "../logger";
import { getBestRelease } from "./moddb";

export interface InstalledMod {
  file: string;
  modId: string | null;
  name: string | null;
  version: string | null;
  description: string | null;
  authors: string[];
  side: string | null;
  sizeBytes: number;
}

function ensureModsDir(modsDir: string): string {
  fs.mkdirSync(modsDir, { recursive: true });
  return modsDir;
}

/** Lenient JSON parse: strips BOM, // and /* *​/ comments and trailing commas. */
function looseJsonParse(text: string): Record<string, unknown> {
  let t = text.replace(/^\uFEFF/, "");
  t = t.replace(/\/\*[\s\S]*?\*\//g, "");
  t = t.replace(/(^|[^:])\/\/.*$/gm, "$1");
  t = t.replace(/,(\s*[}\]])/g, "$1");
  return JSON.parse(t) as Record<string, unknown>;
}

function pick(obj: Record<string, unknown>, keys: string[]): unknown {
  const lower: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) lower[k.toLowerCase()] = v;
  for (const key of keys) {
    const v = lower[key.toLowerCase()];
    if (v !== undefined) return v;
  }
  return undefined;
}

function readModInfoFromZip(filePath: string): Partial<InstalledMod> {
  try {
    const zip = new AdmZip(filePath);
    const entry = zip.getEntry("modinfo.json");
    if (!entry) return {};
    const raw = zip.readAsText(entry);
    const info = looseJsonParse(raw);
    const authorsRaw = pick(info, ["authors", "author"]);
    const authors = Array.isArray(authorsRaw)
      ? authorsRaw.map(String)
      : authorsRaw
        ? [String(authorsRaw)]
        : [];
    return {
      modId: (pick(info, ["modid"]) as string) ?? null,
      name: (pick(info, ["name"]) as string) ?? null,
      version: (pick(info, ["version"]) as string) ?? null,
      description: (pick(info, ["description"]) as string) ?? null,
      side: (pick(info, ["side"]) as string) ?? null,
      authors,
    };
  } catch (err) {
    log.warn(`Could not read modinfo from ${path.basename(filePath)}:`, err);
    return {};
  }
}

export function listInstalledMods(modsDir: string): InstalledMod[] {
  const dir = ensureModsDir(modsDir);
  const files = fs.readdirSync(dir).filter((f) => /\.(zip|cs|dll)$/i.test(f));
  return files.map((file) => {
    const full = path.join(dir, file);
    const size = fs.statSync(full).size;
    const info = file.toLowerCase().endsWith(".zip") ? readModInfoFromZip(full) : {};
    return {
      file,
      modId: info.modId ?? null,
      name: info.name ?? file,
      version: info.version ?? null,
      description: info.description ?? null,
      authors: info.authors ?? [],
      side: info.side ?? null,
      sizeBytes: size,
    };
  });
}

function sanitizeFileName(name: string): string {
  return path.basename(name).replace(/[^A-Za-z0-9._-]/g, "_");
}

export async function installModFromDb(
  modsDir: string,
  modId: number,
  gameVersion?: string
): Promise<InstalledMod> {
  const dir = ensureModsDir(modsDir);
  const release = await getBestRelease(modId, gameVersion);
  const res = await fetch(release.fileUrl);
  if (!res.ok) throw new Error(`Download failed (${res.status}) for ${release.fileUrl}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const target = path.join(dir, sanitizeFileName(release.fileName));
  fs.writeFileSync(target, buffer);
  log.info(`Installed mod ${release.modIdStr} ${release.version} -> ${path.basename(target)}`);
  return listInstalledMods(modsDir).find((m) => m.file === path.basename(target))!;
}

export function installModFromUpload(
  modsDir: string,
  originalName: string,
  buffer: Buffer
): InstalledMod {
  const dir = ensureModsDir(modsDir);
  if (!/\.(zip|cs|dll)$/i.test(originalName)) {
    throw new Error("Only .zip, .cs or .dll mod files are supported.");
  }
  const target = path.join(dir, sanitizeFileName(originalName));
  fs.writeFileSync(target, buffer);
  log.info(`Imported uploaded mod -> ${path.basename(target)}`);
  return listInstalledMods(modsDir).find((m) => m.file === path.basename(target))!;
}

export function deleteMod(modsDir: string, file: string): void {
  const dir = ensureModsDir(modsDir);
  const target = path.join(dir, path.basename(file));
  if (!target.startsWith(dir)) throw new Error("Invalid path.");
  if (fs.existsSync(target)) fs.unlinkSync(target);
}
