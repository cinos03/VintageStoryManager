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

interface RawReleaseV1 {
  releaseid?: number;
  mainfile?: string;
  filename?: string;
  fileid?: number;
  tags?: string[];
  modidstr?: string;
  modversion?: string;
  created?: string;
}

interface RawModDetail {
  modid: number;
  name: string;
  releases?: RawReleaseV1[];
}

function toAbsolute(fileUrl: string): string {
  if (fileUrl.startsWith("http")) return fileUrl;
  return `${API_BASE}${fileUrl.startsWith("/") ? "" : "/"}${fileUrl}`;
}

/** "1.22.3" | "v1.22.0-rc.8" -> "1.22" (major.minor), for compatibility grouping. */
function majorMinor(version: string): string {
  const m = version.replace(/^v/i, "").match(/^(\d+)\.(\d+)/);
  return m ? `${m[1]}.${m[2]}` : version.replace(/^v/i, "");
}

function normalizeVersion(version: string): string {
  return version.replace(/^v/i, "").trim();
}

export interface ReleaseCompatibility {
  /** A release tag exactly equals the running game version. */
  exact: boolean;
  /** A release tag shares the same major.minor as the running game version. */
  minor: boolean;
}

function compatibility(tags: string[], gameVersion: string): ReleaseCompatibility {
  const gv = normalizeVersion(gameVersion);
  const gvMM = majorMinor(gv);
  const norm = tags.map(normalizeVersion);
  return {
    exact: norm.includes(gv),
    minor: norm.some((t) => majorMinor(t) === gvMM),
  };
}

/**
 * Picks the newest mod release that is compatible with the running game version.
 *
 * Compatibility is enforced: if no release matches the server's major.minor
 * version, this throws with the list of versions that ARE available, rather than
 * silently installing an incompatible build.
 */
export async function getBestRelease(modId: number, gameVersion?: string): Promise<ModRelease> {
  const url = `${API_BASE}/api/mod/${modId}`;
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`Mod lookup responded ${res.status}`);
  const data = (await res.json()) as { statuscode: string; mod?: RawModDetail };
  if (data.statuscode !== "200" || !data.mod) {
    throw new Error(`Mod lookup error ${data.statuscode}`);
  }

  // The API returns releases newest-first; keep only those with a downloadable file.
  const releases = (data.mod.releases ?? []).filter((r) => r.mainfile && r.filename);
  if (!releases.length) throw new Error("This mod has no downloadable releases.");

  let chosen: RawReleaseV1 | undefined;
  if (gameVersion) {
    // Prefer an exact game-version match, then same major.minor. Newest wins.
    chosen = releases.find((r) => compatibility(r.tags ?? [], gameVersion).exact);
    if (!chosen) {
      chosen = releases.find((r) => compatibility(r.tags ?? [], gameVersion).minor);
    }
    if (!chosen) {
      const available = Array.from(
        new Set(releases.flatMap((r) => r.tags ?? []).map(normalizeVersion))
      )
        .sort()
        .reverse();
      throw new Error(
        `No release of "${data.mod.name}" is compatible with game version ${gameVersion}. ` +
          `Available for: ${available.join(", ") || "unknown"}.`
      );
    }
  } else {
    chosen = releases[0];
  }

  return {
    releaseId: chosen.releaseid ?? 0,
    modIdStr: chosen.modidstr ?? String(modId),
    version: chosen.modversion ?? "unknown",
    fileName: chosen.filename!,
    fileUrl: toAbsolute(chosen.mainfile!),
    compatibleGameVersions: (chosen.tags ?? []).map(normalizeVersion),
  };
}

