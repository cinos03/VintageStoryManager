import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import express from "express";
import cookieParser from "cookie-parser";
import { config } from "./config";
import { log } from "./logger";
import { loadStore } from "./db";
import { dockerManager } from "./dockerManager";
import { attachConsoleWebSocket } from "./ws";
import { authRouter } from "./routes/auth";
import { serverRouter } from "./routes/server";
import { versionsRouter } from "./routes/versions";
import { modsRouter } from "./routes/mods";
import { consoleRouter } from "./routes/console";

async function main(): Promise<void> {
  loadStore();
  await dockerManager.init();

  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());

  app.get("/api/health", (_req, res) => res.json({ ok: true }));
  app.use("/api/auth", authRouter);
  app.use("/api/server", serverRouter);
  app.use("/api/versions", versionsRouter);
  app.use("/api/mods", modsRouter);
  app.use("/api/console", consoleRouter);

  // Serve the built frontend (SPA) if present.
  const publicDir = process.env.PUBLIC_DIR ?? path.join(__dirname, "..", "public");
  if (fs.existsSync(publicDir)) {
    app.use(express.static(publicDir));
    app.get(/^(?!\/api|\/ws).*/, (_req, res) => {
      res.sendFile(path.join(publicDir, "index.html"));
    });
    log.info(`Serving web UI from ${publicDir}`);
  } else {
    log.warn(`No web UI found at ${publicDir} (run the frontend build).`);
  }

  const server = http.createServer(app);
  attachConsoleWebSocket(server);

  server.listen(config.port, () => {
    log.info(`Vintage Story Manager listening on :${config.port}`);
  });
}

main().catch((err) => {
  log.error("Fatal startup error:", err);
  process.exit(1);
});
