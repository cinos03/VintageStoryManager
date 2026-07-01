import fs from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import { config } from "./config";
import { log } from "./logger";

export interface User {
  username: string;
  passwordHash: string;
}

/** A managed Vintage Story server instance. Paths/names are stored explicitly
 *  so migrations and container lookups stay unambiguous. */
export interface ServerConfig {
  id: string;
  name: string;
  version: string;
  channel: string;
  gamePort: number;
  containerName: string;
  /** Host path bound into the game container at /data. */
  hostDataDir: string;
  /** The same directory as seen from inside the manager container. */
  dataDir: string;
  createdAt: string;
}

interface LegacySettings {
  version: string;
  channel: string;
}

interface StoreShape {
  users: User[];
  servers: ServerConfig[];
  /** Retained only to migrate pre-multi-server installs. */
  settings?: LegacySettings;
}

const CONFIG_FILE = () => path.join(config.managerConfigDir, "config.json");

let store: StoreShape = {
  users: [],
  servers: [],
};

function persist(): void {
  fs.mkdirSync(config.managerConfigDir, { recursive: true });
  fs.writeFileSync(CONFIG_FILE(), JSON.stringify(store, null, 2), "utf8");
}

/** Join segments for a Linux host path regardless of the manager's OS. */
function hostJoin(...parts: string[]): string {
  return parts.join("/").replace(/\/+/g, "/").replace(/\/$/, "");
}

function slugify(name: string, taken: Set<string>): string {
  let base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!base) base = "server";
  let id = base;
  let n = 2;
  while (taken.has(id)) id = `${base}-${n++}`;
  return id;
}

export function loadStore(): void {
  try {
    const raw = fs.readFileSync(CONFIG_FILE(), "utf8");
    const parsed = JSON.parse(raw) as Partial<StoreShape>;
    store = {
      users: parsed.users ?? [],
      servers: parsed.servers ?? [],
      settings: parsed.settings,
    };
  } catch {
    log.info("No existing manager config; starting fresh.");
  }

  // Seed the initial admin account if none exist.
  if (store.users.length === 0 && config.admin.user && config.admin.password) {
    const passwordHash = bcrypt.hashSync(config.admin.password, 10);
    store.users.push({ username: config.admin.user, passwordHash });
    log.info(`Seeded initial admin account "${config.admin.user}".`);
  }

  // Migrate a pre-multi-server install into a single default server that keeps
  // its existing container name and root data dir so nothing is lost.
  if (store.servers.length === 0) {
    store.servers.push({
      id: "main",
      name: "Main Server",
      version: store.settings?.version ?? config.vs.defaultVersion,
      channel: store.settings?.channel ?? config.vs.defaultChannel,
      gamePort: config.vs.gamePort,
      containerName: config.vs.containerName,
      hostDataDir: config.hostDataDir,
      dataDir: config.dataDir,
      createdAt: new Date().toISOString(),
    });
    log.info('Created default "Main Server".');
  }
  delete store.settings;
  persist();
}

export function findUser(username: string): User | undefined {
  return store.users.find((u) => u.username.toLowerCase() === username.toLowerCase());
}

export function verifyUser(username: string, password: string): boolean {
  const user = findUser(username);
  if (!user) return false;
  return bcrypt.compareSync(password, user.passwordHash);
}

export function changePassword(username: string, newPassword: string): boolean {
  const user = findUser(username);
  if (!user) return false;
  user.passwordHash = bcrypt.hashSync(newPassword, 10);
  persist();
  return true;
}

// ---- Server records ------------------------------------------------------

export function listServers(): ServerConfig[] {
  return store.servers.map((s) => ({ ...s }));
}

export function getServer(id: string): ServerConfig | undefined {
  const s = store.servers.find((s) => s.id === id);
  return s ? { ...s } : undefined;
}

export interface NewServerInput {
  name: string;
  version: string;
  channel: string;
  gamePort?: number;
}

function nextFreePort(): number {
  const used = new Set(store.servers.map((s) => s.gamePort));
  let port = config.vs.gamePort;
  while (used.has(port)) port += 1;
  return port;
}

export function addServer(input: NewServerInput): ServerConfig {
  const name = input.name.trim();
  if (!name) throw new Error("Server name is required.");
  const taken = new Set(store.servers.map((s) => s.id));
  const id = slugify(name, taken);
  const gamePort = input.gamePort && input.gamePort > 0 ? input.gamePort : nextFreePort();
  if (store.servers.some((s) => s.gamePort === gamePort)) {
    throw new Error(`Game port ${gamePort} is already used by another server.`);
  }
  const server: ServerConfig = {
    id,
    name,
    version: input.version,
    channel: input.channel,
    gamePort,
    containerName: `vsmanager-srv-${id}`,
    hostDataDir: hostJoin(config.hostDataDir, "servers", id),
    dataDir: path.join(config.dataDir, "servers", id),
    createdAt: new Date().toISOString(),
  };
  store.servers.push(server);
  persist();
  return { ...server };
}

export function updateServer(id: string, patch: Partial<ServerConfig>): ServerConfig | undefined {
  const server = store.servers.find((s) => s.id === id);
  if (!server) return undefined;
  // Only mutable, safe fields.
  if (patch.name !== undefined) server.name = patch.name;
  if (patch.version !== undefined) server.version = patch.version;
  if (patch.channel !== undefined) server.channel = patch.channel;
  persist();
  return { ...server };
}

export function removeServer(id: string): boolean {
  const idx = store.servers.findIndex((s) => s.id === id);
  if (idx === -1) return false;
  store.servers.splice(idx, 1);
  persist();
  return true;
}
