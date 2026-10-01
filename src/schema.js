export const TEAM = [
  ["Saunak", "saunak@shivanigems.com", "admin"],
  ["Atit", "atit@shivanigems.com", "staff"],
  ["Mehul", "mehul@shivanigems.com", "admin"],
  ["Bhavesh", "bhavesh@shivanigems.com", "staff"],
  ["Kyi", "kyi@shivanigems.com", "staff"],
  ["Aye", "data@shivanigems.com", "staff"],
];
export const RECIPIENTS = {
  jewelry: TEAM.slice(0, 5).map((x) => x[1]),
  vendor: [TEAM[0][1], TEAM[1][1], TEAM[5][1]],
};
export const OPTIONS = {
  category: ["Ring", "Pendant", "Earrings", "Bracelet", "Necklace"],
  styleType: ["New", "Existing", "Modified"],
  metal: ["18K", "14K", "10K", "Platinum", "Silver"],
  metalColor: ["Yellow", "White", "Rose", "Two Tone"],
  stoneTypes: ["Natural", "Lab Grown", "Colorstone", "Other"],
  stamping: ["SMS", "Metal", "Total Weight", "Other"],
  setting: [
    "Bezel Set",
    "Half Bezel",
    "4 Prong",
    "6 Prong",
    "Channel Set",
    "Other",
  ],
};
export const STONES = [
  ["lot", "Lot ID"],
  ["shape", "Shape"],
  ["quantity", "Quantity"],
  ["weight", "Total Weight (ct)"],
  ["type", "Stone Type"],
  ["notes", "Measurements / Notes"],
  ["position", "Center / Side"],
  ["setting", "Setting Type"],
  ["settingOther", "Other Setting Details"],
];
export const LOTS = [
  ["vendorLot", "Vendor Lot ID"],
  ["cpCt", "CP $/ct"],
  ["cpTotal", "CP Total Price"],
  ["details", "Details (include ct weight)"],
  ["sgLot", "SG Lot ID"],
  ["spCt", "SP $/ct"],
  ["spTotal", "SP Total Price"],
];
export const PROCESS = [
  ["filled", "Form Filled Out"],
  ["jobBag", "Job Bag Created"],
  ["orderNumber", "Job Bag/Shivani Order Number"],
  ["entered", "Information Entered Into System"],
  ["production", "Sent for Production"],
  ["received", "Received SGI"],
  ["qc", "SGI QC"],
  ["shipped", "Shipped to Customer"],
];
export const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export function blank(kind, name) {
  return {
    kind,
    customer: "",
    rows: kind === "vendor" ? Array.from({ length: 10 }, () => ({})) : [{}],
    metalColor: [],
    stoneTypes: [],
    stamping: [],
    processing:
      kind === "jewelry" ? { filled: { by: name, date: today() } } : {},
  };
}
const empty = (v) => v === undefined || v === null || String(v).trim() === "";
export const usedRows = (d) =>
  (d.rows || []).filter((r) => Object.values(r).some((v) => !empty(v)));
