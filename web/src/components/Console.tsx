import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import type { ServerStatus } from "../api";

export function Console({ status }: { status: ServerStatus | null }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      convertEol: true,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      fontSize: 13,
      theme: { background: "#0d1117", foreground: "#c9d1d9" },
      cursorBlink: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    fit.fit();
    termRef.current = term;

    let lineBuffer = "";
    // Local line editing: buffer keystrokes until Enter, then send the line.
    const onData = term.onData((data) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      for (const ch of data) {
        if (ch === "\r") {
          ws.send(lineBuffer);
          term.write("\r\n");
          lineBuffer = "";
        } else if (ch === "\u007f") {
          if (lineBuffer.length) {
            lineBuffer = lineBuffer.slice(0, -1);
            term.write("\b \b");
          }
        } else {
          lineBuffer += ch;
          term.write(ch);
        }
      }
    });

    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${window.location.host}/ws/console`);
    wsRef.current = ws;
    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onmessage = (ev) => term.write(typeof ev.data === "string" ? ev.data : "");

    const onResize = () => fit.fit();
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      onData.dispose();
      ws.close();
      term.dispose();
    };
  }, []);

  return (
    <div className="console">
      <div className="console-status">
        <span className={connected ? "dot on" : "dot off"} />
        {connected ? "Connected" : "Disconnected"}
        {status?.state !== "running" && (
          <span className="muted"> — server {status?.state ?? "unknown"}</span>
        )}
      </div>
      <div className="terminal" ref={containerRef} />
    </div>
  );
}
