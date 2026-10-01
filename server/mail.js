import { RECIPIENTS } from "../src/schema.js";
export const TEMPLATE_IDS = {
  jewelry: "4c51a6ad-454e-4b17-88c7-0a452db79009",
  vendor: "270f9fce-3f7a-454e-80b3-dac8a66ed3b4",
};
const money = (n) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    Number(n),
  );
export function mailPayload(record, origin) {
  const d = JSON.parse(record.data);
  const variables = {
    CUSTOMER: String(d.customer || ""),
    SUBMITTED_BY: String(record.actor || record.created_by),
    FORM_REFERENCE: record.id,
    FORM_URL: `${origin}/#record/${record.id}`,
    PDF_URL: `${origin}/#submitted/${record.id}`,
  };
  if (record.kind === "jewelry")
    Object.assign(variables, {
      STYLE_NUMBER: String(d.style),
      CATEGORY: String(d.category),
      SALESPERSON: String(d.salesperson),
      MANUFACTURER: String(d.manufacturer),
      DUE_DATE: new Date(`${d.due}T12:00:00Z`).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
        timeZone: "America/New_York",
      }),
      QUANTITY: String(d.quantity),
      PRICE_SUMMARY:
        d.priceMode === "Per Piece"
          ? `${money(d.price)} per piece · ${money(Number(d.price) * Number(d.quantity))} total`
          : `${money(d.price)} total order · ${money(Number(d.price) / Number(d.quantity))} per piece`,
    });
  else variables.VENDOR_NAME = String(d.vendor);
  return {
    from: "SGI Forms <saunak@shivanigems.com>",
    to: RECIPIENTS[record.kind],
    reply_to: "saunak@shivanigems.com",
    subject:
      record.kind === "jewelry"
        ? `New Jewelry Order | ${d.customer} | ${d.style}`
        : `New Vendor Memo In | ${d.vendor} | ${d.customer}`,
    template: { id: TEMPLATE_IDS[record.kind], variables },
  };
}
export async function deliver(env, id) {
  if (!env.RESEND_API_KEY) return;
  const now = Date.now();
  let item = await env.DB.prepare("SELECT * FROM outbox WHERE record_id=?")
    .bind(id)
    .first();
  if (!item || item.status === "sent" || item.status === "review") return;
  if (item.first_attempt && now - item.first_attempt > 23 * 3600000) {
    await env.DB.prepare(
      "UPDATE outbox SET status='review', error='Retry window expired. Admin must check Resend logs before resolving.' WHERE record_id=? AND status!='sent'",
    )
      .bind(id)
      .run();
    return;
  }
  const claim = await env.DB.prepare(
    "UPDATE outbox SET lease_until=?, first_attempt=COALESCE(first_attempt,?), status='sending' WHERE record_id=? AND status NOT IN ('sent','review') AND lease_until<?",
  )
    .bind(now + 60000, now, id, now)
    .run();
  if (!claim.meta.changes) return;
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `submission-${id}`,
      },
      body: item.payload,
      signal: AbortSignal.timeout(15000),
    });
    const result = await response.json();
    if (!response.ok)
      throw new Error(
        `Resend ${response.status}: ${result.message || "request failed"}`,
      );
    await env.DB.prepare(
      "UPDATE outbox SET status='sent',provider_id=?,error=NULL,lease_until=0 WHERE record_id=?",
    )
      .bind(result.id, id)
      .run();
  } catch (e) {
    await env.DB.prepare(
      "UPDATE outbox SET status='pending',error=?,lease_until=0 WHERE record_id=?",
    )
      .bind(String(e.message).slice(0, 500), id)
      .run();
  }
}
export async function drain(env) {
  const { results } = await env.DB.prepare(
    "SELECT record_id FROM outbox WHERE status IN ('pending','sending') AND lease_until<? LIMIT 10",
  )
    .bind(Date.now())
    .all();
  for (const r of results) await deliver(env, r.record_id);
}
