import { useCallback, useEffect, useState } from "react";
import { api, type ServerInfo } from "../api";

type Cfg = Record<string, unknown>;

const asString = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : String(v));
const asNumber = (v: unknown): string =>
  typeof v === "number" ? String(v) : typeof v === "string" && v.trim() !== "" ? v : "";

/** Common serverconfig.json fields surfaced as friendly inputs. */
const WHITELIST_MODES = ["off", "on", "authserveroffline"];

export function ServerConfigPage({
  server,
  onChange,
}: {
  server: ServerInfo | null;
  onChange: () => void;
}) {
  const [config, setConfig] = useState<Cfg>({});
  const [raw, setRaw] = useState("{}");
  const [rawError, setRawError] = useState("");
  const [exists, setExists] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showSave, setShowSave] = useState(false);
  const [saving, setSaving] = useState(false);

  const serverId = server?.id ?? null;
  const running = server?.status.state === "running";

  const load = useCallback(() => {
    if (!serverId) return;
    setLoading(true);
    setError("");
    setNotice("");
    api.servers
      .getConfig(serverId)
      .then((r) => {
        setExists(r.exists);
        setConfig(r.config);
        setRaw(JSON.stringify(r.config, null, 2));
        setRawError("");
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [serverId]);

  useEffect(() => {
    load();
  }, [load]);

  // Update one field; keep the raw JSON view in sync.
  const setField = (key: string, value: unknown) => {
    setConfig((prev) => {
      const next = { ...prev, [key]: value };
      setRaw(JSON.stringify(next, null, 2));
      return next;
    });
    setNotice("");
  };

  const onRawChange = (text: string) => {
    setRaw(text);
    setNotice("");
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        setConfig(parsed as Cfg);
        setRawError("");
      } else {
        setRawError("Config must be a JSON object.");
      }
    } catch (e) {
      setRawError((e as Error).message);
    }
  };

  const doSave = async (restart: boolean) => {
    if (!serverId || rawError) return;
    setShowSave(false);
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const r = await api.servers.saveConfig(serverId, config, restart);
      setNotice(r.restarted ? "Saved and restarting the server…" : "Configuration saved.");
      onChange();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (!server) {
    return <div className="muted">Select or create a server to edit its configuration.</div>;
  }

  return (
    <div className="config-page">
      <div className="config-head">
        <h2>Configuration — {server.name}</h2>
        <div className="btn-row">
          <button className="btn-ghost" onClick={load} disabled={loading || saving}>
            Reload
          </button>
          <button onClick={() => setShowSave(true)} disabled={loading || saving || !!rawError}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {error && <div className="error">{error}</div>}
      {notice && <div className="notice">{notice}</div>}
      {!exists && (
        <div className="notice">
          No serverconfig.json exists yet. It's created when the server first runs; saving here will
          create one.
        </div>
      )}
      <p className="muted small">
        Changes take effect after a server restart. Saving lets you restart now or later.
      </p>

      <div className="config-grid">
        <label className="field">
          Server name
          <input
            value={asString(config.ServerName)}
            onChange={(e) => setField("ServerName", e.target.value)}
          />
        </label>
        <label className="field">
          Max clients
          <input
            inputMode="numeric"
            value={asNumber(config.MaxClients)}
            onChange={(e) => {
              const val = e.target.value;
              if (val.trim() === "") setField("MaxClients", "");
              else {
                const n = Number(val);
                setField("MaxClients", Number.isFinite(n) ? n : val);
              }
            }}
          />
        </label>
        <label className="field span-2">
          Server description
          <input
            value={asString(config.ServerDescription)}
            onChange={(e) => setField("ServerDescription", e.target.value)}
          />
        </label>
        <label className="field span-2">
          Welcome message
          <input
            value={asString(config.WelcomeMessage)}
            onChange={(e) => setField("WelcomeMessage", e.target.value)}
          />
        </label>
        <label className="field">
          Password
          <input
            value={asString(config.Password)}
            placeholder="(none)"
            onChange={(e) => setField("Password", e.target.value)}
          />
        </label>
        <label className="field">
          Whitelist mode
          <select
            value={asString(config.WhitelistMode) || "off"}
            onChange={(e) => setField("WhitelistMode", e.target.value)}
          >
            {WHITELIST_MODES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
            {!!config.WhitelistMode &&
              !WHITELIST_MODES.includes(asString(config.WhitelistMode)) && (
                <option value={asString(config.WhitelistMode)}>
                  {asString(config.WhitelistMode)}
                </option>
              )}
          </select>
        </label>
      </div>

      <details className="config-raw">
        <summary>Advanced — raw serverconfig.json</summary>
        <p className="muted small">
          Edit any field directly (roles, whitelist entries, spawn settings, etc.). The form above
          stays in sync with valid JSON.
        </p>
        {rawError && <div className="error">Invalid JSON: {rawError}</div>}
        <textarea
          className="config-textarea"
          spellCheck={false}
          value={raw}
          onChange={(e) => onRawChange(e.target.value)}
        />
      </details>

      {showSave && (
        <div className="modal-overlay" onMouseDown={() => setShowSave(false)}>
          <div className="modal-card" onMouseDown={(e) => e.stopPropagation()}>
            <h3 className="modal-title">Save configuration</h3>
            <p className="modal-message">
              {running
                ? "The server is running. Restart now to apply changes, or save and restart later on your own."
                : "Save the configuration. It will take effect the next time the server starts."}
            </p>
            <div className="modal-actions">
              <button className="btn-ghost" onClick={() => setShowSave(false)}>
                Cancel
              </button>
              <button className="btn-ghost" onClick={() => doSave(false)}>
                Save only
              </button>
              {running && (
                <button className="btn-danger" onClick={() => doSave(true)}>
                  Save &amp; restart
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
