// Thin API client. All requests are same-origin and rely on the httpOnly
// auth cookie set at login.

export interface ServerStatus {
  state: "running" | "stopped" | "not-created" | "starting";
  version?: string | null;
  channel?: string | null;
  containerId?: string | null;
  startedAt?: string | null;
}

/** A managed server record plus its live container status. */
export interface ServerInfo {
  id: string;
  name: string;
  version: string;
  channel: string;
  gamePort: number;
  containerName: string;
  createdAt: string;
  status: ServerStatus;
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
  modId?: string | null;
  name?: string | null;
  version?: string | null;
  description?: string | null;
  side?: string | null;
  authors?: string[];
}

export interface ModSummary {
  modId: number;
  assetId?: number;
  name: string;
  summary?: string;
  author?: string;
  downloads?: number;
  follows?: number;
  tags?: string[];
  logo?: string;
  urlAlias?: string;
}

export interface CommandArg {
  name: string;
  label: string;
  placeholder?: string;
  options?: string[];
  required?: boolean;
}

export interface CommandDef {
  id: string;
  label: string;
  template: string;
  description: string;
  category: string;
  args?: CommandArg[];
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

const enc = encodeURIComponent;

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

  versions: (refresh = false) =>
    req<{ versions: GameVersion[] }>(`/api/versions${refresh ? "?refresh=1" : ""}`),

  commands: () => req<{ commands: CommandDef[] }>("/api/commands"),

  servers: {
    list: () => req<{ servers: ServerInfo[] }>("/api/servers"),
    create: (input: { name: string; version: string; channel: string; gamePort?: number }) =>
      req<{ ok: true; server: ServerInfo }>("/api/servers", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    update: (id: string, patch: { name?: string; version?: string; channel?: string }) =>
      req<{ ok: true; server: ServerInfo }>(`/api/servers/${enc(id)}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
    remove: (id: string) => req(`/api/servers/${enc(id)}`, { method: "DELETE" }),
    status: (id: string) => req<ServerStatus>(`/api/servers/${enc(id)}/status`),
    start: (id: string, version?: string, channel?: string) =>
      req<ServerStatus>(`/api/servers/${enc(id)}/start`, {
        method: "POST",
        body: JSON.stringify({ version, channel }),
      }),
    stop: (id: string) => req<ServerStatus>(`/api/servers/${enc(id)}/stop`, { method: "POST" }),
    restart: (id: string) =>
      req<ServerStatus>(`/api/servers/${enc(id)}/restart`, { method: "POST" }),
  },

  mods: {
    installed: (id: string) =>
      req<{ mods: InstalledMod[] }>(`/api/servers/${enc(id)}/mods/installed`),
    search: (id: string, q: string, gv?: string) =>
      req<{ mods: ModSummary[] }>(
        `/api/servers/${enc(id)}/mods/search?q=${enc(q)}${gv ? `&gv=${enc(gv)}` : ""}`
      ),
    install: (id: string, modId: number, gameVersion?: string) =>
      req<{ ok: true; mod: InstalledMod }>(`/api/servers/${enc(id)}/mods/install`, {
        method: "POST",
        body: JSON.stringify({ modId, gameVersion }),
      }),
    upload: (id: string, file: File) => {
      const fd = new FormData();
      fd.append("mod", file);
      return req<{ ok: true; mod: InstalledMod }>(`/api/servers/${enc(id)}/mods/upload`, {
        method: "POST",
        body: fd,
      });
    },
    remove: (id: string, file: string) =>
      req(`/api/servers/${enc(id)}/mods/${enc(file)}`, { method: "DELETE" }),
  },

  console: {
    command: (id: string, command: string) =>
      req(`/api/servers/${enc(id)}/console/command`, {
        method: "POST",
        body: JSON.stringify({ command }),
      }),
  },
};

