import { useEffect, useState } from "react";
import { api, type GameVersion, type ServerStatus } from "../api";

const STATE_LABEL: Record<ServerStatus["state"], string> = {
  running: "Running",
  stopped: "Stopped",
  "not-created": "Not created",
  starting: "Starting…",
};

export function ServerControl({
  status,
  onChange,
}: {
  status: ServerStatus | null;
  onChange: (s: ServerStatus) => void;
}) {
  const [versions, setVersions] = useState<GameVersion[]>([]);
  const [version, setVersion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .versions()
      .then((r) => {
        setVersions(r.versions);
        setVersion((v) => v || status?.settings?.version || r.versions[0]?.version || "");
      })
      .catch((e) => setError((e as Error).message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!version && status?.settings?.version) setVersion(status.settings.version);
  }, [status, version]);

  const selected = versions.find((v) => v.version === version);

  const act = async (fn: () => Promise<ServerStatus>) => {
    setBusy(true);
    setError("");
    try {
      onChange(await fn());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const running = status?.state === "running" || status?.state === "starting";

  return (
    <div className="server-control">
      <h2>Server</h2>
      <div className={`status-badge ${status?.state ?? "unknown"}`}>
        {status ? STATE_LABEL[status.state] : "…"}
        {status?.version ? ` · ${status.version}` : ""}
      </div>

      <label className="field">
        Version
        <select
          value={version}
          onChange={(e) => setVersion(e.target.value)}
          disabled={running}
        >
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
            disabled={busy || !version}
            onClick={() => act(() => api.start(version, selected?.channel))}
          >
            Start
          </button>
        ) : (
          <button className="btn-danger" disabled={busy} onClick={() => act(api.stop)}>
            Stop
          </button>
        )}
        <button
          className="btn-ghost"
          disabled={busy || !running}
          onClick={() => act(api.restart)}
        >
          Restart
        </button>
      </div>

      {error && <div className="error">{error}</div>}
    </div>
  );
}
