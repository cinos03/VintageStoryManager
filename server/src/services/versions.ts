import { log } from "../logger";

export interface GameVersion {
  version: string;
  channel: "stable" | "unstable";
  downloadUrl: string;
  md5: string;
  filesize: string | null;
}

interface RawFileInfo {
  filename: string;
  filesize?: string;
  md5: string;
  urls: { cdn: string; local?: string };
  latest?: number;
}

type RawVersions = Record<string, Record<string, RawFileInfo>>;

const ENDPOINTS: Record<"stable" | "unstable", string> = {
  stable: "https://api.vintagestory.at/stable.json",
  unstable: "https://api.vintagestory.at/unstable.json",
};

// Cache to avoid hammering the API.
let cache: { at: number; versions: GameVersion[] } | null = null;
const CACHE_TTL_MS = 10 * 60 * 1000;

function extractServerInfo(entry: Record<string, RawFileInfo>): RawFileInfo | null {
  // Newer versions use "linuxserver"; pre-1.18 versions use "server".
  return entry.linuxserver ?? entry.server ?? null;
}

async function fetchChannel(channel: "stable" | "unstable"): Promise<GameVersion[]> {
  const res = await fetch(ENDPOINTS[channel], { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`Version API ${channel} responded ${res.status}`);
  const data = (await res.json()) as RawVersions;
  const out: GameVersion[] = [];
  for (const [version, files] of Object.entries(data)) {
    const server = extractServerInfo(files);
    if (!server) continue;
    out.push({
      version,
      channel,
      downloadUrl: server.urls.cdn,
      md5: server.md5,
      filesize: server.filesize ?? null,
    });
  }
  return out;
}

function compareVersionsDesc(a: string, b: string): number {
  const pa = a.split(/[.-]/).map((n) => parseInt(n, 10) || 0);
  const pb = b.split(/[.-]/).map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pb[i] ?? 0) - (pa[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

export async function listVersions(force = false): Promise<GameVersion[]> {
  if (!force && cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.versions;
  }
  const results: GameVersion[] = [];
  for (const channel of ["stable", "unstable"] as const) {
    try {
      results.push(...(await fetchChannel(channel)));
    } catch (err) {
      log.warn(`Failed to load ${channel} versions:`, err);
    }
  }
  results.sort((a, b) => compareVersionsDesc(a.version, b.version));
  cache = { at: Date.now(), versions: results };
  return results;
}
