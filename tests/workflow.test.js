import test from "node:test";
import assert from "node:assert/strict";
import {
  dashboardSection,
  ORDER_STAGES,
  stage,
  normalize,
  setSystemInformation,
} from "../src/schema.js";
test("orders occupy their latest workflow stage, ignoring job bag numbers", () => {
  const d = {
    kind: "jewelry",
    processing: { orderNumber: { by: "123", date: "2026-10-30" } },
  };
  assert.equal(dashboardSection(d, "submitted"), "filled");
  for (const [key, label] of ORDER_STAGES) {
    d.processing[key] = { by: "Saunak", date: "2026-10-30" };
    assert.equal(dashboardSection(d, "submitted"), key);
    assert.equal(stage(d, "submitted"), label);
  }
  assert.equal(dashboardSection(d, "draft"), "draft");
  delete d.processing.shipped;
  assert.equal(dashboardSection(d, "submitted"), "qc");
});
test("vendor completion moves records between pending and completed", () => {
  assert.equal(dashboardSection({ kind: "vendor" }, "draft"), "pending");
  assert.equal(
    dashboardSection({ kind: "vendor", completed: true }, "submitted"),
    "completed",
  );
});
test("System Information fills all address fields and clears placeholders when unchecked", () => {
  const d = setSystemInformation(
    {
      kind: "vendor",
      address: "Old",
      memoNumber: "M-12",
      vendorLotTypes: ["Natural", "Other"],
    },
    true,
  );
  for (const key of ["address", "city", "state", "zip"])
    assert.equal(d[key], "System");
  assert.equal(setSystemInformation(d, false).address, "");
  assert.equal(normalize({ ...d, city: "Stale" }).city, "System");
  assert.equal(normalize(d).memoNumber, "M-12");
  assert.deepEqual(normalize(d).vendorLotTypes, ["Natural", "Other"]);
  const production = normalize({ ...d, documentType: "Jewelry Production" });
  assert.equal(production.address, undefined);
  assert.equal(production.systemInformation, undefined);
});
