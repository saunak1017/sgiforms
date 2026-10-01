import test from "node:test";
import assert from "node:assert/strict";
import { blank, validate, RECIPIENTS } from "../src/schema.js";
import { hashPassword, ITERATIONS } from "../server/auth.js";
const jewelry = () => ({
  ...blank("jewelry", "Saunak"),
  customer: "Test Store",
  salesperson: "Saunak",
  manufacturer: "RFG",
  due: "2026-10-20",
  style: "SG100",
  styleType: "New",
  category: "Ring",
  ringSize: "7.25",
  quantity: 2,
  price: 100,
  priceMode: "Per Piece",
  metal: "14K",
  metalColor: ["Yellow", "White"],
  stamping: ["SMS"],
  inventory: "Asset",
  noStones: true,
});
test("metal-only ring bypasses stone validation", () =>
  assert.deepEqual(validate(jewelry()), []));
test("stone rows require placement and setting and Other details", () => {
  const d = {
    ...jewelry(),
    noStones: false,
    stoneTypes: ["Natural"],
    rows: [
      { shape: "Round", quantity: 1, position: "Center", setting: "Other" },
    ],
  };
  assert.match(validate(d).join(" "), /describe other setting/);
  d.rows[0].settingOther = "Custom claws";
  assert.deepEqual(validate(d), []);
});
test("chain selection only required when included", () => {
  const d = { ...jewelry(), category: "Pendant" };
  assert.deepEqual(validate(d), []);
  d.includeChain = true;
  assert.ok(validate(d).length >= 3);
});
test("vendor blank rows allowed, partial rows rejected", () => {
  const d = {
    ...blank("vendor", "Saunak"),
    customer: "Store",
    vendor: "Supplier",
    documentType: "Memo",
    address: "1 Main",
    city: "NYC",
    state: "NY",
    zip: "10036",
    carrier: "FedEx",
    speed: "1 Day",
    charge: 0,
  };
  d.rows[0] = {
    vendorLot: "V1",
    cpCt: 1,
    cpTotal: 1,
    details: "1ct Round",
    sgLot: "S1",
    spCt: 2,
    spTotal: 2,
  };
  assert.deepEqual(validate(d), []);
  d.rows[1] = { vendorLot: "partial" };
  assert.ok(validate(d).length > 0);
});
test("shipment and vendor completion validation", () => {
  const d = jewelry();
  d.processing.shipped = { by: "Saunak", date: "2026-10-10" };
  assert.match(validate(d).join(" "), /Tracking number/);
});
test("recipient lists match instructions", () => {
  assert.equal(RECIPIENTS.jewelry.length, 5);
  assert.deepEqual(RECIPIENTS.vendor, [
    "saunak@shivanigems.com",
    "atit@shivanigems.com",
    "data@shivanigems.com",
  ]);
});
test("hashing capped at 100000 and salt changes hashes", async () => {
  assert.equal(ITERATIONS, 100000);
  assert.notEqual(
    await hashPassword("test password", "salt1"),
    await hashPassword("test password", "salt2"),
  );
});
