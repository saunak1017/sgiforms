import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { deliver, mailPayload } from "../server/mail.js";
function database() {
  const sql = new DatabaseSync(":memory:");
  sql.exec(
    "CREATE TABLE outbox(record_id TEXT PRIMARY KEY,payload TEXT,status TEXT DEFAULT 'pending',first_attempt INTEGER,lease_until INTEGER DEFAULT 0,error TEXT,provider_id TEXT)",
  );
  const DB = {
    prepare(query) {
      return {
        bind(...args) {
          return {
            first: async () => sql.prepare(query).get(...args),
            all: async () => ({ results: sql.prepare(query).all(...args) }),
            run: async () => ({
              meta: { changes: sql.prepare(query).run(...args).changes },
            }),
          };
        },
      };
    },
  };
  return { sql, DB };
}
test("one notification, stable payload, retries and sent-state guard", async () => {
  const { sql, DB } = database();
  const payload = mailPayload(
    {
      id: "test-id",
      kind: "vendor",
      data: JSON.stringify({
        customer: "Test Store",
        vendor: "Test Vendor",
        documentType: "Memo",
      }),
      created_by: "Saunak",
    },
    "https://example.test",
  );
  sql
    .prepare("INSERT INTO outbox(record_id,payload) VALUES (?,?)")
    .run("test-id", JSON.stringify(payload));
  const original = globalThis.fetch;
  let calls = 0;
  const requests = [];
  globalThis.fetch = async (url, options) => {
    calls++;
    requests.push(options);
    return calls === 1
      ? new Response(JSON.stringify({ message: "temporarily unavailable" }), {
          status: 503,
        })
      : new Response(JSON.stringify({ id: "provider-test" }), { status: 200 });
  };
  try {
    await deliver({ DB, RESEND_API_KEY: "test-only" }, "test-id");
    assert.equal(
      sql.prepare("SELECT status FROM outbox").get().status,
      "pending",
    );
    await deliver({ DB, RESEND_API_KEY: "test-only" }, "test-id");
    await deliver({ DB, RESEND_API_KEY: "test-only" }, "test-id");
    assert.equal(calls, 2);
    assert.equal(requests[0].body, requests[1].body);
    assert.equal(
      requests[0].headers["Idempotency-Key"],
      requests[1].headers["Idempotency-Key"],
    );
    assert.equal(sql.prepare("SELECT status FROM outbox").get().status, "sent");
    assert.deepEqual(JSON.parse(requests[1].body).to, [
      "saunak@shivanigems.com",
      "atit@shivanigems.com",
      "data@shivanigems.com",
    ]);
  } finally {
    globalThis.fetch = original;
    sql.close();
  }
});
test("expired unresolved delivery stops instead of risking duplicate", async () => {
  const { sql, DB } = database();
  sql
    .prepare(
      "INSERT INTO outbox(record_id,payload,first_attempt) VALUES (?,?,?)",
    )
    .run("old", "{}", Date.now() - 24 * 3600000);
  await deliver({ DB, RESEND_API_KEY: "test-only" }, "old");
  assert.equal(sql.prepare("SELECT status FROM outbox").get().status, "review");
  sql.close();
});
test("missing key leaves queue pending without attempt", async () => {
  const { sql, DB } = database();
  sql
    .prepare("INSERT INTO outbox(record_id,payload) VALUES (?,?)")
    .run("new", "{}");
  await deliver({ DB }, "new");
  assert.equal(
    sql.prepare("SELECT first_attempt FROM outbox").get().first_attempt,
    null,
  );
  sql.close();
});

test("published template IDs and exact variable sets", () => {
  const record = {
    id: "abc",
    kind: "vendor",
    actor: "Aye",
    data: JSON.stringify({ vendor: "Vendor", customer: "Customer" }),
  };
  const vendor = mailPayload(record, "https://example.test");
  assert.equal(vendor.template.id, "270f9fce-3f7a-454e-80b3-dac8a66ed3b4");
  assert.deepEqual(
    Object.keys(vendor.template.variables).sort(),
    [
      "CUSTOMER",
      "VENDOR_NAME",
      "SUBMITTED_BY",
      "FORM_REFERENCE",
      "FORM_URL",
      "PDF_URL",
    ].sort(),
  );
  assert.equal(
    vendor.template.variables.PDF_URL,
    "https://example.test/#submitted/abc",
  );
  assert.equal(vendor.template.variables.SUBMITTED_BY, "Aye");
  const jewelry = mailPayload(
    {
      ...record,
      kind: "jewelry",
      data: JSON.stringify({
        customer: "Customer",
        style: "S1",
        category: "Ring",
        salesperson: "Saunak",
        manufacturer: "M",
        due: "2026-10-15",
        quantity: 2,
        price: 250,
        priceMode: "Per Piece",
      }),
    },
    "https://example.test",
  );
  assert.equal(jewelry.template.id, "4c51a6ad-454e-4b17-88c7-0a452db79009");
  assert.deepEqual(
    Object.keys(jewelry.template.variables).sort(),
    [
      "CUSTOMER",
      "STYLE_NUMBER",
      "CATEGORY",
      "SALESPERSON",
      "MANUFACTURER",
      "DUE_DATE",
      "QUANTITY",
      "PRICE_SUMMARY",
      "SUBMITTED_BY",
      "FORM_REFERENCE",
      "FORM_URL",
      "PDF_URL",
    ].sort(),
  );
  assert.equal(
    jewelry.template.variables.PRICE_SUMMARY,
    "$250.00 per piece · $500.00 total",
  );
  assert.equal(jewelry.template.variables.DUE_DATE, "October 15, 2026");
  assert.equal(jewelry.to.length, 5);
  assert.equal(jewelry.html, undefined);
  assert.equal(jewelry.text, undefined);
});
