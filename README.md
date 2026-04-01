# Spot — SMS Insurance Policy Vault

Spot is an SMS-first insurance assistant by [Clarity Labs](https://claritylabs.inc). Users text a phone number, send their insurance policy PDFs, and Spot parses the document, stores structured data, and answers coverage questions — all over text. No app, no login, no dashboard.

## How It Works

```
User sends SMS ──► OpenPhone ──► Webhook ──► Convex backend
                                                 │
                                    ┌────────────┼────────────┐
                                    ▼            ▼            ▼
                               Welcome      Extract PDF    Answer
                               flow         via CL SDK     questions
                                    │            │         via Claude
                                    ▼            ▼            │
                               OpenPhone ◄── Convex DB ◄─────┘
                                    │
                                    ▼
                              User gets SMS
```

### The Conversation State Machine

Every user has a `state` field that controls how Spot routes their messages:

```
[first text] ──► awaiting_category ──► awaiting_policy ──► active
                 "auto, renters,        "send me your       Q&A mode +
                  or something else?"    policy PDF"         accepts new policies
```

| State | What Spot expects | What happens |
|-------|-------------------|--------------|
| `awaiting_category` | Text reply: "auto", "renters", "other", or 1/2/3 | Parses category, moves to `awaiting_policy`, sends upload link |
| `awaiting_policy` | PDF attachment (MMS) or web upload | Extracts policy data, sends summary, moves to `active` |
| `active` | Any text question, or another PDF | Questions get AI answers from policy data; PDFs get processed as new policies |

### Two Ways to Upload a Policy

**1. MMS (direct in conversation)** — User sends a PDF as an MMS attachment. Spot downloads it, runs extraction, and replies with a summary.

**2. Web upload page** — Each user gets a unique URL like `secure.claritylabs.inc/upload/{token}`. The token-gated page lets them drag-and-drop a PDF (up to 20MB). The same extraction pipeline runs server-side, and Spot texts the summary when done.

The web upload exists because MMS has reliability issues with large PDFs.

### Policy Extraction Pipeline

Both upload paths converge on the same pipeline:

1. **Classify** — `classifyDocumentType(pdfBase64)` determines if it's a policy or quote
2. **Extract** — `extractFromPdf` or `extractQuoteFromPdf` pulls structured data (carrier, policy number, dates, premium, coverages)
3. **Normalize** — `applyExtracted` or `applyExtractedQuote` maps raw extraction to standard fields
4. **Categorize** — Keyword scoring against auto/tenant keyword lists to detect policy type
5. **Store** — Policy record saved to Convex with all extracted fields + raw PDF in file storage
6. **Summarize** — Headline + top 4 coverages sent as SMS burst

### Q&A (Active State)

When a user with processed policies asks a question:

1. All `"ready"` policies are loaded for the user
2. System prompt is built via CL SDK's `buildAgentSystemPrompt` (tuned for SMS + direct intent)
3. Compliance guardrails are added (no selling, no legal/financial advice, natural texting tone)
4. Policy data is injected as document context via `buildDocumentContext`
5. Claude Sonnet generates a response (max 400 tokens, truncated to 1,550 chars for SMS)
6. Reply is sent via OpenPhone

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend / DB | [Convex](https://convex.dev) — serverless TypeScript, real-time, scheduled functions |
| SMS | [OpenPhone API](https://www.openphone.com) — inbound webhooks + outbound messages |
| Document AI | `@claritylabs/cl-sdk` — classify, extract, enrich insurance documents |
| LLM | Claude Sonnet via `@ai-sdk/anthropic` + Vercel AI SDK |
| Frontend | Next.js 15 + React 19 (upload page only) |
| PDF parsing | `pdf-lib` |

## Project Structure

```
sms-experiment/
├── convex/                     # All backend logic
│   ├── schema.ts               # Database schema (users, policies, messages, webhookLocks)
│   ├── http.ts                 # HTTP router — POST /openphone/webhook
│   ├── openphone.ts            # Webhook handler — entry point for all inbound SMS
│   ├── ingest.ts               # Dedup (claimWebhook) + user upsert + message logging
│   ├── process.ts              # Core logic — welcome, categories, extraction, Q&A
│   ├── send.ts                 # OpenPhone outbound SMS wrapper
│   ├── messages.ts             # Message CRUD
│   ├── users.ts                # User CRUD + upload token + public mutations for upload page
│   ├── policies.ts             # Policy CRUD
│   ├── upload.ts               # Web upload flow — processes PDFs from the upload page
│   └── admin.ts                # Admin utilities (deleteUserByPhone for testing)
├── src/app/
│   ├── page.tsx                # Root — redirects to claritylabs.inc
│   ├── not-found.tsx           # Branded 404
│   └── upload/[userId]/page.tsx  # Token-gated PDF upload page
├── CLAUDE.md                   # Detailed project instructions for AI assistants
└── PRD.md                      # Original product requirements
```

## Key Design Decisions

**Webhook dedup** — OpenPhone can fire duplicate webhooks. `claimWebhook` is an atomic Convex mutation that writes to a `webhookLocks` table. If the lock already exists, the duplicate is dropped.

**Async processing** — The webhook handler returns 200 immediately, then schedules all processing via `ctx.scheduler.runAfter(0, ...)`. This avoids OpenPhone timeout issues.

**sendBurst pattern** — Multi-message responses are sent with 0.8–1.5s random delays between messages to feel like a real person texting.

**Upload tokens instead of auth** — No login system. Each user gets a random 24-char token embedded in their upload URL. The upload page masks the phone number for privacy.

**State machine on `users.state`** — Simple, explicit routing. The webhook handler reads the state and dispatches to the right handler function.

## Database

Four tables in Convex:

- **users** — Phone number, conversation state, preferred category, upload token
- **policies** — Extracted policy data, raw PDF reference, processing status
- **messages** — Full message log (inbound + outbound) for audit
- **webhookLocks** — Dedup table keyed by OpenPhone message ID

## Environment Variables

Set in the [Convex dashboard](https://dashboard.convex.dev/d/cool-leopard-641), not locally:

| Variable | Description |
|----------|-------------|
| `OPENPHONE_API_KEY` | OpenPhone API key |
| `OPENPHONE_PHONE_NUMBER_ID` | Phone number ID to send from |
| `OPENPHONE_WEBHOOK_SECRET` | Webhook signature (exists but not validated yet) |
| `ANTHROPIC_API_KEY` | Claude API key for CL SDK + Q&A |

The Next.js frontend uses `NEXT_PUBLIC_CONVEX_URL` in `.env.local` (auto-set by `npx convex dev`).

`NEXT_PUBLIC_APP_URL` controls the base URL for upload links (defaults to `https://secure.claritylabs.inc`).

## Development

```bash
# Install dependencies
npm install

# Run Convex backend (syncs to cloud deployment)
npm run dev

# Run Next.js frontend (upload page)
npm run dev:frontend

# Run both
npm run dev:all
```

There is no local Convex — `npm run dev` syncs directly to the cloud deployment (`cool-leopard-641`).

### Testing the SMS Flow

1. Text anything to **(289) 212-7916** (Canadian number, currently active)
2. Follow the conversation: pick a category, upload a policy, ask questions
3. US number (929) 642-1213 is pending A2P registration

### Resetting a Test User

```bash
npx convex run admin:deleteUserByPhone '{"phone": "+16479221805"}'
```

Deletes the user, all their messages, and all their policies.

## What's Intentionally Not Built

- No dashboard (use OpenPhone + Convex dashboard directly)
- No auth system (token-gated uploads only)
- No webhook signature verification
- No rate limiting or spam protection
- No commercial lines support
- No thread management (SMS is single-threaded per number)
