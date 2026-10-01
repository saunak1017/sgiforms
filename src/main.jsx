import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import {
  TEAM,
  OPTIONS,
  PROCESS,
  STONES,
  LOTS,
  blank,
  today,
  stage,
  validate,
} from "./schema";
import { exportRecord } from "./export";
import "./style.css";
async function api(path, options = {}) {
  const r = await fetch("/api/" + path, {
    ...options,
    headers:
      options.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" },
    body:
      options.body instanceof FormData
        ? options.body
        : options.body
          ? JSON.stringify(options.body)
          : undefined,
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || "Request failed");
  return data;
}
function App() {
  const [user, setUser] = useState(null),
    [loaded, setLoaded] = useState(false),
    [error, setError] = useState(""),
    [records, setRecords] = useState([]),
    [kind, setKind] = useState("jewelry"),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [editor, setEditor] = useState(null),
    [snapshot, setSnapshot] = useState(null),
    [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false),
    [admin, setAdmin] = useState(false),
    [mail, setMail] = useState(true),
    [savedMessage, setSavedMessage] = useState("");
  async function refresh() {
    const r = await api("records");
    setRecords(r.records);
    setMail(r.mailConfigured);
  }
  useEffect(() => {
    api("me")
      .then((x) => setUser(x.user))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);
  useEffect(() => {
    if (!user) return;
    refresh().catch((e) => setError(e.message));
    const timer = setInterval(() => refresh().catch(() => {}), 15000);
    return () => clearInterval(timer);
  }, [user]);
  useEffect(() => {
    const guard = (e) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);
  useEffect(() => {
    if (!user) return;
    if (location.hash.startsWith("#submitted/")) {
      run(async () => {
        const saved = await api(
          `records/${location.hash.split("/")[1]}/submitted`,
        );
        setSnapshot(saved);
      });
    } else if (location.hash.startsWith("#record/"))
      open(location.hash.split("/")[1]);
  }, [user]);
  async function run(fn) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function open(id) {
    if (dirty && !confirm("Discard your unsaved changes?")) return;
    await run(async () => {
      const r = await api("records/" + id);
      setEditor(r);
      setDirty(false);
      setAdmin(false);
      location.hash = "record/" + id;
    });
  }
  const change = (d) => {
    setEditor((x) => ({ ...x, data: d }));
    setDirty(true);
  };
  async function save(submit = false) {
    await run(async () => {
      if (submit) {
        const errors = validate(editor.data);
        if (errors.length) throw new Error(errors.join("\n"));
      }
      const r = await api("records/" + editor.id, {
        method: "PUT",
        body: { data: editor.data, version: editor.version, submit },
      });
      const fresh = await api("records/" + r.id);
      setEditor(fresh);
      location.hash = "record/" + r.id;
      setDirty(false);
      await refresh();
      setSavedMessage(submit ? "Form submitted and saved." : "Changes saved.");
      window.setTimeout(() => setSavedMessage(""), 3500);
    });
  }
  function close() {
    if (dirty && !confirm("Discard your unsaved changes?")) return false;
    setEditor(null);
    setSnapshot(null);
    setDirty(false);
    setAdmin(false);
    location.hash = "";
    setError("");
    return true;
  }
  if (!loaded) return <div className="loading">Loading SGI Forms…</div>;
  if (!user)
    return (
      <main className="login">
        <div className="brand">
          SG<span>I</span>
        </div>
        <p className="eyebrow">SHIVANI GEMS · INTERNAL WORKSPACE</p>
        <h1>A place for every detail.</h1>
        <p>Sign in to manage jewelry orders and vendor memos.</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.target);
            run(async () => {
              const r = await api("login", {
                method: "POST",
                body: Object.fromEntries(f),
              });
              setUser(r.user);
            });
          }}
        >
          <label>
            First name
            <input
              name="username"
              autoComplete="username"
              required
              placeholder="Saunak"
            />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </label>
          <button disabled={busy}>Sign in →</button>
          {error && (
            <div role="alert" className="error">
              {error}
            </div>
          )}
        </form>
        <small>Company access only</small>
      </main>
    );
  const visible = records.filter(
    (r) =>
      r.kind === kind &&
      (filter === "all" ||
        (filter === "draft"
          ? r.status === "draft"
          : filter === "completed"
            ? r.data.completed || r.data.processing?.shipped?.date
            : r.status === "submitted" &&
              !r.data.completed &&
              !r.data.processing?.shipped?.date)) &&
      JSON.stringify(r.data).toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <>
      <aside>
        <div className="brand">
          SG<span>I</span>
          <small>FORMS</small>
        </div>
        <p className="eyebrow">WORKSPACE</p>
        <button
          className={!editor && kind === "jewelry" ? "nav active" : "nav"}
          onClick={() => {
            if (close()) setKind("jewelry");
          }}
        >
          ◇ Jewelry orders
        </button>
        <button
          className={!editor && kind === "vendor" ? "nav active" : "nav"}
          onClick={() => {
            if (close()) setKind("vendor");
          }}
        >
          ▤ Vendor memo in
        </button>
        {user.role === "admin" && (
          <button
            className="nav"
            onClick={() => {
              if (dirty && !confirm("Discard unsaved changes?")) return;
              setEditor(null);
              setDirty(false);
              setAdmin(true);
            }}
          >
            ⚙ Manage passwords
          </button>
        )}
        <div className="profile">
          <b>{user.name}</b>
          <small>
            {user.role === "admin" ? "Administrator" : "Team member"}
          </small>
          <button
            className="nav"
            onClick={() =>
              run(async () => {
                if (dirty && !confirm("Discard unsaved changes and sign out?"))
                  return;
                await api("logout", { method: "POST" });
                setUser(null);
                setEditor(null);
                setDirty(false);
              })
            }
          >
            Sign out
          </button>
        </div>
      </aside>
      <main className="workspace">
        <header>
          <span>
            Shivani Gems /{" "}
            {admin
              ? "Administration"
              : editor
                ? "Form details"
                : kind === "jewelry"
                  ? "Jewelry orders"
                  : "Vendor memo in"}
          </span>
          <span className="live">● Live dashboard · 15s refresh</span>
        </header>
        {error && (
          <div role="alert" className="error">
            {error}
            <button className="dismiss" onClick={() => setError("")}>
              ×
            </button>
          </div>
        )}
        {savedMessage && (
          <div className="save-confirmation" role="status">
            ✓ {savedMessage}
          </div>
        )}
        {!mail && (
          <div className="notice">
            Submission emails are queued. Add RESEND_API_KEY to enable sending.
          </div>
        )}
        {snapshot ? (
          <section className="panel">
            <h1>Original submitted form</h1>
            <p>
              {snapshot.data.customer} · {snapshot.id.slice(0, 8)}
            </p>
            <p>Choose the PDF version you want to download.</p>
            <div className="actions">
              <button
                disabled={busy}
                onClick={() => run(() => exportRecord(snapshot, "pdf"))}
              >
                Download SGI PDF
              </button>
              {snapshot.data.kind === "jewelry" && (
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() =>
                    run(() => exportRecord(snapshot, "manufacturer-pdf"))
                  }
                >
                  Download Manufacturer PDF
                </button>
              )}
              <button
                className="secondary"
                onClick={() => {
                  setSnapshot(null);
                  open(snapshot.id);
                }}
              >
                View current form
              </button>
              <button className="secondary" onClick={close}>
                All forms
              </button>
            </div>
          </section>
        ) : admin ? (
          <Admin run={run} busy={busy} />
        ) : editor ? (
          <>
            <div className="page-title">
              <div>
                <button className="text" onClick={close}>
                  ← All forms
                </button>
                <h1>
                  {editor.data.kind === "jewelry"
                    ? "Customer / Special Jewelry Order"
                    : "Vendor Memo In"}
                </h1>
                <p>
                  {editor.version
                    ? `${editor.id.slice(0, 8)} · ${stage(editor.data, editor.status)}`
                    : "New form"}{" "}
                  {dirty ? " · Unsaved changes" : ""}
                </p>
              </div>
              <div className="actions">
                {Boolean(editor.version) && (
                  <>
                    <button
                      className="secondary"
                      disabled={busy || dirty}
                      onClick={() => run(() => exportRecord(editor, "docx"))}
                    >
                      Word
                    </button>
                    <button
                      className="secondary"
                      disabled={busy || dirty}
                      onClick={() => run(() => exportRecord(editor, "pdf"))}
                    >
                      SGI PDF
                    </button>
                    {editor.data.kind === "jewelry" && (
                      <button
                        className="secondary"
                        disabled={busy || dirty}
                        onClick={() =>
                          run(() => exportRecord(editor, "manufacturer-pdf"))
                        }
                      >
                        Manufacturer PDF
                      </button>
                    )}
                    {user.role === "admin" && (
                      <button
                        className="danger"
                        disabled={busy}
                        onClick={() => {
                          if (confirm("Delete this form from the workspace?"))
                            run(async () => {
                              await api("records/" + editor.id, {
                                method: "DELETE",
                                body: { version: editor.version },
                              });
                              setDirty(false);
                              setEditor(null);
                              location.hash = "";
                              await refresh();
                            });
                        }}
                      >
                        Delete
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
            <Editor d={editor.data} change={change} user={user} />
            {editor.notification && (
              <section className="panel">
                <h2>Submission email: {editor.notification.status}</h2>
                <p>{editor.notification.error}</p>
                {user.role === "admin" &&
                  editor.notification.status === "pending" && (
                    <button
                      className="secondary"
                      onClick={() =>
                        run(async () => {
                          await api(`records/${editor.id}/notification`, {
                            method: "POST",
                          });
                          setEditor(await api("records/" + editor.id));
                        })
                      }
                    >
                      Retry queued email
                    </button>
                  )}
              </section>
            )}
            {editor.history?.length > 0 && (
              <details className="panel">
                <summary>Activity history</summary>
                {editor.history.map((h) => (
                  <p key={h.id}>
                    {h.action} by {h.actor} ·{" "}
                    {new Date(h.at).toLocaleString("en-US", {
                      timeZone: "America/New_York",
                    })}{" "}
                    ET
                  </p>
                ))}
              </details>
            )}
            <footer className="savebar">
              <span>
                {dirty ? "You have unsaved changes" : "All changes saved"}
                {dirty && editor.version ? " · Save before exporting" : ""}
              </span>
              <div className="actions">
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => save(false)}
                >
                  {editor.status === "submitted"
                    ? "Save changes"
                    : "Save draft"}
                </button>
                {editor.status !== "submitted" && (
                  <button disabled={busy} onClick={() => save(true)}>
                    Submit form →
                  </button>
                )}
              </div>
            </footer>
          </>
        ) : (
          <>
            <div className="page-title">
              <div>
                <p className="eyebrow">KEEP WORK MOVING</p>
                <h1>
                  {kind === "jewelry" ? "Jewelry orders" : "Vendor memo in"}
                </h1>
                <p>
                  {kind === "jewelry"
                    ? "From the first detail to the final shipment."
                    : "Incoming lots, pricing, and entry status in one place."}
                </p>
              </div>
              <button
                onClick={() => {
                  setEditor({
                    id: crypto.randomUUID(),
                    version: 0,
                    status: "draft",
                    data: blank(kind, user.name),
                  });
                  setDirty(true);
                }}
              >
                + New {kind === "jewelry" ? "order" : "memo"}
              </button>
            </div>
            <div className="metrics">
              <div>
                <span>ALL {kind === "jewelry" ? "ORDERS" : "MEMOS"}</span>
                <b>{records.filter((x) => x.kind === kind).length}</b>
              </div>
              <div>
                <span>IN PROGRESS</span>
                <b>
                  {
                    records.filter(
                      (x) =>
                        x.kind === kind &&
                        x.status === "submitted" &&
                        !x.data.completed &&
                        !x.data.processing?.shipped?.date,
                    ).length
                  }
                </b>
              </div>
              <div>
                <span>DRAFTS</span>
                <b>
                  {
                    records.filter(
                      (x) => x.kind === kind && x.status === "draft",
                    ).length
                  }
                </b>
              </div>
            </div>
            <div className="toolbar">
              <input
                aria-label="Search forms"
                placeholder="Search customer, style, manufacturer, lot…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <select
                aria-label="Filter status"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                <option value="all">All statuses</option>
                <option value="active">In progress</option>
                <option value="draft">Drafts</option>
                <option value="completed">Completed / shipped</option>
              </select>
              <span>{visible.length} records</span>
            </div>
            <div className="cards">
              {visible.map((r) => (
                <button className="card" key={r.id} onClick={() => open(r.id)}>
                  <div className="card-top">
                    <span className="badge">{stage(r.data, r.status)}</span>
                    <small>{r.id.slice(0, 8)}</small>
                  </div>
                  <h2>{r.data.customer || "Untitled draft"}</h2>
                  <p>
                    {kind === "jewelry"
                      ? `${r.data.category || "Jewelry"} · ${r.data.style || "Style pending"}`
                      : r.data.vendor || "Vendor pending"}
                  </p>
                  <dl>
                    <dt>{kind === "jewelry" ? "Manufacturer" : "Document"}</dt>
                    <dd>{r.data.manufacturer || r.data.documentType || "—"}</dd>
                    <dt>{kind === "jewelry" ? "Due date" : "Entry"}</dt>
                    <dd
                      className={
                        r.data.due < today() &&
                        !r.data.processing?.shipped?.date
                          ? "overdue"
                          : ""
                      }
                    >
                      {r.data.due ||
                        (r.data.completed ? "Complete" : "Pending")}
                    </dd>
                  </dl>
                  <div className="card-foot">
                    <span>
                      {r.mail_status
                        ? `Email ${r.mail_status}`
                        : "Draft · not notified"}
                    </span>
                    <span>Open →</span>
                  </div>
                </button>
              ))}
            </div>
            {!visible.length && (
              <div className="empty">
                <div>◇</div>
                <h2>
                  {query ? "No matching forms" : "Ready for the next order"}
                </h2>
                <p>
                  {query
                    ? "Try a different search."
                    : "Create a form to start tracking it here."}
                </p>
              </div>
            )}
          </>
        )}
      </main>
    </>
  );
}
function Editor({ d, change, user }) {
  const set = (k, v) => change({ ...d, [k]: v });
  const field = (k, label, type = "text", required = false) => (
    <label key={k}>
      {label}
      {required && <em> *</em>}
      <input
        type={type}
        value={d[k] ?? ""}
        min={type === "number" ? 0 : undefined}
        step={type === "number" ? "any" : undefined}
        onChange={(e) => set(k, e.target.value)}
      />
    </label>
  );
  const select = (k, label, opts, required = false) => (
    <label key={k}>
      {label}
      {required && <em> *</em>}
      <select
        aria-label={label}
        value={d[k] || ""}
        onChange={(e) => set(k, e.target.value)}
      >
        <option value="">Select…</option>
        {opts.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    </label>
  );
  const checks = (k, label, opts) => (
    <fieldset>
      <legend>{label} *</legend>
      <div className="checks">
        {opts.map((o) => (
          <label key={o}>
            <input
              type="checkbox"
              checked={(d[k] || []).includes(o)}
              onChange={(e) =>
                set(
                  k,
                  e.target.checked
                    ? [...(d[k] || []), o]
                    : (d[k] || []).filter((x) => x !== o),
                )
              }
            />
            {o}
          </label>
        ))}
      </div>
    </fieldset>
  );
  const area = (k, label) => (
    <label className="wide">
      {label}
      <textarea
        rows="3"
        value={d[k] || ""}
        onChange={(e) => set(k, e.target.value)}
      />
    </label>
  );
  const toggle = (k, label) => (
    <label className="toggle">
      <input
        type="checkbox"
        checked={!!d[k]}
        onChange={(e) => set(k, e.target.checked)}
      />
      {label}
    </label>
  );
  function rowTable(cols) {
    return (
      <>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>#</th>
                {cols.map(([k, l]) => (
                  <th key={k}>{l}</th>
                ))}
                <th />
              </tr>
            </thead>
            <tbody>
              {d.rows.map((r, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  {cols.map(([k, l]) => (
                    <td key={k}>
                      {["position", "setting", "type"].includes(k) ? (
                        <select
                          aria-label={`Row ${i + 1} ${l}`}
                          value={r[k] || ""}
                          onChange={(e) =>
                            set(
                              "rows",
                              d.rows.map((x, j) =>
                                j === i ? { ...x, [k]: e.target.value } : x,
                              ),
                            )
                          }
                        >
                          <option value="">Select…</option>
                          {(k === "position"
                            ? ["Center", "Side"]
                            : k === "setting"
                              ? OPTIONS.setting
                              : OPTIONS.stoneTypes
                          ).map((o) => (
                            <option key={o}>{o}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          aria-label={`Row ${i + 1} ${l}`}
                          disabled={
                            k === "settingOther" && r.setting !== "Other"
                          }
                          type={
                            [
                              "quantity",
                              "weight",
                              "cpCt",
                              "cpTotal",
                              "spCt",
                              "spTotal",
                            ].includes(k)
                              ? "number"
                              : "text"
                          }
                          min="0"
                          step="any"
                          value={r[k] ?? ""}
                          onChange={(e) =>
                            set(
                              "rows",
                              d.rows.map((x, j) =>
                                j === i ? { ...x, [k]: e.target.value } : x,
                              ),
                            )
                          }
                        />
                      )}
                    </td>
                  ))}
                  <td>
                    <button
                      className="text"
                      aria-label={`Remove row ${i + 1}`}
                      onClick={() =>
                        set(
                          "rows",
                          d.rows.filter((_, j) => j !== i),
                        )
                      }
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button
          className="secondary"
          onClick={() => set("rows", [...d.rows, {}])}
        >
          + Add row
        </button>
      </>
    );
  }
  return (
    <>
      <p className="muted">
        * Required on submission. Drafts can be incomplete.
      </p>
      <section className="panel">
        <h2>
          01 / {d.kind === "jewelry" ? "Customer & order" : "Vendor & customer"}
        </h2>
        <div className="grid">
          {d.kind === "vendor" && field("vendor", "Vendor Name", "text", true)}
          {field(
            "customer",
            d.kind === "vendor" && d.documentType === "Jewelry Production"
              ? "Style Number"
              : "Customer Name/Number",
            "text",
            true,
          )}
          {d.kind === "jewelry" ? (
            <>
              {field("salesperson", "Salesperson", "text", true)}
              {field("manufacturer", "Manufacturer", "text", true)}
              {field("due", "Due Date", "date", true)}
              {field("style", "Style Number", "text", true)}
              {select(
                "styleType",
                "Style Classification",
                OPTIONS.styleType,
                true,
              )}
              {field("quantity", "Order Quantity", "number", true)}
              {field("price", "Price ($)", "number", true)}
              {select(
                "priceMode",
                "Price Basis",
                ["Per Piece", "Total Order"],
                true,
              )}
              {d.quantity > 0 && d.price !== "" && d.priceMode && (
                <p className="computed">
                  {d.priceMode === "Per Piece"
                    ? `Order total: $${(Number(d.price) * Number(d.quantity)).toFixed(2)}`
                    : `Per piece: $${(Number(d.price) / Number(d.quantity)).toFixed(2)}`}
                </p>
              )}
            </>
          ) : (
            select(
              "documentType",
              "Memo / Invoice",
              ["Memo", "Invoice", "Jewelry Production"],
              true,
            )
          )}
        </div>
      </section>
      {d.kind === "jewelry" ? (
        <>
          <section className="panel">
            <h2>02 / Piece details</h2>
            <div className="grid">
              {select("category", "Jewelry Category", OPTIONS.category, true)}
              {select("metal", "Metal", OPTIONS.metal, true)}
            </div>
            {checks("metalColor", "Metal Color", OPTIONS.metalColor)}
            <div className="grid">
              {d.category === "Ring" &&
                field("ringSize", "Ring Size USA", "text", true)}
              {["Bracelet", "Necklace"].includes(d.category) &&
                field("length", "Length (include unit)", "text", true)}
              {d.category === "Earrings" && (
                <>
                  {select(
                    "back",
                    "Earring Back",
                    ["Screwback", "Pushback", "Other"],
                    true,
                  )}
                  {d.back === "Other" &&
                    field("backOther", "Other Earring Details", "text", true)}
                </>
              )}
            </div>
            {d.category === "Pendant" && (
              <>
                {toggle("includeChain", "Include Chain")}
                {d.includeChain && (
                  <div className="grid">
                    {select(
                      "chainColor",
                      "Chain Color",
                      ["White", "Yellow"],
                      true,
                    )}
                    {select(
                      "chainType",
                      "Chain Type",
                      ["Cable", "Box", "Other"],
                      true,
                    )}
                    {field(
                      "chainLength",
                      "Chain Length (include unit)",
                      "text",
                      true,
                    )}
                    {d.chainType === "Other" &&
                      field("chainOther", "Other Chain Details", "text", true)}
                  </div>
                )}
              </>
            )}
            {area("pieceInfo", "Other Piece Information")}
          </section>
          <section className="panel">
            <h2>03 / Stones & setting</h2>
            {toggle("noStones", "No Stones / Metal Only")}
            {!d.noStones && (
              <>
                {checks("stoneTypes", "Stone Type", OPTIONS.stoneTypes)}
                {d.stoneTypes.includes("Other") &&
                  field("stoneTypeOther", "Other Stone Type", "text", true)}
                <p className="muted">
                  Each used row requires shape, quantity, Center/Side and
                  setting. Add measurements and other details where available.
                </p>
                {rowTable(STONES)}
                {area("otherSetting", "Other Setting Information")}
              </>
            )}
          </section>
          <section className="panel">
            <h2>04 / Inventory & stamping</h2>
            {select("inventory", "Inventory", ["Asset", "Memo"], true)}
            {checks("stamping", "Stamping", OPTIONS.stamping)}
            {d.stamping.includes("Other") &&
              field("stampingOther", "Other Stamping", "text", true)}
          </section>
        </>
      ) : (
        <section className="panel">
          <h2>02 / Vendor lots</h2>
          <p className="muted">
            All columns are required for each used row. Leave unused rows blank.
            Enter carat weight in Details.
          </p>
          {rowTable(LOTS)}
          <div className="totals">
            <span>
              CP total{" "}
              <b>
                $
                {d.rows
                  .reduce((s, r) => s + (Number(r.cpTotal) || 0), 0)
                  .toFixed(2)}
              </b>
            </span>
            <span>
              SP total{" "}
              <b>
                $
                {d.rows
                  .reduce((s, r) => s + (Number(r.spTotal) || 0), 0)
                  .toFixed(2)}
              </b>
            </span>
          </div>
        </section>
      )}
      {(d.kind !== "vendor" || d.documentType !== "Jewelry Production") && (
        <section className="panel">
          <h2>{d.kind === "jewelry" ? "05" : "03"} / Shipping</h2>
          <div className="grid">
            {d.kind === "vendor" && (
              <>
                {field("address", "Address", "text", true)}
                {field("city", "City", "text", true)}
                {field("state", "State", "text", true)}
                {field("zip", "ZIP", "text", true)}
              </>
            )}
            {select(
              "carrier",
              "Carrier",
              d.kind === "vendor"
                ? ["FedEx", "UPS", "USPS", "Other"]
                : ["FedEx", "UPS", "Other"],
              d.kind === "vendor",
            )}
            {d.carrier === "Other" &&
              field("carrierOther", "Other Carrier", "text", true)}
            {select(
              "speed",
              "Shipping Speed",
              d.kind === "vendor"
                ? ["1 Day", "2 Day", "Other"]
                : ["Overnight", "2 Day", "Other"],
              d.kind === "vendor",
            )}
            {d.speed === "Other" &&
              field("speedOther", "Other Shipping Speed", "text", true)}
            {field(
              "charge",
              "Shipping Charge ($)",
              "number",
              d.kind === "vendor",
            )}
          </div>
          {area("notes", "Notes / Modifications / Special Instructions")}
        </section>
      )}
      {d.kind === "vendor" &&
        d.documentType === "Jewelry Production" &&
        area("notes", "Notes / Modifications / Special Instructions")}
      <section className="panel">
        <h2>{d.kind === "jewelry" ? "06" : "04"} / Order processing</h2>
        <p className="muted">
          Update these fields as work progresses. These updates do not send
          emails.
        </p>
        {d.kind === "jewelry" ? (
          <>
            {PROCESS.map(([k, l]) => (
              <div className="process-row" key={k}>
                <b>
                  {l}
                  {k !== "orderNumber" ? " By" : ""}
                </b>
                <input
                  aria-label={l + " name or number"}
                  placeholder={k === "orderNumber" ? "Order number" : "Name"}
                  value={d.processing?.[k]?.by || ""}
                  onChange={(e) =>
                    set("processing", {
                      ...d.processing,
                      [k]: { ...d.processing?.[k], by: e.target.value },
                    })
                  }
                />
                <input
                  type="date"
                  aria-label={l + " date"}
                  value={d.processing?.[k]?.date || ""}
                  onChange={(e) =>
                    set("processing", {
                      ...d.processing,
                      [k]: { ...d.processing?.[k], date: e.target.value },
                    })
                  }
                />
                {k !== "orderNumber" && (
                  <button
                    className="text"
                    onClick={() =>
                      set("processing", {
                        ...d.processing,
                        [k]: { by: user.name, date: today() },
                      })
                    }
                  >
                    Mark today
                  </button>
                )}
              </div>
            ))}
            <div className="grid">
              {field(
                "tracking",
                "Tracking Number",
                "text",
                !!d.processing?.shipped?.date,
              )}
              {field(
                "shipmentRef",
                "Memo / Invoice Number",
                "text",
                !!d.processing?.shipped?.date,
              )}
            </div>
          </>
        ) : (
          <>
            <label className="toggle">
              <input
                type="checkbox"
                checked={!!d.completed}
                onChange={(e) =>
                  change({
                    ...d,
                    completed: e.target.checked,
                    completedBy: e.target.checked
                      ? d.completedBy || user.name
                      : d.completedBy,
                    completedDate: e.target.checked
                      ? d.completedDate || today()
                      : d.completedDate,
                  })
                }
              />
              Vendor Memo In Completed
            </label>
            <div className="grid">
              {field("completedBy", "Entered By", "text", d.completed)}
              {field("completedDate", "Date", "date", d.completed)}
            </div>
          </>
        )}
      </section>
    </>
  );
}
function Admin({ run, busy }) {
  const [message, setMessage] = useState("");
  return (
    <section className="panel">
      <h1>Manage passwords</h1>
      <p>
        Saunak and Mehul can initialize or reset any team member’s password.
        Resetting signs that person out of all sessions.
      </p>
      <form
        className="admin-form"
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget;
          run(async () => {
            await api("users", {
              method: "POST",
              body: Object.fromEntries(new FormData(form)),
            });
            form.reset();
            setMessage("Password saved. No first-login reset is required.");
          });
        }}
      >
        <label>
          Team member
          <select name="username">
            {TEAM.map((x) => (
              <option key={x[0]} value={x[0].toLowerCase()}>
                {x[0]}
              </option>
            ))}
          </select>
        </label>
        <label>
          New password
          <input
            name="password"
            type="password"
            minLength="12"
            maxLength="256"
            required
            autoComplete="new-password"
          />
        </label>
        <button disabled={busy}>Set password</button>
        {message && <p>{message}</p>}
      </form>
    </section>
  );
}
createRoot(document.getElementById("root")).render(<App />);
