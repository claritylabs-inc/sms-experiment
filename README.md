# Spot — Insurance Policy Vault over iMessage/SMS

Spot is a messaging-first insurance assistant by [Clarity Labs](https://claritylabs.inc). Users text a phone number, send their insurance policy PDFs or photos, and Spot parses the document, stores structured data, answers coverage questions, sends proof of insurance emails, and sets expiration reminders — all over iMessage, RCS, or SMS. No app, no login, no dashboard.

## How It Works

```
User sends iMessage/SMS ──► Linq (primary) ──► Webhook ──► Convex backend
                            OpenPhone (fallback) ──┘          │
                                                 ┌────────────┼────────────┐
                                                 ▼            ▼            ▼
                                            Welcome      Process media   Agentic Q&A
                                            flow         (PDF/photo)    (tool_use)
                                                 │            │            │
                                                 ▼            ▼            ▼
                                            Category    Extract/Vision  Email / COI /
                                            selection   pipeline       Reminders
                                                 │            │            │
                                                 ▼            ▼            ▼
                                           Linq / OpenPhone ◄── Convex DB ◄┘
                                                 │
                                                 ▼
                                           User gets reply
```

### Messaging Channels

| Channel | Provider | Number | Protocol | Role |
|---------|----------|--------|----------|------|
| **Linq** | linqapp.com | +1 (929) 443-0153 | iMessage / RCS / SMS | Primary |

**Routing:** If a user has a `linqChatId` (arrived via Linq), all outbound goes through Linq. If Linq fails, falls back to OpenPhone SMS. Legacy OpenPhone users continue on SMS.

### The Conversation State Machine

```
[first text] ──► awaiting_category ──► awaiting_policy ──► active ◄──► awaiting_email
                 "auto, homeowners,     "send me your       Q&A + actions    │
                  renters, or other?"    policy PDF/photo"   (tool_use)       │
                                                                     awaiting_email_confirm
                                                                     "reply send or cancel"
```

| State | What Spot expects | What happens |
|-------|-------------------|--------------|
| `awaiting_category` | Text: "auto", "homeowners", "renters", "other", or 1/2/3/4 | Parses category, moves to `awaiting_policy` |
| `awaiting_policy` | PDF/photo attachment or web upload | Extracts policy data, sends summary, moves to `active` |
| `active` | Any text or attachment | Questions get agentic AI answers; PDFs/photos get processed; email/reminder actions via tools |
| `awaiting_email` | Email address text | Validates and stores email, returns to `active` |
| `awaiting_email_confirm` | "send" / "cancel" / "undo" | Confirms or cancels pending email action |

### Media Processing

Spot handles both PDFs and photos:

| Media Type | Action |
|-----------|--------|
| **PDF** | Direct to extraction pipeline (cl-sdk) |
| **JPEG/PNG** (document) | Classified by Claude Haiku → embedded in PDF via pdf-lib → extraction pipeline |
| **JPEG/PNG** (contextual) | Classified by Claude Haiku → stored for vision Q&A with Claude Sonnet |
| **HEIC/WebP** (document) | User prompted to resend as PDF or screenshot |

### Agentic Q&A (Active State)

When a user with processed policies sends a message, Spot uses Claude Sonnet with **tool_use** to decide what to do:

| Tool | What it does |
|------|-------------|
| `send_email` | Send proof of insurance or coverage details to someone (user CC'd) |
| `generate_coi` | Create and email a Certificate of Insurance summary |
| `set_reminder` | Set a text reminder before a policy expires (default: 30 days) |
| `request_email` | Ask user for their email (needed before sending emails) |
| `send_upload_link` | Send the user their upload link for another policy |

**Email safety:** Emails require user confirmation ("reply send or cancel") with a 20s undo window after confirmation. Users can enable `/autosend on` to skip confirmation and send immediately.

### Policy Extraction Pipeline (Parallelized)

Both upload paths (message attachment + web upload) use the same parallelized pipeline:

```
Step 1 (parallel):  Ack message  +  PDF download
Step 2 (parallel):  Storage      +  classifyDocumentType  +  extractFromPdf (optimistic, concurrency: 3)
Step 3 (parallel):  Create record + Progress message + Typing indicator + (if quote) extractQuoteFromPdf
Step 4 (parallel):  updateExtracted + sanitizeNulls + updateState + stopTyping
Step 5:             Send summary burst
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend / DB | [Convex](https://convex.dev) — serverless TypeScript, real-time, scheduled functions, cron jobs |
| Messaging (primary) | [Linq API v3](https://linqapp.com) — iMessage, RCS, SMS via single API |
| Messaging (fallback) | [OpenPhone API](https://www.openphone.com) — SMS |
| Document AI | `@claritylabs/cl-sdk` v1.4 — classify, extract, enrich, personal lines, sanitizeNulls |
| LLM | Claude Sonnet via `@ai-sdk/anthropic` + Vercel AI SDK (with tool_use) |
| Vision AI | Claude Haiku 4.5 (image classification) + Claude Sonnet (vision Q&A) |
| Email | [Resend](https://resend.com) — transactional emails with undo window |
| Frontend | Next.js 15 + React 19 (upload page only) |
| PDF parsing | `pdf-lib` (extraction + image→PDF embedding) |

## Project Structure

```
sms-experiment/
├── convex/                     # All backend logic
│   ├── schema.ts               # Database schema (users, policies, messages, pendingEmails, reminders, webhookLocks)
│   ├── http.ts                 # HTTP router — /openphone/webhook + /linq/webhook
│   ├── openphone.ts            # OpenPhone webhook handler (SMS inbound)
│   ├── linq.ts                 # Linq webhook handler (iMessage/RCS/SMS inbound)
│   ├── ingest.ts               # Dedup (claimWebhook) + user upsert + message logging
│   ├── process.ts              # Core logic — welcome, categories, media routing, extraction, agentic Q&A, email/reminder state handlers
│   ├── imageUtils.ts           # Image detection, PDF embedding, vision intent classification
│   ├── email.ts                # Email mutations, queries, HTML templates (proof of insurance, COI, coverage)
│   ├── emailActions.ts         # Email send action (Resend API)
│   ├── reminders.ts            # Reminder CRUD mutations/queries
│   ├── reminderActions.ts      # Reminder check action (sends texts for due reminders)
│   ├── crons.ts                # Convex cron — checks reminders hourly
│   ├── send.ts                 # OpenPhone outbound SMS wrapper
│   ├── sendLinq.ts             # Linq outbound — send message, create chat, typing indicators
│   ├── messages.ts             # Message CRUD
│   ├── users.ts                # User CRUD + email + lastImageId + autoSendEmails + upload page mutations
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

## Database

Six tables in Convex:

- **users** — Phone number, email, conversation state, preferred category, upload token, `linqChatId`, `lastImageId`, `autoSendEmails`
- **policies** — Extracted policy data, raw PDF reference, policyTypes, processing status
- **messages** — Full message log (inbound + outbound), `channel` field tracks which provider, optional `imageStorageId`
- **pendingEmails** — Emails awaiting user confirmation or in 20s undo window
- **reminders** — Policy expiration reminders with trigger dates
- **webhookLocks** — Dedup table keyed by message ID (from any channel)

## Environment Variables

Set in the [Convex dashboard](https://dashboard.convex.dev). Use `--deployment kindhearted-labrador-258` for dev.

| Variable | Description |
|----------|-------------|
| `LINQ_API_KEY` | Linq Partner API v3 key |
| `LINQ_WEBHOOK_SECRET` | HMAC-SHA256 signing secret for Linq webhook verification |
| `LINQ_PHONE_NUMBER` | Linq phone number (`+19294430153`) |
| `OPENPHONE_API_KEY` | OpenPhone API key |
| `OPENPHONE_PHONE_NUMBER_ID` | Phone number ID to send from |
| `OPENPHONE_WEBHOOK_SECRET` | Webhook signature (exists but not validated yet) |
| `ANTHROPIC_API_KEY` | Claude API key for CL SDK + Q&A + vision |
| `RESEND_API_KEY` | Resend API key for email sending |
| `RESEND_FROM_EMAIL` | From address (default: `Spot <spot@spot.claritylabs.inc>`) |

Frontend: `NEXT_PUBLIC_CONVEX_URL` in `.env.local` (auto-set by `npx convex dev`). `NEXT_PUBLIC_APP_URL` for upload link base URL (defaults to `https://secure.claritylabs.inc`).

## Development

```bash
npm install
npm run dev          # Convex backend (syncs to cloud dev deployment)
npm run dev:frontend # Next.js frontend (upload page)
npm run dev:all      # Both
```

No local Convex — `npm run dev` syncs directly to `kindhearted-labrador-258`.

### Testing

1. **Linq (primary):** iMessage to (929) 443-0153
2. Follow the conversation: pick a category, upload a policy (PDF or photo), ask questions
3. **Email actions:** Ask "send proof of insurance to landlord@example.com"
4. **Reminders:** Ask "remind me before my policy expires"
5. **Photo Q&A:** Send a photo of something and ask "what does this mean?"

### Resetting a Test User

```bash
npx convex run admin:deleteUserByPhone '{"phone": "+16479221805"}'
```

Deletes the user, all their messages, and all their policies.

## What's Intentionally Not Built

- No dashboard (use Convex dashboard directly)
- No auth system (token-gated uploads only)
- No OpenPhone webhook signature verification (Linq IS verified)
- No rate limiting or spam protection
- No commercial lines support
- No thread management (messaging is single-threaded per number)
- No official ACORD COI generation (COI emails are informational summaries)
- No HEIC/WebP document extraction (users prompted to resend as JPEG/PNG/PDF)
