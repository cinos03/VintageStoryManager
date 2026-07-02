import { useCallback, useEffect, useState } from "react";
import { api, type ServerInfo } from "../api";

type Cfg = Record<string, unknown>;

/** Keys that are noise in the friendly form — still editable via raw JSON. */
const HIDDEN_KEYS = new Set(["LastLaunchMods", "ModDbUrl"]);

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

/** Short, readable representation of a value for the "default:" hint. */
function fmtDefault(v: unknown): string {
  if (v === null || v === undefined) return "null";
  if (typeof v === "string") return v.length > 40 ? `"${v.slice(0, 40)}…"` : `"${v}"`;
  if (typeof v === "boolean" || typeof v === "number") return String(v);
  const j = JSON.stringify(v);
  return j.length > 40 ? `${j.slice(0, 40)}…` : j;
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

function commaSplit(text: string): string[] {
  return text
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Truthy check for the various ways WhitelistMode "on" can be stored. */
function whitelistOn(v: unknown): boolean {
  return v === "on" || v === "On" || v === 2 || v === true;
}

export function ServerConfigPage({
  server,
  onChange,
}: {
  server: ServerInfo | null;
  onChange: () => void;
}) {
  const [config, setConfig] = useState<Cfg>({});
  const [original, setOriginal] = useState<Cfg>({});
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
        setOriginal(r.config);
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
    if (HIDDEN_KEYS.has(key)) continue;
    const cat = categoryFor(key);
    const list = grouped.get(cat) ?? [];
    list.push(key);
    grouped.set(cat, list);
  }

  /** A field label with the loaded ("default") value hinted alongside. */
  const labelWithDefault = (key: string) => (
    <>
      {humanize(key)}
      {key in original && (
        <span className="muted small cfg-default"> · default: {fmtDefault(original[key])}</span>
      )}
    </>
  );

  const renderField = (key: string) => {
    const value = config[key];

    // Whitelist mode: a simple on/off checkbox that writes the string enum.
    if (key === "WhitelistMode") {
      return (
        <label key={key} className="cfg-field cfg-bool" title={key}>
          <input
            type="checkbox"
            checked={whitelistOn(value)}
            onChange={(e) => setField(key, e.target.checked ? "on" : "off")}
          />
          <span>{labelWithDefault(key)}</span>
        </label>
      );
    }

    // Roles get a dedicated, intuitive editor.
    if (key === "Roles" && Array.isArray(value)) {
      return (
        <RolesEditor key={key} roles={value} onChange={(next) => setField(key, next)} />
      );
    }

    // Lists of strings (e.g. ModPaths) → one comma-separated line.
    if (isStringArray(value)) {
      return (
        <label key={key} className="cfg-field" title={key}>
          {labelWithDefault(key)}
          <input
            type="text"
            value={value.join(", ")}
            onChange={(e) => setField(key, commaSplit(e.target.value))}
          />
          <span className="muted small">Comma-separated list</span>
        </label>
      );
    }

    if (typeof value === "boolean") {
      return (
        <label key={key} className="cfg-field cfg-bool" title={key}>
          <input
            type="checkbox"
            checked={value}
            onChange={(e) => setField(key, e.target.checked)}
          />
          <span>{labelWithDefault(key)}</span>
        </label>
      );
    }

    // Objects / arrays-of-objects → JSON textarea.
    if (value !== null && typeof value === "object") {
      const text = jsonDrafts[key] ?? JSON.stringify(value, null, 2);
      const err = jsonErrors[key];
      return (
        <label key={key} className="cfg-field span-2" title={key}>
          {labelWithDefault(key)}
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

    if (typeof value === "number") {
      return (
        <label key={key} className="cfg-field" title={key}>
          {labelWithDefault(key)}
          <input
            type="number"
            value={value}
            onChange={(e) => {
              const v = e.target.value;
              setField(key, v === "" ? null : Number(v));
            }}
          />
        </label>
      );
    }

    // string or null → text input
    const isNull = value === null;
    return (
      <label key={key} className="cfg-field" title={key}>
        {labelWithDefault(key)}
        <input
          type="text"
          value={isNull ? "" : (value as string)}
          placeholder={isNull ? "null" : undefined}
          onChange={(e) => {
            const v = e.target.value;
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
          Edit the whole file directly, including advanced fields like Last Launch Mods and the Mod
          DB URL. On valid JSON, the fields above stay in sync.
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

/** Intuitive editor for the Roles array: one card per role with labelled fields. */
function RolesEditor({
  roles,
  onChange,
}: {
  roles: unknown[];
  onChange: (next: unknown[]) => void;
}) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const updateRole = (idx: number, fieldKey: string, val: unknown) => {
    const next = roles.map((r, i) =>
      i === idx && r && typeof r === "object" && !Array.isArray(r)
        ? { ...(r as Record<string, unknown>), [fieldKey]: val }
        : r
    );
    onChange(next);
  };

  const renderRoleField = (idx: number, r: Record<string, unknown>, fk: string) => {
    const value = r[fk];
    const draftKey = `${idx}.${fk}`;

    if (typeof value === "boolean") {
      return (
        <label key={fk} className="cfg-field cfg-bool" title={fk}>
          <input
            type="checkbox"
            checked={value}
            onChange={(e) => updateRole(idx, fk, e.target.checked)}
          />
          <span>{humanize(fk)}</span>
        </label>
      );
    }
    if (typeof value === "number") {
      return (
        <label key={fk} className="cfg-field" title={fk}>
          {humanize(fk)}
          <input
            type="number"
            value={value}
            onChange={(e) =>
              updateRole(idx, fk, e.target.value === "" ? null : Number(e.target.value))
            }
          />
        </label>
      );
    }
    if (isStringArray(value)) {
      return (
        <label key={fk} className="cfg-field span-2" title={fk}>
          {humanize(fk)}
          <input
            type="text"
            value={value.join(", ")}
            onChange={(e) => updateRole(idx, fk, commaSplit(e.target.value))}
          />
          <span className="muted small">Comma-separated list</span>
        </label>
      );
    }
    if (value !== null && typeof value === "object") {
      const text = drafts[draftKey] ?? JSON.stringify(value, null, 2);
      const err = errors[draftKey];
      return (
        <label key={fk} className="cfg-field span-2" title={fk}>
          {humanize(fk)}
          <textarea
            className="cfg-json"
            spellCheck={false}
            value={text}
            onChange={(e) => {
              const t = e.target.value;
              setDrafts((d) => ({ ...d, [draftKey]: t }));
              try {
                const p = JSON.parse(t);
                setErrors((x) => {
                  const n = { ...x };
                  delete n[draftKey];
                  return n;
                });
                updateRole(idx, fk, p);
              } catch (er) {
                setErrors((x) => ({ ...x, [draftKey]: (er as Error).message }));
              }
            }}
          />
          {err && <span className="error small">Invalid JSON: {err}</span>}
        </label>
      );
    }
    const isNull = value === null;
    return (
      <label key={fk} className="cfg-field" title={fk}>
        {humanize(fk)}
        <input
          type="text"
          value={isNull ? "" : String(value)}
          placeholder={isNull ? "null" : undefined}
          onChange={(e) => {
            const v = e.target.value;
            updateRole(idx, fk, v === "" && isNull ? null : v);
          }}
        />
      </label>
    );
  };

  return (
    <div className="cfg-field span-2">
      <span className="cfg-label">Roles</span>
      <div className="roles-list">
        {roles.map((role, idx) => {
          if (!role || typeof role !== "object" || Array.isArray(role)) {
            return (
              <div key={idx} className="role-card">
                <div className="role-card-title muted">Role {idx + 1}</div>
                <textarea
                  className="cfg-json"
                  spellCheck={false}
                  value={JSON.stringify(role, null, 2)}
                  readOnly
                />
              </div>
            );
          }
          const r = role as Record<string, unknown>;
          const title = (r.Name as string) || (r.Code as string) || `Role ${idx + 1}`;
          return (
            <div key={idx} className="role-card">
              <div className="role-card-title">{title}</div>
              <div className="config-grid">
                {Object.keys(r).map((fk) => renderRoleField(idx, r, fk))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
