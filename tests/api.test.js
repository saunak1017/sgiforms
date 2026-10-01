import test from "node:test";
import assert from "node:assert/strict";
const base = process.env.TEST_URL;
test(
  "real Pages/D1 integration: auth, validation, conflict, submit, permissions, immutable snapshot, delete",
  { skip: !base },
  async () => {
    const request = async (path, method = "GET", data, cookie) => {
      const r = await fetch(base + "/api/" + path, {
        method,
        headers: {
          Origin: base,
          "Content-Type": "application/json",
          ...(cookie ? { Cookie: cookie } : {}),
        },
        body: data ? JSON.stringify(data) : undefined,
      });
      return {
        status: r.status,
        data: await r.json(),
        cookie: r.headers.get("set-cookie")?.split(";")[0],
      };
    };
    assert.equal((await request("records")).status, 401);
    const login = await request("login", "POST", {
      username: "SaUnAk",
      password: "local-test-password-123",
    });
    assert.equal(login.status, 200);
    const c = login.cookie;
    const id = crypto.randomUUID(),
      data = {
        kind: "vendor",
        vendor: "Test Vendor",
        customer: "Test Store",
        documentType: "Memo",
        address: "1 Main",
        city: "NYC",
        state: "NY",
        zip: "10036",
        carrier: "FedEx",
        speed: "1 Day",
        charge: 0,
        rows: [
          {
            vendorLot: "V1",
            cpCt: 1,
            cpTotal: 1,
            details: "1ct Round",
            sgLot: "S1",
            spCt: 2,
            spTotal: 2,
          },
        ],
      };
    let r = await request(
      "records/" + id,
      "PUT",
      { data: { kind: "vendor", rows: [] }, version: 0 },
      c,
    );
    assert.equal(r.status, 200);
    assert.equal(
      (
        await request(
          "records/" + id,
          "PUT",
          { data: { kind: "vendor", rows: [] }, version: 1, submit: true },
          c,
        )
      ).status,
      400,
    );
    r = await request(
      "records/" + id,
      "PUT",
      { data, version: 1, submit: true },
      c,
    );
    assert.equal(r.status, 200);
    assert.equal(
      (await request("records/" + id, "PUT", { data, version: 1 }, c)).status,
      409,
    );
    r = await request("records/" + id, "GET", null, c);
    assert.equal(r.data.notification.status, "pending");
    assert.equal(r.data.history.length, 2);
    const staff = await request("login", "POST", {
      username: "atit",
      password: "local-test-password-123",
    });
    assert.equal(staff.status, 200);
    assert.equal(
      (await request("records/" + id, "DELETE", { version: 2 }, staff.cookie))
        .status,
      403,
    );
    assert.equal((await request(`records/${id}/submitted`)).status, 401);
    const original = await request(`records/${id}/submitted`, "GET", null, c);
    assert.equal(original.status, 200);
    assert.equal(original.data.submitted_by, "Saunak");
    assert.equal(original.data.data.customer, "Test Store");
    const changed = {
      ...data,
      customer: "Edited Store",
      completed: true,
      completedBy: "Aye",
      completedDate: "2026-09-30",
    };
    assert.equal(
      (await request("records/" + id, "PUT", { data: changed, version: 2 }, c))
        .status,
      200,
    );
    const frozen = await request(`records/${id}/submitted`, "GET", null, c);
    assert.deepEqual(frozen.data, original.data);
    assert.equal(
      (await request("records/" + id, "DELETE", { version: 3 }, c)).status,
      200,
    );
    assert.equal((await request("records/" + id, "GET", null, c)).status, 404);
  },
);
