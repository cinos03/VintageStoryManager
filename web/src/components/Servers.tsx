import { useEffect, useState } from "react";
import { api, type GameVersion, type ServerInfo, type ServerStatus } from "../api";

const STATE_LABEL: Record<ServerStatus["state"], string> = {
  running: "Running",
  stopped: "Stopped",
  "not-created": "Not created",
  starting: "Starting…",
};

export function Servers({
  servers,
  onChange,
  selectedId,
}: {
  servers: ServerInfo[];
  onChange: () => Promise<void> | void;
  selectedId: string;
}) {
  const [versions, setVersions] = useState<GameVersion[]>([]);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  // Add-server form state.
  const [newName, setNewName] = useState("");
  const [newVersion, setNewVersion] = useState("");
  const [newPort, setNewPort] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    api
      .versions()
      .then((r) => {
        setVersions(r.versions);
        setNewVersion((v) => v || r.versions[0]?.version || "");
      })
      .catch((e) => setError((e as Error).message));
  }, []);

  const channelFor = (version: string) =>
    versions.find((v) => v.version === version)?.channel ?? "stable";

  const act = async (id: string, fn: () => Promise<unknown>) => {
    setBusyId(id);
    setError("");
    try {
      await fn();
      await onChange();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const changeVersion = async (server: ServerInfo, version: string) => {
    await act(server.id, () =>
      api.servers.update(server.id, { version, channel: channelFor(version) })
    );
  };

  const remove = async (server: ServerInfo) => {
    if (
      !confirm(
        `Delete "${server.name}"? This stops and removes its container. World data on disk is kept.`
      )
    )
      return;
    await act(server.id, () => api.servers.remove(server.id));
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newVersion) return;
    setCreating(true);
    setError("");
    try {
      const port = Number(newPort);
      await api.servers.create({
        name: newName.trim(),
        version: newVersion,
        channel: channelFor(newVersion),
        gamePort: Number.isFinite(port) && port > 0 ? port : undefined,
      });
      setNewName("");
      setNewPort("");
      await onChange();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="servers-tab">
      {error && <div className="error">{error}</div>}

      <div className="server-cards">
        {servers.map((s) => {
          const running = s.status.state === "running" || s.status.state === "starting";
          const busy = busyId === s.id;
          return (
            <div
              key={s.id}
              className={`panel server-card ${s.id === selectedId ? "selected" : ""}`}
            >
              <div className="server-card-head">
                <div>
                  <h3>{s.name}</h3>
                  <div className="muted small">
                    port {s.gamePort} · {s.containerName}
                  </div>
                </div>
                <span className={`status-badge ${s.status.state}`}>
                  {STATE_LABEL[s.status.state]}
                  {s.status.version ? ` · ${s.status.version}` : ""}
                </span>
              </div>

              <label className="field">
                Version
                <select
                  value={s.version}
                  disabled={running || busy}
                  onChange={(e) => changeVersion(s, e.target.value)}
                >
                  {versions.length === 0 && <option value={s.version}>{s.version}</option>}
                  {versions.map((v) => (
                    <option key={`${v.channel}-${v.version}`} value={v.version}>
                      {v.version} {v.channel === "unstable" ? "(unstable)" : ""}
                    </option>
                  ))}
                </select>
              </label>

              <div className="btn-row">
                {!running ? (
                  <button
                    disabled={busy}
                    onClick={() =>
                      act(s.id, () => api.servers.start(s.id, s.version, channelFor(s.version)))
                    }
                  >
                    Start
                  </button>
                ) : (
                  <button
                    className="btn-danger"
                    disabled={busy}
                    onClick={() => act(s.id, () => api.servers.stop(s.id))}
                  >
                    Stop
                  </button>
                )}
                <button
                  className="btn-ghost"
                  disabled={busy || !running}
                  onClick={() => act(s.id, () => api.servers.restart(s.id))}
                >
                  Restart
                </button>
                <button
                  className="btn-danger"
                  disabled={busy}
                  onClick={() => remove(s)}
                >
                  Delete
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <form className="panel add-server" onSubmit={create}>
        <h3>Add a server</h3>
        <div className="add-server-row">
          <label className="field">
            Name
            <input
              value={newName}
              placeholder="My Server"
              onChange={(e) => setNewName(e.target.value)}
            />
          </label>
          <label className="field">
            Version
            <select value={newVersion} onChange={(e) => setNewVersion(e.target.value)}>
              {versions.map((v) => (
                <option key={`${v.channel}-${v.version}`} value={v.version}>
                  {v.version} {v.channel === "unstable" ? "(unstable)" : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Port (optional)
            <input
              value={newPort}
              placeholder="auto"
              inputMode="numeric"
              onChange={(e) => setNewPort(e.target.value)}
            />
          </label>
          <button type="submit" disabled={creating || !newName.trim() || !newVersion}>
            {creating ? "Creating…" : "Create"}
          </button>
        </div>
      </form>
    </div>
  );
}
