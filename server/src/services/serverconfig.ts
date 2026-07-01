import fs from "node:fs";
import path from "node:path";
import { log } from "../logger";

/**
 * Read/write helpers for a Vintage Story server's `serverconfig.json`, which the
 * game reads from its data path. Editing requires a server restart to take
 * effect. We treat the file as opaque JSON so we never drop fields we don't know
 * about — the UI surfaces common fields plus a raw editor for everything else.
 */

export type ServerConfigJson = Record<string, unknown>;

function configPath(dataDir: string): string {
  return path.join(dataDir, "serverconfig.json");
}

/** Returns the parsed serverconfig.json, or null if it doesn't exist yet. */
export function readServerConfig(dataDir: string): ServerConfigJson | null {
  const file = configPath(dataDir);
  if (!fs.existsSync(file)) return null;
  const raw = fs.readFileSync(file, "utf8");
  return JSON.parse(raw) as ServerConfigJson;
}

/** Writes the given config object back, pretty-printed. */
export function writeServerConfig(dataDir: string, data: ServerConfigJson): void {
  fs.mkdirSync(dataDir, { recursive: true });
  const file = configPath(dataDir);
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
  log.info(`Wrote serverconfig.json (${file})`);
}
