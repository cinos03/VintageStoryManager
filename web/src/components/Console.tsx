import { useEffect, useMemo, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { api, type CommandDef, type ServerInfo } from "../api";

function fillTemplate(template: string, args: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_m, name) => args[name] ?? `{${name}}`);
}

export function Console({ server }: { server: ServerInfo | null }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);

  const [commands, setCommands] = useState<CommandDef[]>([]);
  const [selected, setSelected] = useState<CommandDef | null>(null);
  const [args, setArgs] = useState<Record<string, string>>({});
  const [compose, setCompose] = useState("");
  const [error, setError] = useState("");

  const serverId = server?.id ?? null;
  const running = server?.status.state === "running";

  // Create the terminal once.
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
    fitRef.current = fit;

    let lineBuffer = "";
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

    const onResize = () => fit.fit();
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      onData.dispose();
      term.dispose();
    };
  }, []);

  // Load the command catalog once.
  useEffect(() => {
    api
      .commands()
      .then((r) => setCommands(r.commands))
      .catch((e) => setError((e as Error).message));
  }, []);

  // (Re)connect the WebSocket whenever the selected server changes.
  useEffect(() => {
    const term = termRef.current;
    if (!term || !serverId) {
      setConnected(false);
      return;
    }
    term.clear();
    term.write(`\r\n[manager] Connecting to ${serverId}…\r\n`);
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(
      `${proto}://${window.location.host}/ws/console?server=${encodeURIComponent(serverId)}`
    );
    wsRef.current = ws;
    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onmessage = (ev) => term.write(typeof ev.data === "string" ? ev.data : "");
    fitRef.current?.fit();

    return () => {
      ws.close();
      wsRef.current = null;
      setConnected(false);
    };
  }, [serverId]);

  const grouped = useMemo(() => {
    const map = new Map<string, CommandDef[]>();
    for (const c of commands) {
      const list = map.get(c.category) ?? [];
      list.push(c);
      map.set(c.category, list);
    }
    return [...map.entries()];
  }, [commands]);

  const selectCommand = (cmd: CommandDef) => {
    const initial: Record<string, string> = {};
    for (const a of cmd.args ?? []) initial[a.name] = a.options?.[0] ?? "";
    setSelected(cmd);
    setArgs(initial);
    setCompose(fillTemplate(cmd.template, initial));
  };

  const setArg = (name: string, value: string) => {
    const next = { ...args, [name]: value };
    setArgs(next);
    if (selected) setCompose(fillTemplate(selected.template, next));
  };

  const send = async () => {
    if (!serverId || !compose.trim()) return;
    setError("");
    try {
      await api.console.command(serverId, compose.trim());
    } catch (e) {
      setError((e as Error).message);
    }
  };

  if (!server) {
    return <div className="muted">Select or create a server to open its console.</div>;
  }

  return (
    <div className="console-tab">
      <div className="console-main panel">
        <div className="console-status">
          <span className={connected ? "dot on" : "dot off"} />
          {connected ? "Connected" : "Disconnected"}
          <span className="muted"> — {server.name} ({server.status.state})</span>
        </div>
        <div className="terminal" ref={containerRef} />

        <div className="compose">
          <input
            className="compose-input"
            placeholder={running ? "Type a command and press Send…" : "Server is not running"}
            value={compose}
            disabled={!running}
            onChange={(e) => setCompose(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") send();
            }}
          />
          <button disabled={!running || !compose.trim()} onClick={send}>
            Send
          </button>
        </div>

        {selected && (selected.args?.length ?? 0) > 0 && (
          <div className="compose-args">
            {selected.args!.map((a) => (
              <label key={a.name} className="field inline">
                {a.label}
                {a.options ? (
                  <select value={args[a.name] ?? ""} onChange={(e) => setArg(a.name, e.target.value)}>
                    {a.options.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={args[a.name] ?? ""}
                    placeholder={a.placeholder}
                    onChange={(e) => setArg(a.name, e.target.value)}
                  />
                )}
              </label>
            ))}
          </div>
        )}

        {error && <div className="error">{error}</div>}
      </div>

      <div className="command-palette panel">
        <h3>Commands</h3>
        <p className="muted small">
          Click a command to load it below, tweak any values, then Send.
        </p>
        {grouped.map(([category, list]) => (
          <div key={category} className="command-group">
            <div className="command-group-label">{category}</div>
            {list.map((cmd) => (
              <button
                key={cmd.id}
                className={`command-item ${selected?.id === cmd.id ? "active" : ""}`}
                onClick={() => selectCommand(cmd)}
                title={cmd.description}
              >
                <span className="command-label">{cmd.label}</span>
                <span className="command-template muted small">{cmd.template}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
