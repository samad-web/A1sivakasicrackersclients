/**
 * Monthly payment reminders via KWIC.
 *
 *   Preview (sends nothing):
 *     node --env-file=.env --env-file=.env.local scripts/send-reminders.mjs --month=July
 *
 *   Deliver for real:
 *     node --env-file=.env --env-file=.env.local scripts/send-reminders.mjs --month=July --send
 *
 * Recipients are orders whose monthly_payments row for the month is not "Completed".
 * Advance payers are already excluded: advance_payment_verification marks every prepaid
 * month "Completed" up front, so they never appear here.
 *
 * Progress is appended to scripts/.sent-<month>.log. A re-run skips anything already
 * confirmed sent, so an interrupted run can be resumed without double-messaging anyone.
 */
import { appendFile, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const KWIC_BASE_URL = process.env.KWIC_BASE_URL;
const KWIC_API_KEY = process.env.KWIC_API_KEY;
const KWIC_TEMPLATE_ID = process.env.KWIC_TEMPLATE_ID;

// --- KWIC contract -----------------------------------------------------------
// Verified against the Postman cURL export. The key is a query param, not a header.
const SEND_PATH = "api/v1/push";

/**
 * payment_reminder uses Meta *named* parameters, so the keys are the literal
 * placeholder strings from the template body — not 1/2/3. Positional keys are
 * accepted by the API but bind to nothing: it returns message_id: null and
 * silently drops the message.
 */
const buildVariables = (r, month) => ({
  July: month, // {{July}}
  DavidYash: r.name, // {{DavidYash}}
  500: String(r.amount), // {{500}}
});

/** KWIC wants 91-prefixed numbers. Returns null for anything not a plain Indian mobile. */
function toKwicNumber(raw) {
  const d = String(raw ?? "").replace(/\D/g, "");
  if (d.length === 10) return `91${d}`;
  if (d.length === 12 && d.startsWith("91")) return d;
  if (d.length === 11 && d.startsWith("0")) return `91${d.slice(1)}`;
  return null; // e.g. receipt 70's +1 US number — sending it 91-prefixed would misroute
}
// -----------------------------------------------------------------------------

const PACING_MS = 25_000; // matches the existing n8n workflow's anti-spam spacing

const args = process.argv.slice(2);
const SEND = args.includes("--send");
const MONTH = (args.find((a) => a.startsWith("--month=")) ?? "--month=July").split("=")[1];
/** Target one order by receipt, ignoring paid status. For test sends to your own record. */
const RECEIPT = (args.find((a) => a.startsWith("--receipt=")) ?? "=").split("=")[1];
const SENT_LOG = join("scripts", `.sent-${MONTH}.log`);

async function rest(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: { apikey: SUPABASE_KEY } });
  if (!res.ok) throw new Error(`supabase ${res.status}: ${await res.text()}`);
  return res.json();
}

async function loadRecipients() {
  const [orders, payments] = await Promise.all([
    rest("orders?select=id,receipt_no,name,number,scheme,type&limit=2000"),
    rest(`monthly_payments?select=order_id,payment_status&month_name=eq.${MONTH}&limit=2000`),
  ]);
  const status = new Map(payments.map((p) => [p.order_id, p.payment_status]));

  const send = [];
  const skipped = [];
  for (const o of orders) {
    const st = status.get(o.id);
    if (RECEIPT) {
      // Test mode: take this one record whatever its status, reject everything else.
      if (String(o.receipt_no) !== RECEIPT) continue;
      const phone = toKwicNumber(o.number);
      if (!phone) throw new Error(`receipt ${RECEIPT} has no usable phone number`);
      send.push({ receipt: o.receipt_no, name: (o.name ?? "").trim(), phone, amount: Number(o.scheme), status: st ?? "none" });
      continue;
    }
    if (st === "Completed") continue;
    if (!st) {
      skipped.push({ receipt: o.receipt_no, why: `no ${MONTH} payment row` });
      continue;
    }
    const name = (o.name ?? "").trim();
    const phone = toKwicNumber(o.number);
    const amount = Number(o.scheme);
    if (!name) skipped.push({ receipt: o.receipt_no, why: "missing name" });
    else if (!phone) skipped.push({ receipt: o.receipt_no, why: "invalid phone" });
    else if (!Number.isFinite(amount) || amount <= 0) skipped.push({ receipt: o.receipt_no, why: "invalid amount" });
    else send.push({ receipt: o.receipt_no, name, phone, amount, status: st });
  }
  return { send, skipped };
}

