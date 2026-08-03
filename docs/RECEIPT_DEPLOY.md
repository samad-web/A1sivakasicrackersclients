# Payment confirmation WhatsApp — deploy runbook

Verifying a payment in the dashboard sends the customer a WhatsApp confirmation
(`payment_reminder_new`: *"We've received your payment for Invoice #… Amount: ₹…"*) through
the `receipt-send` edge function.

**Deploy the function BEFORE the frontend.** The other order leaves every payment verify
showing "WhatsApp confirmation failed" until the function exists. Payments still save
either way — the message is best-effort and never rolls one back.

## 1. Link the project

The CLI must be logged into the account that owns `eojfokocbecrfcmpfpdf` (not
Sirah_Billing / Lexdraft):

```bash
supabase login
supabase link --project-ref eojfokocbecrfcmpfpdf
```

## 2. Secrets

`KWIC_BASE_URL` and `KWIC_API_KEY` are already set if the reminder engine was deployed —
`supabase secrets list` to confirm. Only the receipt template is new:

```bash
supabase secrets set KWIC_RECEIPT_TEMPLATE_ID=payment_reminder_new
```

Note this is *separate* from `KWIC_TEMPLATE_ID`, which is the unpaid-reminder template.

## 3. Deploy

```bash
supabase functions deploy receipt-send
```

`verify_jwt = true` is pinned in `supabase/config.toml`: the browser calls this with the
admin's session JWT, and the function additionally checks the caller against the `admins`
table before sending anything.

## 4. Verify before letting it loose

Send to your own number first — the node script bypasses the edge function and hits KWIC
directly, so it checks the template rather than the deployment:

```bash
node --env-file=.env.local scripts/send-receipt-test.mjs \
  --phone=9XXXXXXXXX --invoice=309 --amount=500 --url=https://example.com/x.pdf
```

Then verify one real payment in the dashboard and confirm that customer got exactly one
message.

## What this does NOT do

- **No PDF is attached.** `payment_reminder_new` is text-only, and `api/v1/push` silently
  ignores unknown body fields (`media_url`, `document`, `whatsapp.document`,
  `header_document_url` all returned a normal `message_id` while delivering plain text).
  Attaching the receipt needs either a template with a real header document component, or
  KWIC's free-form document API — whose endpoint rejects our api_key in every auth shape.
  Ask KWIC for the document-API credentials, or add a header component to the template and
  put its id in `KWIC_RECEIPT_TEMPLATE_ID`.
- **No de-duplication.** Un-verifying and re-verifying a payment sends a second message.
  The reminder engine's `reminder_messages` table is the model if this becomes a problem.
