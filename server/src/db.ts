import fs from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import { config } from "./config";
import { log } from "./logger";

export interface User {
  username: string;
  passwordHash: string;
}

export interface Settings {
  version: string;
  channel: string;
}

interface StoreShape {
  users: User[];
  settings: Settings;
}

const CONFIG_FILE = () => path.join(config.managerConfigDir, "config.json");

let store: StoreShape = {
  users: [],
  settings: { version: config.vs.defaultVersion, channel: config.vs.defaultChannel },
};

function persist(): void {
  fs.mkdirSync(config.managerConfigDir, { recursive: true });
  fs.writeFileSync(CONFIG_FILE(), JSON.stringify(store, null, 2), "utf8");
}

export function loadStore(): void {
  try {
    const raw = fs.readFileSync(CONFIG_FILE(), "utf8");
    const parsed = JSON.parse(raw) as Partial<StoreShape>;
    store = {
      users: parsed.users ?? [],
      settings: {
        version: parsed.settings?.version ?? config.vs.defaultVersion,
        channel: parsed.settings?.channel ?? config.vs.defaultChannel,
      },
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

export function getSettings(): Settings {
  return { ...store.settings };
}

export function updateSettings(next: Partial<Settings>): Settings {
  store.settings = { ...store.settings, ...next };
  persist();
  return getSettings();
}
