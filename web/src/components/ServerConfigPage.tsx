import { useCallback, useEffect, useState } from "react";
import { api, type ServerInfo } from "../api";

type Cfg = Record<string, unknown>;

/** Ordered display groups. First matching keyword (case-insensitive substring)
 *  wins; anything unmatched falls into "Other". Order here is display order.
 *  This only affects presentation — the saved JSON keeps its original order. */
const GROUPS: { name: string; keywords: string[] }[] = [
  { name: "Mods", keywords: ["mod"] },
  {
    name: "Players & Access",
    keywords: [
      "whitelist",
      "blacklist",
      "ban",
      "role",
      "auth",
      "admin",
      "verifyplayer",
      "group",
      "spawn",
    ],
  },
  {
    name: "Network & Connectivity",
    keywords: [
      "ip",
      "port",
      "upnp",
      "advertise",
      "maxclients",
      "clientsinqueue",
      "compresspackets",
      "serverlanguage",
      "public",
      "host",
      "url",
    ],
  },
  {
    name: "World & Gameplay",
    keywords: [
      "world",
      "chunk",
      "seed",
      "playstyle",
      "mapsize",
      "map",
      "save",
      "backup",
      "gamemode",
      "sleep",
      "season",
      "calendar",
      "weather",
      "temporal",
      "block",
      "entity",
      "generat",
      "day",
      "creative",
      "hostedmode",
    ],
  },
  {
    name: "Performance",
    keywords: ["tick", "thread", "afk", "timeout", "queue", "async", "framerate", "radius", "kick"],
  },
  {
    name: "General",
    keywords: [
      "servername",
      "description",
      "welcome",
      "config",
      "fileedit",
      "password",
      "language",
      "motd",
      "name",
    ],
  },
];

function categoryFor(key: string): string {
  const lower = key.toLowerCase();
  for (const g of GROUPS) {
    if (g.keywords.some((k) => lower.includes(k))) return g.name;
  }
  return "Other";
}

/** Turn "MaxClientsInQueue" / "UpnpInfiniteLifetime" into "Max Clients In Queue". */
function humanize(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .trim();
}

type ValueKind = "boolean" | "number" | "string" | "null" | "json";

function kindOf(value: unknown): ValueKind {
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return "number";
  if (typeof value === "string") return "string";
  if (value === null) return "null";
  return "json"; // arrays / objects
}

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
  // Local text drafts for object/array (JSON) fields, so invalid intermediate
  // typing doesn't wipe the value. Keyed by config key.
  const [jsonDrafts, setJsonDrafts] = useState<Record<string, string>>({});
  const [jsonErrors, setJsonErrors] = useState<Record<string, string>>({});
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
        setJsonDrafts({});
        setJsonErrors({});
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

  const setJsonField = (key: string, text: string) => {
    setJsonDrafts((d) => ({ ...d, [key]: text }));
    setNotice("");
    try {
      const parsed = JSON.parse(text);
      setJsonErrors((e) => {
        const rest = { ...e };
        delete rest[key];
        return rest;
      });
      setField(key, parsed);
    } catch (e) {
      setJsonErrors((prev) => ({ ...prev, [key]: (e as Error).message }));
    }
  };

  const onRawChange = (text: string) => {
    setRaw(text);
    setNotice("");
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        setConfig(parsed as Cfg);
        setRawError("");
        setJsonDrafts({});
        setJsonErrors({});
      } else {
        setRawError("Config must be a JSON object.");
      }
    } catch (e) {
      setRawError((e as Error).message);
    }
  };

  const doSave = async (restart: boolean) => {
    if (!serverId || rawError || Object.keys(jsonErrors).length > 0) return;
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

  // Group the entries for display while preserving original key order within groups.
  const groupOrder = [...GROUPS.map((g) => g.name), "Other"];
  const grouped = new Map<string, string[]>();
  for (const key of Object.keys(config)) {
    const cat = categoryFor(key);
    const list = grouped.get(cat) ?? [];
    list.push(key);
    grouped.set(cat, list);
  }

  const renderField = (key: string) => {
    const value = config[key];
    const kind = kindOf(value);

    if (kind === "boolean") {
      return (
        <label key={key} className="cfg-field cfg-bool" title={key}>
          <input
            type="checkbox"
            checked={value as boolean}
            onChange={(e) => setField(key, e.target.checked)}
          />
          <span>{humanize(key)}</span>
        </label>
      );
    }

    if (kind === "json") {
      const text = jsonDrafts[key] ?? JSON.stringify(value, null, 2);
      const err = jsonErrors[key];
      return (
        <label key={key} className="cfg-field span-2" title={key}>
          {humanize(key)}
          <textarea
            className="cfg-json"
            spellCheck={false}
            value={text}
            onChange={(e) => setJsonField(key, e.target.value)}
          />
          {err && <span className="error small">Invalid JSON: {err}</span>}
        </label>
      );
    }

    if (kind === "number") {
      return (
        <label key={key} className="cfg-field" title={key}>
          {humanize(key)}
          <input
            type="number"
            value={value as number}
            onChange={(e) => {
              const v = e.target.value;
              setField(key, v === "" ? null : Number(v));
            }}
          />
        </label>
      );
    }

    // string or null → text input
    const isNull = kind === "null";
    return (
      <label key={key} className="cfg-field" title={key}>
        {humanize(key)}
        <input
          type="text"
          value={isNull ? "" : (value as string)}
          placeholder={isNull ? "null" : undefined}
          onChange={(e) => {
            const v = e.target.value;
            // Keep null when the box is emptied for a field that started null.
            setField(key, v === "" && isNull ? null : v);
          }}
        />
      </label>
    );
  };

  return (
    <div className="config-page">
      <div className="config-head">
        <h2>Configuration — {server.name}</h2>
        <div className="btn-row">
          <button className="btn-ghost" onClick={load} disabled={loading || saving}>
            Reload
          </button>
          <button
            onClick={() => setShowSave(true)}
            disabled={loading || saving || !!rawError || Object.keys(jsonErrors).length > 0}
          >
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
        Every field is loaded live from serverconfig.json. Changes take effect after a server
        restart — saving lets you restart now or later.
      </p>

      {groupOrder.map((groupName) => {
        const keys = grouped.get(groupName);
        if (!keys || keys.length === 0) return null;
        return (
          <section key={groupName} className="config-section">
            <h3 className="config-section-title">{groupName}</h3>
            <div className="config-grid">{keys.map(renderField)}</div>
          </section>
        );
      })}

      {Object.keys(config).length === 0 && (
        <div className="muted">
          Configuration is empty. Save to create a fresh serverconfig.json.
        </div>
      )}

      <details className="config-raw">
        <summary>Advanced — raw serverconfig.json</summary>
        <p className="muted small">
          Edit the whole file directly. On valid JSON, the fields above stay in sync.
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
