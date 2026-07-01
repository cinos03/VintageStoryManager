import type { Server as HttpServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { verifyToken } from "./auth";
import { registry } from "./dockerManager";
import { getServer } from "./db";
import { log } from "./logger";

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

function query(url: string | undefined): URLSearchParams {
  return new URLSearchParams((url ?? "").split("?")[1] ?? "");
}

function authorize(url: string | undefined, cookieHeader: string | undefined): boolean {
  // Token may arrive as a cookie or as a ?token= query param (for browsers that
  // can't set headers on the WebSocket handshake).
  const cookies = parseCookies(cookieHeader);
  let token = cookies.token;
  if (!token && url) {
    token = query(url).get("token") ?? "";
  }
  return !!token && !!verifyToken(token);
}

export function attachConsoleWebSocket(server: HttpServer): void {
  const wss = new WebSocketServer({ server, path: "/ws/console" });

  wss.on("connection", (ws: WebSocket, req) => {
    if (!authorize(req.url, req.headers.cookie)) {
      ws.close(4401, "Unauthorized");
      return;
    }

    // Which server's console to attach to.
    const serverId = query(req.url).get("server") ?? "";
    const target = getServer(serverId);
    if (!target) {
      ws.send(`\r\n[manager] Unknown server "${serverId}"\r\n`);
      ws.close(4404, "Unknown server");
      return;
    }
    const runner = registry.get(target);

    // Hydrate the terminal with recent output.
    const buffered = runner.getBufferedOutput();
    if (buffered.length) ws.send(buffered.toString("utf8"));

    const onData = (chunk: Buffer) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(chunk.toString("utf8"));
    };
    runner.on("data", onData);

    ws.on("message", (raw) => {
      // Incoming messages are raw keystrokes / commands typed in the terminal.
      const text = raw.toString();
      try {
        runner.sendCommand(text.replace(/\r?\n$/, ""));
      } catch (err) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(`\r\n[manager] ${(err as Error).message}\r\n`);
        }
      }
    });

    ws.on("close", () => runner.off("data", onData));
    ws.on("error", (err) => log.warn("console ws error:", err));
  });

  log.info("Console WebSocket ready at /ws/console");
}
