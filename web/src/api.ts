// Thin API client. All requests are same-origin and rely on the httpOnly
// auth cookie set at login.

export interface ServerStatus {
  state: "running" | "stopped" | "not-created" | "starting";
  version?: string;
  channel?: string;
  containerId?: string;
  startedAt?: string;
  settings?: { version: string; channel: string };
}

export interface GameVersion {
  version: string;
  channel: string;
  downloadUrl: string;
  md5?: string;
  filesize?: number;
}

export interface InstalledMod {
  file: string;
  modid?: string;
  name?: string;
  version?: string;
  description?: string;
  side?: string;
  authors?: string[];
}

export interface ModSummary {
  modid: number;
  assetid?: number;
  name: string;
  summary?: string;
  author?: string;
  downloads?: number;
  follows?: number;
  tags?: string[];
  logo?: string;
  urlalias?: string;
}

async function req<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: "same-origin",
    headers: options?.body && !(options.body instanceof FormData)
      ? { "Content-Type": "application/json" }
      : undefined,
    ...options,
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const data = await res.json();
      msg = data.error ?? msg;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

export const api = {
  me: () => req<{ username: string }>("/api/auth/me"),
  login: (username: string, password: string) =>
    req<{ ok: true; username: string }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  logout: () => req("/api/auth/logout", { method: "POST" }),
  changePassword: (newPassword: string) =>
    req("/api/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ newPassword }),
    }),

  status: () => req<ServerStatus>("/api/server/status"),
  start: (version?: string, channel?: string) =>
    req<ServerStatus>("/api/server/start", {
      method: "POST",
      body: JSON.stringify({ version, channel }),
    }),
  stop: () => req<ServerStatus>("/api/server/stop", { method: "POST" }),
  restart: () => req<ServerStatus>("/api/server/restart", { method: "POST" }),

  versions: (refresh = false) =>
    req<{ versions: GameVersion[] }>(`/api/versions${refresh ? "?refresh=1" : ""}`),

  installedMods: () => req<{ mods: InstalledMod[] }>("/api/mods/installed"),
  searchMods: (q: string, gv?: string) =>
    req<{ mods: ModSummary[] }>(
      `/api/mods/search?q=${encodeURIComponent(q)}${gv ? `&gv=${encodeURIComponent(gv)}` : ""}`
    ),
  installMod: (modId: number, gameVersion?: string) =>
    req<{ ok: true; mod: InstalledMod }>("/api/mods/install", {
      method: "POST",
      body: JSON.stringify({ modId, gameVersion }),
    }),
  uploadMod: (file: File) => {
    const fd = new FormData();
    fd.append("mod", file);
    return req<{ ok: true; mod: InstalledMod }>("/api/mods/upload", {
      method: "POST",
      body: fd,
    });
  },
  deleteMod: (file: string) =>
    req(`/api/mods/${encodeURIComponent(file)}`, { method: "DELETE" }),

  sendCommand: (command: string) =>
    req("/api/console/command", {
      method: "POST",
      body: JSON.stringify({ command }),
    }),
};