export function validate(d) {
  const e = [];
  const req = (k, label = k) => {
    if (empty(d[k])) e.push(`${label} is required.`);
  };
  const choice = (k, opts, label = k) => {
    if (!opts.includes(d[k])) e.push(`Select ${label}.`);
  };
  const multi = (k, opts, label) => {
    if (
      !Array.isArray(d[k]) ||
      !d[k].length ||
      d[k].some((v) => !opts.includes(v))
    )
      e.push(`Select ${label}.`);
  };
  const number = (v, label, min = 0, int = false) => {
    if (
      empty(v) ||
      !Number.isFinite(Number(v)) ||
      Number(v) < min ||
      (int && !Number.isInteger(Number(v)))
    )
      e.push(
        `${label} must be ${int ? "a whole number" : "a number"} of at least ${min}.`,
      );
  };
  req(
    "customer",
    d.kind === "vendor" && d.documentType === "Jewelry Production"
      ? "Style number"
      : "Customer name/number",
  );
  if (d.kind === "jewelry") {
    for (const [k, l] of [
      ["salesperson", "Salesperson"],
      ["manufacturer", "Manufacturer"],
      ["due", "Due date"],
      ["style", "Style number"],
    ])
      req(k, l);
    choice("styleType", OPTIONS.styleType, "style classification");
    choice("category", OPTIONS.category, "jewelry category");
    choice("metal", OPTIONS.metal, "metal");
    multi("metalColor", OPTIONS.metalColor, "metal color");
    number(d.quantity, "Order quantity", 1, true);
    number(d.price, "Price");
    choice("priceMode", ["Per Piece", "Total Order"], "price basis");
    choice("inventory", ["Asset", "Memo"], "Asset or Memo");
    multi("stamping", OPTIONS.stamping, "stamping");
    if (d.stamping?.includes("Other")) req("stampingOther", "Other stamping");
    if (d.category === "Ring") {
      req("ringSize", "Ring size");
    }
    if (["Bracelet", "Necklace"].includes(d.category)) req("length", "Length");
    if (d.category === "Pendant" && d.includeChain) {
      choice("chainColor", ["White", "Yellow"], "chain color");
      choice("chainType", ["Cable", "Box", "Other"], "chain type");
      req("chainLength", "Chain length");
      if (d.chainType === "Other") req("chainOther", "Other chain details");
    }
    if (d.category === "Earrings") {
      choice("back", ["Screwback", "Pushback", "Other"], "earring back");
      if (d.back === "Other") req("backOther", "Other earring details");
    }
    if (!d.noStones) {
      multi("stoneTypes", OPTIONS.stoneTypes, "stone type");
      if (d.stoneTypes?.includes("Other"))
        req("stoneTypeOther", "Other stone type");
      const rows = usedRows(d);
      if (!rows.length)
        e.push("Add at least one stone or select No Stones / Metal Only.");
      rows.forEach((r, i) => {
        if (empty(r.shape)) e.push(`Stone ${i + 1}: shape required.`);
        number(r.quantity, `Stone ${i + 1} quantity`, 1, true);
        if (!["Center", "Side"].includes(r.position))
          e.push(`Stone ${i + 1}: choose Center or Side.`);
        if (!OPTIONS.setting.includes(r.setting))
          e.push(`Stone ${i + 1}: setting required.`);
        if (r.setting === "Other" && empty(r.settingOther))
          e.push(`Stone ${i + 1}: describe other setting.`);
      });
    }
  } else {
    req("vendor", "Vendor name");
    choice(
      "documentType",
      ["Memo", "Invoice", "Jewelry Production"],
      "Memo, Invoice, or Jewelry Production",
    );
    if (d.documentType !== "Jewelry Production") {
      for (const [k, l] of [
        ["address", "Address"],
        ["city", "City"],
        ["state", "State"],
        ["zip", "ZIP"],
      ])
        req(k, l);
      choice("carrier", ["FedEx", "UPS", "USPS", "Other"], "carrier");
      choice("speed", ["1 Day", "2 Day", "Other"], "shipping speed");
      number(d.charge, "Shipping charge");
    }
    const rows = usedRows(d);
    if (!rows.length) e.push("Add at least one vendor lot.");
    rows.forEach((r, i) =>
      LOTS.forEach(([k, l]) => {
        if (["cpCt", "cpTotal", "spCt", "spTotal"].includes(k))
          number(r[k], `Lot ${i + 1}: ${l}`);
        else if (empty(r[k])) e.push(`Lot ${i + 1}: ${l} required.`);
      }),
    );
  }
  if (d.carrier === "Other") req("carrierOther", "Other carrier");
  if (d.speed === "Other") req("speedOther", "Other shipping speed");
  for (const [key, p] of Object.entries(d.processing || {})) {
    if ((p.by || p.date) && (!p.by || !p.date))
      e.push(`${key}: enter both name/number and date.`);
  }
  if (d.processing?.shipped?.date) {
    req("tracking", "Tracking number");
    req("shipmentRef", "Memo/invoice number");
  }
  if (d.completed && (!d.completedBy || !d.completedDate))
    e.push("Completion requires Entered By and Date.");
  return e;
}
export function stage(d, status) {
  if (status === "draft") return "Draft";
  if (d.kind === "vendor") return d.completed ? "Completed" : "Awaiting entry";
  for (const [k, l] of [...PROCESS].reverse()) {
    if (d.processing?.[k]?.date) return l;
  }
  return "Submitted";
}
export const LABELS = {
  customer: "Customer Name/Number",
  salesperson: "Salesperson",
  manufacturer: "Manufacturer",
  due: "Due Date",
  style: "Style Number",
  styleType: "Style Classification",
  quantity: "Order Quantity",
  price: "Price ($)",
  priceMode: "Price Basis",
  category: "Jewelry Category",
  metal: "Metal",
  metalColor: "Metal Color",
  ringSize: "Ring Size USA",
  includeChain: "Include Chain",
  chainColor: "Chain Color",
  chainType: "Chain Type",
  chainLength: "Chain Length",
  chainOther: "Other Chain Details",
  back: "Earring Back",
  backOther: "Other Earring Details",
  length: "Length",
  pieceInfo: "Other Piece Information",
  noStones: "No Stones / Metal Only",
  stoneTypes: "Stone Type",
  stoneTypeOther: "Other Stone Type",
  otherSetting: "Other Setting Information",
  inventory: "Inventory",
  stamping: "Stamping",
  stampingOther: "Other Stamping",
  vendor: "Vendor Name",
  documentType: "Memo / Invoice",
  address: "Address",
  city: "City",
  state: "State",
  zip: "ZIP",
  carrier: "Carrier",
  carrierOther: "Other Carrier",
  speed: "Shipping Speed",
  speedOther: "Other Shipping Speed",
  charge: "Shipping Charge ($)",
  notes: "Notes / Modifications / Special Instructions",
  tracking: "Tracking Number",
  shipmentRef: "Memo / Invoice Number",
  completed: "Vendor Memo In Completed",
  completedBy: "Entered By",
  completedDate: "Completion Date",
};
// Remove hidden category fields before saving/exporting so a category change cannot
// carry stale instructions into production paperwork.
export function normalize(input) {
  const d = JSON.parse(JSON.stringify(input));
  if (d.kind === "jewelry") {
    if (d.category !== "Ring") delete d.ringSize;
    if (!["Bracelet", "Necklace"].includes(d.category)) delete d.length;
    if (d.category !== "Earrings") {
      delete d.back;
      delete d.backOther;
    } else if (d.back !== "Other") delete d.backOther;
    if (d.category !== "Pendant") delete d.includeChain;
    if (d.category !== "Pendant" || !d.includeChain) {
      for (const k of ["chainColor", "chainType", "chainLength", "chainOther"])
        delete d[k];
    } else if (d.chainType !== "Other") delete d.chainOther;
    if (d.noStones) {
      d.rows = [];
      d.stoneTypes = [];
      delete d.stoneTypeOther;
      delete d.otherSetting;
    }
    if (!d.stoneTypes?.includes("Other")) delete d.stoneTypeOther;
    if (!d.stamping?.includes("Other")) delete d.stampingOther;
    d.rows = (d.rows || []).map((r) => {
      if (r.setting !== "Other") delete r.settingOther;
      return r;
    });
  }
  if (d.kind === "vendor" && d.documentType === "Jewelry Production") {
    for (const k of [
      "address",
      "city",
      "state",
      "zip",
      "carrier",
      "carrierOther",
      "speed",
      "speedOther",
      "charge",
    ])
      delete d[k];
  }
  if (d.carrier !== "Other") delete d.carrierOther;
  if (d.speed !== "Other") delete d.speedOther;
  return d;
}
