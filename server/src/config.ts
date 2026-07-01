import path from "node:path";

function env(name: string, fallback?: string): string {
  const v = process.env[name];
  if (v === undefined || v === "") {
    if (fallback !== undefined) return fallback;
    return "";
  }
  return v;
}

export const config = {
  port: parseInt(env("MANAGER_PORT", "8080"), 10),
  jwtSecret: env("JWT_SECRET", "insecure-dev-secret-change-me"),

  admin: {
    user: env("ADMIN_USER", "admin"),
    password: env("ADMIN_PASSWORD", ""),
  },

  vs: {
    defaultVersion: env("VS_VERSION", "1.22.3"),
    defaultChannel: env("VS_CHANNEL", "stable"),
    gamePort: parseInt(env("VS_GAME_PORT", "42420"), 10),
    containerName: env("VS_CONTAINER_NAME", "vs-server"),
    image: env("VS_SERVER_IMAGE", "vsmanager-vs-server:latest"),
    network: env("VS_NETWORK", ""),
  },

  // Absolute HOST paths (as seen by the docker daemon) used for bind mounts of the game container.
  hostDataDir: env("HOST_DATA_DIR", ""),
  hostGameDir: env("HOST_GAME_DIR", ""),

  // Paths as seen INSIDE the manager container (compose mounts the same host dirs here).
  dataDir: env("MANAGER_DATA_DIR", "/data"),

  get modsDir(): string {
    return path.join(this.dataDir, "Mods");
  },
  get managerConfigDir(): string {
    return path.join(this.dataDir, "manager");
  },
};

export type AppConfig = typeof config;
