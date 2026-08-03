/**
 * One-off test send for the paid-receipt pair: the payment_reminder_new template, then the
 * receipt PDF as a document message.
 *
 * Run this BEFORE letting the dashboard send to customers — it settles the two things the
 * app can't settle on its own: that {{Scheme}}/{{Amount}} are the right variable names, and
 * which endpoint the document payload actually posts to.
 *
 *   node --env-file=.env.local scripts/send-receipt-test.mjs \
 *     --phone=9XXXXXXXXX --invoice=309 --amount=500 --url=https://.../receipt.pdf
 *
 *   --only=template|document   send just one of the two (default: both)
 *   --probe                    try the document payload against every candidate endpoint
 *                              and report which one dispatches
 *   --numeric-phone            send recipient.phone as a number, matching the literal
 *                              sample payload, instead of a string
 *
 * A 200 with `message_id: null` means KWIC accepted the call but never dispatched it —
 * a wrong variable key or wrong endpoint, NOT something to retry.
 *
 * NOTE: the document message is free-form, so Meta only delivers it if the test number has
 * messaged the business in the last 24h. Message from that handset first, or a null
 * message_id here may be policy rather than a bad payload.
 */
const argv = process.argv.slice(2);
const arg = (name, fallback = '') =>
  (argv.find((a) => a.startsWith(`--${name}=`)) ?? `=${fallback}`).split('=').slice(1).join('=');
const flag = (name) => argv.includes(`--${name}`);

const BASE_URL = process.env.KWIC_BASE_URL || 'https://app.kwic.in/';
const API_KEY = process.env.KWIC_API_KEY;
const TEMPLATE_ID = arg('template', process.env.KWIC_RECEIPT_TEMPLATE_ID || 'payment_reminder_new');
const CHANNEL_ID = arg('channel', process.env.KWIC_CHANNEL_ID || '');
const MEDIA_FIELD = arg('media-field', process.env.KWIC_MEDIA_FIELD || '');
const DOC_PATH = arg('doc-path', process.env.KWIC_DOC_PATH || 'api/v1/push');

// Template-only by default: as of 2026-08-03 no document endpoint is reachable with our
// api_key, so sending the pair would fail every time. Pass --only=document to retry it.
const ONLY = arg('only', 'template');
const phoneRaw = arg('phone');
const name = arg('name', 'Customer');
const invoice = arg('invoice');
const amount = arg('amount');
const receiptUrl = arg('url');

function toKwicNumber(raw) {
  const d = String(raw ?? '').replace(/\D/g, '');
  if (d.length === 10) return `91${d}`;
  if (d.length === 12 && d.startsWith('91')) return d;
  if (d.length === 11 && d.startsWith('0')) return `91${d.slice(1)}`;
  return null;
}

const phone = toKwicNumber(phoneRaw);
for (const [bad, msg] of [
  [!API_KEY, 'missing KWIC_API_KEY (use --env-file=.env.local)'],
  [!phone, `--phone=${phoneRaw || '?'} is not an Indian mobile number`],
  [!invoice, 'missing --invoice=<receipt no> ({{Scheme}})'],
  [!amount, 'missing --amount=<amount> ({{Amount}})'],
  [!receiptUrl, 'missing --url=<receipt pdf url>'],
  [ONLY && !['template', 'document'].includes(ONLY), '--only= must be template or document'],
]) {
  if (bad) {
    console.error(msg);
    process.exit(1);
  }
}

async function post(path, body) {
  const url = new URL(path, BASE_URL);
  url.searchParams.set('api_key', API_KEY);
  console.log(`\nPOST ${url.origin}${url.pathname}?api_key=***`);
  console.log(JSON.stringify(body, null, 2));

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err) {
    console.error(`  network error: ${err.message}`);
    return { ok: false };
  }
  const text = await res.text();
  console.log(`  -> ${res.status} ${text.slice(0, 300)}`);

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false };
  }
  return { ok: Boolean(parsed.message_id), messageId: parsed.message_id };
}

const templateBody = {
  mobile_number: phone,
  variable: { Scheme: invoice, Amount: amount },
  template_id: TEMPLATE_ID,
  ...(MEDIA_FIELD ? { [MEDIA_FIELD]: receiptUrl } : {}),
};

const documentBody = {
  channel_id: CHANNEL_ID,
  channel_type: 'whatsapp',
  recipient: { name, phone: flag('numeric-phone') ? Number(phone) : phone },
  whatsapp: {
    type: 'document',
    document: { caption: `Payment receipt #${invoice}`, link: receiptUrl },
  },
};

if (flag('dry-run')) {
  console.log('DRY RUN — nothing sent.\n\ntemplate ->');
  console.log(JSON.stringify(templateBody, null, 2));
  console.log('\ndocument ->');
  console.log(JSON.stringify(documentBody, null, 2));
  process.exit(0);
}

const results = {};

if (ONLY !== 'document') {
  console.log('=== 1/2  confirmation template ===');
  results.template = await post('api/v1/push', templateBody);
}

if (ONLY !== 'template') {
  console.log('\n=== 2/2  receipt PDF (document message) ===');
  if (!CHANNEL_ID) {
    console.error('  missing channel id — pass --channel=<id> or set KWIC_CHANNEL_ID');
    results.document = { ok: false };
  } else if (flag('probe')) {
    // The sample payload didn't say where it posts. Try the plausible paths in order and
    // stop at the first one that actually dispatches.
    for (const path of ['api/v1/push', 'api/v1/message', 'api/v1/messages', 'api/v1/send']) {
      const r = await post(path, documentBody);
      if (r.ok) {
        console.log(`\n  ✓ dispatched via "${path}" — set VITE_KWIC_DOC_PATH=${path}`);
        results.document = r;
        break;
      }
      results.document = r;
    }
  } else {
    results.document = await post(DOC_PATH, documentBody);
  }
}

console.log('\n=== summary ===');
for (const [k, v] of Object.entries(results)) {
  console.log(`  ${k.padEnd(9)} ${v.ok ? `dispatched (${v.messageId})` : 'NOT dispatched'}`);
}
if (!Object.values(results).every((r) => r.ok)) {
  console.log('\nFor the template: a null message_id usually means wrong variable names.');
  console.log('For the document: re-run with --probe to find the right endpoint, and check');
  console.log('the test handset has messaged the business within the last 24h.');
  process.exit(1);
}
console.log('\nNow confirm on the handset: text arrives first, PDF second, and the invoice');
console.log('number + amount match what is printed on the receipt.');
