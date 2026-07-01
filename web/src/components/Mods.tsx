import { useCallback, useEffect, useRef, useState } from "react";
import { api, type InstalledMod, type ModSummary, type ServerInfo } from "../api";

export function Mods({ server }: { server: ServerInfo | null }) {
  const [installed, setInstalled] = useState<InstalledMod[]>([]);
  const [results, setResults] = useState<ModSummary[]>([]);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const serverId = server?.id ?? null;
  const gv = server?.version;

  const loadInstalled = useCallback(() => {
    if (!serverId) {
      setInstalled([]);
      return;
    }
    api.mods
      .installed(serverId)
      .then((r) => setInstalled(r.mods))
      .catch((e) => setError((e as Error).message));
  }, [serverId]);

  useEffect(() => {
    setResults([]);
    loadInstalled();
  }, [loadInstalled]);

  const search = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!serverId) return;
    setSearching(true);
    setError("");
    try {
      const r = await api.mods.search(serverId, query, gv);
      setResults(r.mods);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSearching(false);
    }
  };

  const install = async (mod: ModSummary) => {
    if (!serverId) return;
    setBusyId(mod.modId);
    setError("");
    try {
      await api.mods.install(serverId, mod.modId, gv);
      loadInstalled();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !serverId) return;
    setError("");
    try {
      await api.mods.upload(serverId, file);
      loadInstalled();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const remove = async (file: string) => {
    if (!serverId) return;
    if (!confirm(`Remove ${file}?`)) return;
    try {
      await api.mods.remove(serverId, file);
      loadInstalled();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  if (!server) {
    return <div className="muted">Select or create a server to manage its mods.</div>;
  }

  return (
    <div className="mods panel">
      <h2>Mods — {server.name}</h2>
      {error && <div className="error">{error}</div>}

      <div className="mods-cols">
        <div>
          <div className="mods-head">
            <h3>Installed ({installed.length})</h3>
            <label className="btn-ghost upload-btn">
              Import file
              <input
                ref={fileRef}
                type="file"
                accept=".zip,.cs,.dll"
                onChange={upload}
                hidden
              />
            </label>
          </div>
          <ul className="mod-list">
            {installed.length === 0 && <li className="muted">No mods installed.</li>}
            {installed.map((m) => (
              <li key={m.file}>
                <div>
                  <strong>{m.name ?? m.file}</strong>
                  {m.version && <span className="muted"> v{m.version}</span>}
                  <div className="muted small">{m.file}</div>
                </div>
                <button className="btn-danger small" onClick={() => remove(m.file)}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3>Browse mods.vintagestory.at</h3>
          <form className="search-row" onSubmit={search}>
            <input
              placeholder="Search mods…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button type="submit" disabled={searching}>
              {searching ? "…" : "Search"}
            </button>
          </form>
          <ul className="mod-list">
            {results.map((m) => (
              <li key={m.modId}>
                <div>
                  <strong>{m.name}</strong>
                  {m.downloads != null && (
                    <span className="muted small"> · {m.downloads.toLocaleString()} dl</span>
                  )}
                  <div className="muted small">{m.summary}</div>
                </div>
                <button
                  className="small"
                  disabled={busyId === m.modId}
                  onClick={() => install(m)}
                >
                  {busyId === m.modId ? "Installing…" : "Install"}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