async function sendOne(r) {
  const url = new URL(SEND_PATH, KWIC_BASE_URL);
  url.searchParams.set("api_key", KWIC_API_KEY);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mobile_number: r.phone,
      variable: buildVariables(r, MONTH),
      template_id: KWIC_TEMPLATE_ID,
    }),
  });
  const body = await res.text();
  if (!res.ok || /invalid/i.test(body)) throw new Error(`kwic ${res.status}: ${body.slice(0, 200)}`);
  // A 200 with an `id` does NOT mean delivery: KWIC records the attempt and returns
  // message_id: null when it never dispatches. Only a real message_id counts as sent.
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new Error(`kwic returned non-JSON: ${body.slice(0, 200)}`);
  }
  if (!parsed.message_id) throw new Error(`not dispatched (message_id null): ${body.slice(0, 200)}`);
  return body;
}

const { send, skipped } = await loadRecipients();

/**
 * receipt_no is NOT unique — 188 receipt values are shared by different customers
 * (e.g. receipt 309 belongs to two people). Keying the sent log on receipt alone
 * marks every customer sharing a receipt as sent once any one of them is messaged.
 * Pair it with the phone number to identify a delivery.
 */
const sentKey = (r) => `${r.receipt}|${r.phone}`;

let alreadySent = new Set();
try {
  const log = await readFile(SENT_LOG, "utf8");
  alreadySent = new Set(log.split("\n").filter(Boolean).map((l) => sentKey(JSON.parse(l))));
} catch {
  /* first run */
}
// Test sends are repeatable, so they ignore the sent log.
const queue = RECEIPT ? send : send.filter((r) => !alreadySent.has(sentKey(r)));

console.log(`month=${MONTH}  unpaid=${send.length}  already_sent=${alreadySent.size}  queued=${queue.length}  skipped=${skipped.length}`);
for (const s of skipped) console.log(`  skip ${s.receipt}: ${s.why}`);

if (!SEND) {
  const preview = queue.map((r) => ({ ...r, variable: buildVariables(r, MONTH) }));
  await writeFile(join("scripts", `preview-${MONTH}.json`), JSON.stringify(preview, null, 2));
  console.log(`\nDRY RUN — nothing sent. Payload for the first recipient:`);
  console.log(JSON.stringify({ mobile_number: queue[0]?.phone, variable: buildVariables(queue[0] ?? {}, MONTH), template_id: KWIC_TEMPLATE_ID }, null, 2));
  console.log(`\nFull preview -> scripts/preview-${MONTH}.json`);
  console.log(`Re-run with --send to deliver ${queue.length} messages (~${Math.round((queue.length * PACING_MS) / 60000)} min at ${PACING_MS / 1000}s spacing).`);
  process.exit(0);
}

for (const missing of [
  !SUPABASE_URL && "VITE_SUPABASE_URL",
  !KWIC_BASE_URL && "KWIC_BASE_URL",
  !KWIC_API_KEY && "KWIC_API_KEY",
  !KWIC_TEMPLATE_ID && "KWIC_TEMPLATE_ID",
].filter(Boolean)) {
  console.error(`missing env: ${missing}`);
  process.exit(1);
}

let ok = 0;
let failed = 0;
for (const [i, r] of queue.entries()) {
  try {
    const response = await sendOne(r);
    await appendFile(SENT_LOG, JSON.stringify({ receipt: r.receipt, phone: r.phone, at: new Date().toISOString(), response }) + "\n");
    ok++;
    console.log(`[${i + 1}/${queue.length}] sent ${r.receipt} -> ...${r.phone.slice(-4)}  ${response.slice(0, 120)}`);
  } catch (err) {
    failed++;
    console.error(`[${i + 1}/${queue.length}] FAILED ${r.receipt}: ${err.message}`);
    if (failed >= 3 && ok === 0) {
      console.error("\nAborting: first 3 sends all failed — the KWIC contract is probably wrong.");
      process.exit(1);
    }
  }
  if (i < queue.length - 1) await new Promise((res) => setTimeout(res, PACING_MS));
}
console.log(`\ndone: ${ok} sent, ${failed} failed`);
