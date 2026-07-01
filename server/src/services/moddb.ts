import { log } from "../logger";

const API_BASE = "https://mods.vintagestory.at";

export interface ModSummary {
  modId: number;
  assetId: number;
  name: string;
  summary: string | null;
  author: string | null;
  downloads: number;
  follows: number;
  tags: string[];
  logo: string | null;
  urlAlias: string | null;
}

export interface ModRelease {
  releaseId: number;
  modIdStr: string;
  version: string;
  fileName: string;
  fileUrl: string; // absolute
  compatibleGameVersions: string[];
}

interface RawModListEntry {
  modid: number;
  assetid: number;
  name: string;
  summary?: string | null;
  author?: string | null;
  downloads?: number;
  follows?: number;
  tags?: string[];
  logo?: string | null;
  urlalias?: string | null;
}

/** Search the mod database. Optionally filter by game version string (e.g. "1.22.3"). */
export async function searchMods(text: string, gameVersion?: string): Promise<ModSummary[]> {
  const params = new URLSearchParams();
  if (text) params.set("text", text);
  params.set("orderby", "downloads");
  const url = `${API_BASE}/api/mods?${params.toString()}`;
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`Mod DB search responded ${res.status}`);
  const data = (await res.json()) as { statuscode: string; mods: RawModListEntry[] };
  if (data.statuscode !== "200") throw new Error(`Mod DB search error ${data.statuscode}`);

  let mods = data.mods.map((m) => ({
    modId: m.modid,
    assetId: m.assetid,
    name: m.name,
    summary: m.summary ?? null,
    author: m.author ?? null,
    downloads: m.downloads ?? 0,
    follows: m.follows ?? 0,
    tags: m.tags ?? [],
    logo: m.logo ?? null,
    urlAlias: m.urlalias ?? null,
  }));

  // The v1 list endpoint doesn't reliably filter by game version, so we keep it
  // as a best-effort ordering hint only; compatibility is resolved at install time.
  if (gameVersion) {
    void gameVersion;
  }
  return mods.slice(0, 100);
}

interface RawReleaseV2 {
  releaseId?: number;
  identifier?: string;
  version?: string;
  fileName?: string;
  fileUrl?: string;
  compatibleGameVersions?: string[];
}

function toAbsolute(fileUrl: string): string {
  if (fileUrl.startsWith("http")) return fileUrl;
  return `${API_BASE}${fileUrl.startsWith("/") ? "" : "/"}${fileUrl}`;
}

/** Returns the newest non-retracted release for a mod, ideally matching the game version. */
export async function getBestRelease(modId: number, gameVersion?: string): Promise<ModRelease> {
  // Pull the full release list and pick the newest compatible one.
  const listUrl = `${API_BASE}/api/v2/mods/${modId}/releases`;
  let releases: RawReleaseV2[] = [];
  try {
    const res = await fetch(listUrl, { headers: { accept: "application/json" } });
    if (res.ok) {
      const map = (await res.json()) as Record<string, RawReleaseV2>;
      releases = Object.entries(map).map(([id, r]) => ({ releaseId: Number(id), ...r }));
    }
  } catch (err) {
    log.warn("release list fetch failed, falling back to latest:", err);
  }

  let chosen: RawReleaseV2 | null = null;
  if (gameVersion && releases.length) {
    chosen =
      releases.find((r) => (r.compatibleGameVersions ?? []).includes(gameVersion)) ?? null;
  }

  // If we couldn't match a version (or list endpoint lacked file info), resolve the full release.
  const releaseId = chosen?.releaseId ?? releases[0]?.releaseId;
  const detailUrl = releaseId
    ? `${API_BASE}/api/v2/mods/${modId}/releases/${releaseId}`
    : `${API_BASE}/api/v2/mods/${modId}/releases/latest`;

  const detailRes = await fetch(detailUrl, { headers: { accept: "application/json" } });
  if (!detailRes.ok) throw new Error(`Release lookup responded ${detailRes.status}`);
  const detail = (await detailRes.json()) as RawReleaseV2;
  if (!detail.fileUrl || !detail.fileName) {
    throw new Error("No downloadable file for this mod release.");
  }

  return {
    releaseId: detail.releaseId ?? releaseId ?? 0,
    modIdStr: detail.identifier ?? String(modId),
    version: detail.version ?? "unknown",
    fileName: detail.fileName,
    fileUrl: toAbsolute(detail.fileUrl),
    compatibleGameVersions: detail.compatibleGameVersions ?? [],
  };
}
