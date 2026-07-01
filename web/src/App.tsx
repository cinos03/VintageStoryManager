import { useEffect, useState } from "react";
import { api, type ServerStatus } from "./api";
import { Login } from "./components/Login";
import { ServerControl } from "./components/ServerControl";
import { Console } from "./components/Console";
import { Mods } from "./components/Mods";

export function App() {
  const [user, setUser] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [status, setStatus] = useState<ServerStatus | null>(null);

  useEffect(() => {
    api
      .me()
      .then((r) => setUser(r.username))
      .catch(() => setUser(null))
      .finally(() => setChecking(false));
  }, []);

  const refreshStatus = () => api.status().then(setStatus).catch(() => {});

  useEffect(() => {
    if (!user) return;
    refreshStatus();
    const t = setInterval(refreshStatus, 5000);
    return () => clearInterval(t);
  }, [user]);

  if (checking) return <div className="center muted">Loading…</div>;
  if (!user) return <Login onLogin={setUser} />;

  return (
    <div className="app">
      <header className="topbar">
        <h1>Vintage Story Server Manager</h1>
        <div className="topbar-right">
          <span className="muted">{user}</span>
          <button
            className="btn-ghost"
            onClick={() => api.logout().then(() => setUser(null))}
          >
            Log out
          </button>
        </div>
      </header>

      <main className="grid">
        <section className="panel">
          <ServerControl status={status} onChange={setStatus} />
        </section>
        <section className="panel span2">
          <h2>Console</h2>
          <Console status={status} />
        </section>
        <section className="panel span2">
          <Mods status={status} />
        </section>
      </main>
    </div>
  );
}
