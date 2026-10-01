import { TEAM, validate, normalize } from "../../src/schema.js";
import { random, hashPassword, digest, equal } from "../../server/auth.js";
import { mailPayload, deliver, drain } from "../../server/mail.js";
const json = (v, status = 200, headers = {}) =>
  new Response(JSON.stringify(v), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      ...headers,
    },
  });
const fail = (message, status = 400) => {
  throw Object.assign(new Error(message), { status });
};
async function body(req) {
  if (Number(req.headers.get("content-length")) > 500000)
    fail("Form is too large.", 413);
  const raw = await req.text();
  if (raw.length > 500000) fail("Form is too large.", 413);
  try {
    return JSON.parse(raw);
  } catch {
    fail("Invalid JSON.");
  }
}
export async function onRequest(ctx) {
  try {
    return await route(ctx);
  } catch (e) {
    if (!e.status) console.error("SGI API error:", e.message);
    return json(
      {
        error: e.status
          ? e.message
          : "The request could not be completed. Check Cloudflare logs and bindings.",
      },
      e.status || 500,
    );
  }
}
async function route({ request: req, env, waitUntil }) {
  const url = new URL(req.url),
    path = url.pathname.slice(5).split("/"),
    method = req.method,
    db = env.DB;
  if (!db) fail("D1 binding DB is missing.", 503);
  if (
    !["GET", "HEAD"].includes(method) &&
    req.headers.get("origin") !== url.origin
  )
    fail("Request origin not allowed.", 403);
  if (path[0] === "login" && method === "POST") {
    const b = await body(req),
      username = String(b.username || "")
        .trim()
        .toLowerCase(),
      password = String(b.password || "");
    if (password.length > 256) fail("Invalid credentials.", 401);
    const key = await digest(
        `${req.headers.get("CF-Connecting-IP") || "local"}:${username}`,
      ),
      now = Date.now();
    const a = await db
      .prepare("SELECT * FROM attempts WHERE key=?")
      .bind(key)
      .first();
    if (a && a.until_time > now && a.count >= 10)
      fail("Too many attempts. Try again in 15 minutes.", 429);
    await db
      .prepare(
        "INSERT INTO attempts(key,count,until_time) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN until_time<? THEN 1 ELSE count+1 END,until_time=CASE WHEN until_time<? THEN excluded.until_time ELSE until_time END",
      )
      .bind(key, now + 900000, now, now)
      .run();
    let u = await db
      .prepare("SELECT * FROM users WHERE username=?")
      .bind(username)
      .first();
    if (!u) {
      let seed;
      try {
        seed = JSON.parse(env.BOOTSTRAP_USERS_JSON || "[]");
      } catch {
        fail("BOOTSTRAP_USERS_JSON must be valid JSON.", 503);
      }
      if (!Array.isArray(seed))
        fail("BOOTSTRAP_USERS_JSON must be an array.", 503);
      const entry = seed.find(
          (x) => String(x.username).toLowerCase() === username,
        ),
        member = TEAM.find((x) => x[0].toLowerCase() === username);
      if (
        entry &&
        member &&
        typeof entry.password === "string" &&
        entry.password.length >= 12 &&
        !entry.password.startsWith("REPLACE_")
      ) {
        const salt = random(),
          hash = await hashPassword(entry.password, salt);
        if (equal(hash, await hashPassword(password, salt))) {
          await db
            .prepare(
              "INSERT OR IGNORE INTO users(username,name,email,role,salt,hash) VALUES (?,?,?,?,?,?)",
            )
            .bind(username, ...member, salt, hash)
            .run();
          u = await db
            .prepare("SELECT * FROM users WHERE username=?")
            .bind(username)
            .first();
        }
      }
    }
    if (!u || !u.active || !equal(u.hash, await hashPassword(password, u.salt)))
      fail("Invalid username or password.", 401);
    await db.prepare("DELETE FROM attempts WHERE key=?").bind(key).run();
    const token = random();
    await db
      .prepare("INSERT INTO sessions VALUES (?,?,?)")
      .bind(await digest(token), username, now + 12 * 3600000)
      .run();
    return json(
      { user: { username: u.username, name: u.name, role: u.role } },
      200,
      {
        "Set-Cookie": `sgi_session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=43200`,
      },
    );
  }
  const token = req.headers
    .get("cookie")
    ?.match(/(?:^|;\s*)sgi_session=([^;]+)/)?.[1];
  const user = token
    ? await db
        .prepare(
          "SELECT u.username,u.name,u.email,u.role FROM sessions s JOIN users u ON u.username=s.username WHERE s.token=? AND s.expires>? AND u.active=1",
        )
        .bind(await digest(token), Date.now())
        .first()
    : null;
  if (!user) fail("Please sign in.", 401);
  if (path[0] === "me") return json({ user });
  if (path[0] === "logout" && method === "POST") {
    await db
      .prepare("DELETE FROM sessions WHERE token=?")
      .bind(await digest(token))
      .run();
    return json({ ok: true }, 200, {
      "Set-Cookie":
        "sgi_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0",
    });
  }
  if (path[0] === "users") {
    if (user.role !== "admin") fail("Admin access required.", 403);
    if (method === "GET") {
      const { results } = await db
        .prepare("SELECT username,name,email,role,active FROM users")
        .all();
      return json({ users: results, team: TEAM });
    }
    if (method === "POST") {
      const b = await body(req),
        username = String(b.username).toLowerCase();
      if (
        typeof b.password !== "string" ||
        b.password.length < 12 ||
        b.password.length > 256
      )
        fail("Use a password of 12–256 characters.");
      const member = TEAM.find((x) => x[0].toLowerCase() === username);
      if (!member) fail("Unknown team member.");
      const salt = random(),
        hash = await hashPassword(b.password, salt);
      await db.batch([
        db
          .prepare(
            "INSERT INTO users(username,name,email,role,salt,hash) VALUES (?,?,?,?,?,?) ON CONFLICT(username) DO UPDATE SET salt=excluded.salt,hash=excluded.hash",
          )
          .bind(username, ...member, salt, hash),
        db.prepare("DELETE FROM sessions WHERE username=?").bind(username),
      ]);
      return json({ ok: true });
    }
  }
  if (path[0] !== "records") fail("Not found.", 404);
  if (path.length === 1 && method === "GET") {
    const { results } = await db
      .prepare(
        "SELECT r.*,o.status AS mail_status,o.error AS mail_error FROM records r LEFT JOIN outbox o ON o.record_id=r.id WHERE r.deleted=0 ORDER BY r.updated_at DESC",
      )
      .all();
    waitUntil(drain(env));
    return json({
      records: results.map((r) => ({ ...r, data: JSON.parse(r.data) })),
      mailConfigured: !!env.RESEND_API_KEY,
    });
  }
  const id = path[1];
  if (!id || !/^[a-f0-9-]{36}$/.test(id)) fail("Invalid record reference.");
  let record = await db
    .prepare("SELECT * FROM records WHERE id=? AND deleted=0")
    .bind(id)
    .first();
  if (path[2] === "submitted" && method === "GET") {
    if (!record) fail("Record not found.", 404);
    const snapshot = await db
      .prepare("SELECT * FROM submission_snapshots WHERE record_id=?")
      .bind(id)
      .first();
    if (!snapshot) fail("No original submission exists for this form.", 404);
    return json({
      id,
      kind: record.kind,
      status: "submitted",
      data: JSON.parse(snapshot.data),
      created_by: record.created_by,
      updated_at: snapshot.submitted_at,
      submitted_at: snapshot.submitted_at,
      submitted_by: snapshot.submitted_by,
      original_submission: true,
    });
  }
  if (path[2] && path[2] !== "notification") fail("Not found.", 404);
  if (path[2] === "notification" && method === "POST") {
    if (user.role !== "admin") fail("Admin access required.", 403);
    await deliver(env, id);
    return json({ ok: true });
  }
  if (method === "GET") {
    if (!record) fail("Record not found.", 404);
    const [h, m] = await Promise.all([
      db
        .prepare(
          "SELECT * FROM audit WHERE record_id=? ORDER BY id DESC LIMIT 100",
        )
        .bind(id)
        .all(),
      db
        .prepare("SELECT status,error FROM outbox WHERE record_id=?")
        .bind(id)
        .first(),
    ]);
    return json({
      ...record,
      data: JSON.parse(record.data),
      history: h.results,
      notification: m,
    });
  }
  if (method === "DELETE") {
    if (user.role !== "admin") fail("Only admins may delete records.", 403);
    if (!record) fail("Record not found.", 404);
    const b = await body(req);
    if (b.version !== record.version)
      fail("Record changed. Reopen it before deleting.", 409);
    const results = await db.batch([
      db
        .prepare(
          "UPDATE records SET deleted=1,version=version+1 WHERE id=? AND version=?",
        )
        .bind(id, b.version),
      db
        .prepare(
          "INSERT INTO audit(record_id,actor,action,at,version) SELECT ?,?,'Deleted',?,? WHERE changes()=1",
        )
        .bind(id, user.name, new Date().toISOString(), b.version + 1),
    ]);
    if (!results[0].meta.changes)
      fail("Record changed. Reopen it before deleting.", 409);
    return json({ ok: true });
  }
  if (method === "PUT") {
    const b = await body(req);
    if (!b.data) fail("Missing form data.");
    const d = normalize(b.data);
    if (!d || !["jewelry", "vendor"].includes(d.kind))
      fail("Invalid form type.");
    if (!Array.isArray(d.rows) || d.rows.length > 200)
      fail("Maximum 200 rows.");
    if (record && record.kind !== d.kind) fail("Form type cannot change.");
    const status =
      record?.status === "submitted" || b.submit ? "submitted" : "draft";
    if (status === "submitted") {
      const errors = validate(d);
      if (errors.length) return json({ error: errors.join("\n"), errors }, 400);
    }
    const at = new Date().toISOString(),
      version = (record?.version || 0) + 1;
    if (record && b.version !== record.version)
      fail(
        "Someone updated this form. Your changes are still on screen. Reopen the saved form before applying them.",
        409,
      );
    const next = {
      id,
      kind: d.kind,
      status,
      data: JSON.stringify(d),
      created_by: record?.created_by || user.name,
      actor: user.name,
    };
    const payload = JSON.stringify(mailPayload(next, url.origin));
    const stmts = [];
    if (record)
      stmts.push(
        db
          .prepare(
            "UPDATE records SET status=?,data=?,version=version+1,updated_at=? WHERE id=? AND version=? AND deleted=0",
          )
          .bind(status, next.data, at, id, b.version),
      );
    else
      stmts.push(
        db
          .prepare(
            "INSERT OR IGNORE INTO records(id,kind,status,data,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?)",
          )
          .bind(id, d.kind, status, next.data, user.name, at, at),
      );
    stmts.push(
      db
        .prepare(
          "INSERT INTO audit(record_id,actor,action,at,version) SELECT ?,?,?,?,? WHERE changes()=1",
        )
        .bind(
          id,
          user.name,
          !record
            ? "Created"
            : record.status === "draft" && status === "submitted"
              ? "Submitted"
              : "Updated",
          at,
          version,
        ),
    );
    stmts.push(
      db
        .prepare(
          "INSERT OR IGNORE INTO outbox(record_id,payload) SELECT id,? FROM records WHERE id=? AND status='submitted' AND deleted=0",
        )
        .bind(payload, id),
    );
    stmts.push(
      db
        .prepare(
          "INSERT OR IGNORE INTO submission_snapshots(record_id,data,submitted_by,submitted_at) SELECT id,data,?,updated_at FROM records WHERE id=? AND status='submitted' AND deleted=0",
        )
        .bind(user.name, id),
    );
    const results = await db.batch(stmts);
    if (!results[0].meta.changes)
      fail("Record changed. Reopen the saved form before editing.", 409);
    if (status === "submitted") waitUntil(deliver(env, id));
    return json({ id, version, status });
  }
  fail("Method not allowed.", 405);
}
