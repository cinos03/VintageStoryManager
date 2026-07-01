import { useCallback, useEffect, useMemo, useState } from "react";
import { api, type ServerInfo } from "./api";
import { Login } from "./components/Login";
import { Servers } from "./components/Servers";
import { Console } from "./components/Console";
import { Mods } from "./components/Mods";
import { ServerConfigPage } from "./components/ServerConfigPage";

type Tab = "servers" | "console" | "config" | "mods";

const SELECTED_KEY = "vsm.selectedServer";

export function App() {
  const [user, setUser] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [tab, setTab] = useState<Tab>("servers");
  const [servers, setServers] = useState<ServerInfo[]>([]);
  const [selectedId, setSelectedId] = useState<string>(
    () => localStorage.getItem(SELECTED_KEY) ?? ""
  );

  useEffect(() => {
    api
      .me()
      .then((r) => setUser(r.username))
      .catch(() => setUser(null))
      .finally(() => setChecking(false));
  }, []);

  const refreshServers = useCallback(() => {
    return api.servers
      .list()
      .then((r) => setServers(r.servers))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!user) return;
    refreshServers();
    const t = setInterval(refreshServers, 5000);
    return () => clearInterval(t);
  }, [user, refreshServers]);

  // Keep the selection valid and persisted.
  useEffect(() => {
    if (servers.length === 0) return;
    if (!servers.some((s) => s.id === selectedId)) {
      setSelectedId(servers[0].id);
    }
  }, [servers, selectedId]);

  useEffect(() => {
    if (selectedId) localStorage.setItem(SELECTED_KEY, selectedId);
  }, [selectedId]);

  const selected = useMemo(
    () => servers.find((s) => s.id === selectedId) ?? null,
    [servers, selectedId]
  );

  if (checking) return <div className="center muted">Loading…</div>;
  if (!user) return <Login onLogin={setUser} />;

  return (
    <div className="app">
      <header className="topbar">
        <h1>Vintage Story Server Manager</h1>
        <div className="topbar-right">
          {servers.length > 0 && (
            <label className="server-select">
              <span className="muted small">Server</span>
              <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
                {servers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} · {s.status.state}
                  </option>
                ))}
              </select>
            </label>
          )}
          <span className="muted">{user}</span>
          <button className="btn-ghost" onClick={() => api.logout().then(() => setUser(null))}>
            Log out
          </button>
        </div>
      </header>

      <nav className="tabs">
        {(["servers", "console", "config", "mods"] as Tab[]).map((t) => (
          <button
            key={t}
            className={`tab ${tab === t ? "active" : ""}`}
            onClick={() => setTab(t)}
          >
            {t === "servers"
              ? "Servers"
              : t === "console"
                ? "Console"
                : t === "config"
                  ? "Config"
                  : "Mods"}
          </button>
        ))}
      </nav>

      <main>
        {tab === "servers" && (
          <Servers servers={servers} onChange={refreshServers} selectedId={selectedId} />
        )}
        {tab === "console" && <Console server={selected} />}
        {tab === "config" && <ServerConfigPage server={selected} onChange={refreshServers} />}
        {tab === "mods" && <Mods server={selected} />}
      </main>
    </div>
  );
}
