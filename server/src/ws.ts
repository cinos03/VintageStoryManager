import type { Server as HttpServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { verifyToken } from "./auth";
import { dockerManager } from "./dockerManager";
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

function authorize(url: string | undefined, cookieHeader: string | undefined): boolean {
  // Token may arrive as a cookie or as a ?token= query param (for browsers that
  // can't set headers on the WebSocket handshake).
  const cookies = parseCookies(cookieHeader);
  let token = cookies.token;
  if (!token && url) {
    const q = new URLSearchParams(url.split("?")[1] ?? "");
    token = q.get("token") ?? "";
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

    // Hydrate the terminal with recent output.
    const buffered = dockerManager.getBufferedOutput();
    if (buffered.length) ws.send(buffered.toString("utf8"));

    const onData = (chunk: Buffer) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(chunk.toString("utf8"));
    };
    dockerManager.on("data", onData);

    ws.on("message", (raw) => {
      // Incoming messages are raw keystrokes / commands typed in the terminal.
      const text = raw.toString();
      try {
        dockerManager.sendCommand(text.replace(/\r?\n$/, ""));
      } catch (err) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(`\r\n[manager] ${(err as Error).message}\r\n`);
        }
      }
    });

    ws.on("close", () => dockerManager.off("data", onData));
    ws.on("error", (err) => log.warn("console ws error:", err));
  });

  log.info("Console WebSocket ready at /ws/console");
}
