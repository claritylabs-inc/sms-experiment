# Spot — SMS Experiment Project Overview

**Brand:** Spot (by Clarity Labs)
**Repo:** `claritylabs-inc/sms-experiment`
**Local:** `/Users/adyan/CascadeProjects/sms-experiment`
**Live number:** +1 (929) 443-0153 (iMessage / RCS / SMS via Linq)

---

## What It Is

A messaging-first insurance policy vault. Users text a phone number, send their insurance policy PDFs, and an AI assistant ("Spot") parses the document using the Clarity Labs SDK, stores structured data, and answers coverage questions — all over iMessage, RCS, or SMS. No app, no login, no dashboard.

---

## What Changed (Updates Since Initial Commit)

### 5 commits pulled from main:

| Commit | What Changed |
|--------|-------------|
| `456e7af` | **Linq as primary messaging channel** — full iMessage/RCS/SMS support via Linq API v3, parallelized extraction pipeline, typing indicators, channel-aware routing with OpenPhone fallback |
| `f1d8abe` | Added README with architecture docs, flow diagrams, setup instructions |
| `083a0c4` | Fixed deployment names — prod is `cheery-giraffe-339`, dev is `kindhearted-labrador-258` (was `cool-leopard-641`) |
| `d87a3e2` | **CI/CD pipeline** — GitHub Actions workflow auto-deploys Convex on push to main |
| `b022a7e` | Updated phone number to new Linq number +1 (929) 443-0153 |

### Key Changes in Detail

**1. Linq Integration (biggest change — ~600 new lines)**
- New files: `convex/linq.ts` (webhook handler), `convex/sendLinq.ts` (outbound API wrapper)
- Linq is now the **primary** messaging channel; OpenPhone is fallback only
- HMAC-SHA256 webhook signature verification (constant-time comparison)
- Typing indicators (`startTyping` / `stopTyping`) during PDF processing
- Higher token limits for iMessage users (800 tokens vs 400 for SMS)
- No character truncation for iMessage (SMS still capped at 1,550 chars)
- Channel logged on every message record (`"linq"` or `"openphone"`)

**2. Parallelized Extraction Pipeline**
- `process.ts` rewritten with aggressive `Promise.all` parallelization
- Classification + storage upload + optimistic policy extraction all run simultaneously
- For the common case (policies), extraction finishes alongside classification — saves 3-5s
- Same parallelized pipeline shared between message attachments and web uploads

**3. Dual-Channel Routing (`sendAndLog`)**
- If user has `linqChatId` → send via Linq API
- If Linq fails → automatic fallback to OpenPhone SMS
- If no `linqChatId` (legacy user) → OpenPhone directly
- Channel field tracked on every message for analytics

**4. Schema Updates**
- `users` table: added `linqChatId` field + `by_linq_chat_id` index
- `messages` table: added `channel` field (`"openphone"` | `"linq"`)

**5. Deployment Changes**
- Prod deployment renamed to `cheery-giraffe-339` (was `cool-leopard-641`)
- Dev deployment: `kindhearted-labrador-258`
- GitHub Actions auto-deploy on push to main via `CONVEX_DEPLOY_KEY` secret

---

## Architecture

```
                    iMessage / RCS / SMS
                          │
              ┌───────────┼───────────┐
              ▼                       ▼
    Linq API (primary)        OpenPhone (fallback)
    +1 (929) 443-0153
              │                       │
    POST /linq/webhook      POST /openphone/webhook
              │                       │
              └───────┬───────────────┘
                      ▼
              Convex Backend (TypeScript, serverless)
              ┌───────────────────────────────────┐
              │  claimWebhook (dedup)              │
              │  ingestMessage / ingestLinqMessage  │
              │  State machine routing              │
              │  CL SDK (classify + extract)        │
              │  Claude Sonnet 4.6 (Q&A)            │
              │  sendAndLog (channel routing)        │
              └───────────────────────────────────┘
                      │                │
              ┌───────┘                └───────┐
              ▼                                ▼
        Convex DB                    Convex File Storage
    (users, policies,                  (raw PDFs)
     messages, webhookLocks)
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend / DB | Convex (TypeScript, serverless, real-time) |
| Messaging (primary) | Linq API v3 — iMessage, RCS, SMS |
| Messaging (fallback) | OpenPhone API — SMS only |
| Document AI | `@claritylabs/cl-sdk` (classify, extract, enrich, agent prompts) |
| LLM | Claude Sonnet 4.6 via `@ai-sdk/anthropic` + Vercel AI SDK |
| Frontend | Next.js 15 + React 19 (upload page only) |
| PDF parsing | `pdf-lib` |
| CI/CD | GitHub Actions → `npx convex deploy` |

---

## File Structure

```
sms-experiment/
├── .github/workflows/
│   └── deploy.yml              # Auto-deploy Convex on push to main
├── convex/
│   ├── schema.ts               # 4 tables: users, policies, messages, webhookLocks
│   ├── http.ts                 # HTTP router — /openphone/webhook + /linq/webhook
│   ├── openphone.ts            # OpenPhone webhook handler (SMS inbound)
│   ├── linq.ts                 # Linq webhook handler (iMessage/RCS/SMS) + HMAC verification
│   ├── ingest.ts               # Dedup (claimWebhook) + user creation + message logging
│   ├── process.ts              # Core logic — welcome, categories, extraction, Q&A (~620 lines)
│   ├── send.ts                 # OpenPhone outbound SMS wrapper
│   ├── sendLinq.ts             # Linq outbound — send message, create chat, typing indicators
│   ├── messages.ts             # Message CRUD (log, claim, query)
│   ├── users.ts                # User CRUD + upload token + public mutations for upload page
│   ├── policies.ts             # Policy CRUD (create, updateExtracted, getByUser)
│   ├── upload.ts               # Web upload processing pipeline
│   ├── admin.ts                # Admin utilities (deleteUserByPhone)
│   └── _generated/             # Auto-generated Convex types
├── src/app/
│   ├── layout.tsx              # Geist + Instrument Serif fonts, ConvexProvider
│   ├── page.tsx                # Root → redirect to claritylabs.inc
│   ├── not-found.tsx           # Branded 404
│   └── upload/[userId]/page.tsx # Token-gated PDF upload (drag-and-drop)
├── CLAUDE.md                   # AI assistant instructions
├── README.md                   # Project docs
├── PRD.md                      # Original product requirements
├── package.json
├── convex.json
└── next.config.ts
```

---

## Database Schema

### `users`
| Field | Type | Notes |
|-------|------|-------|
| `phone` | string | E.164 format, indexed, unique identifier |
| `name` | string? | Optional |
| `state` | string? | `"awaiting_category"` → `"awaiting_policy"` → `"active"` |
| `preferredCategory` | string? | `"auto"` / `"tenant"` / `"other"` |
| `uploadToken` | string? | 24-char random token for web upload page, indexed |
| `linqChatId` | string? | Linq chat ID for ongoing conversation, indexed |
| `lastActiveAt` | number | Last message timestamp |
| `createdAt` | number | Signup timestamp |

### `policies`
| Field | Type | Notes |
|-------|------|-------|
| `userId` | Id<"users"> | Indexed |
| `category` | `"auto"` / `"tenant"` / `"other"` | Detected or user-specified |
| `documentType` | `"policy"` / `"quote"` | From CL SDK classification |
| `carrier` | string? | Extracted carrier name |
| `policyNumber` | string? | Policy/quote number |
| `effectiveDate` | string? | Coverage start |
| `expirationDate` | string? | Coverage end |
| `premium` | string? | Premium amount |
| `insuredName` | string? | Name of insured |
| `summary` | string? | AI-generated summary |
| `coverages` | any? | Array of coverage objects |
| `rawExtracted` | any? | Full CL SDK extraction output |
| `pdfStorageId` | Id<"_storage">? | Raw PDF in Convex storage |
| `status` | `"processing"` / `"ready"` / `"failed"` | Pipeline status |
| `createdAt` | number | Timestamp |

### `messages`
| Field | Type | Notes |
|-------|------|-------|
| `userId` | Id<"users"> | Indexed |
| `direction` | `"inbound"` / `"outbound"` | |
| `body` | string | Message text |
| `hasAttachment` | boolean | |
| `openPhoneId` | string? | Dedup key (any channel), indexed |
| `channel` | string? | `"openphone"` / `"linq"` |
| `timestamp` | number | |

### `webhookLocks`
| Field | Type | Notes |
|-------|------|-------|
| `openPhoneId` | string | Dedup key (Linq prefixed `linq_`), indexed |
| `processedAt` | number | |

---

## Conversation State Machine

```
[First text] ──► awaiting_category ──► awaiting_policy ──► active
                 "auto, renters,        "send me your       Q&A mode +
                  or something else?"    policy PDF"         accepts new policies
```

### Flow 1: First Contact
1. User texts Spot number → webhook fires
2. `claimWebhook` (atomic dedup) → `ingestMessage` / `ingestLinqMessage`
3. New user created: `state: "awaiting_category"`, `uploadToken` generated, `linqChatId` stored if Linq
4. `sendWelcome` scheduled → 3-message burst: "Hey! This is Spot 👋" → "I can go through your insurance policy..." → "Is it auto, renters, or something else?"

### Flow 2: Category Selection
1. User replies "auto" / "renters" / "other" (or 1/2/3)
2. `handleCategorySelection` parses input via keyword + number matching
3. State → `"awaiting_policy"`, `preferredCategory` set
4. Linq users: "Just send me the PDF right here" / OpenPhone users: get web upload link
5. If attachment sent instead of text → skips straight to policy processing

### Flow 3: Policy Processing (Parallelized Pipeline)
```
Step 1 (parallel):  Ack message  +  PDF download
Step 2 (parallel):  Storage      +  classifyDocumentType  +  extractFromPdf (optimistic)
Step 3 (parallel):  Create record + Progress message + Typing indicator
Step 4 (parallel):  updateExtracted + updateState + stopTyping
Step 5:             Send summary burst
```
- Policies: extraction runs alongside classification (saves 3-5s)
- Quotes: second `extractQuoteFromPdf` call, but record creation + messaging still parallel
- Error case: retry prompt for Linq users, web upload link fallback

### Flow 4: Web Upload
1. User visits `secure.claritylabs.inc/upload/{uploadToken}`
2. Token verified, phone masked in UI
3. Drag-and-drop PDF (max 20MB) → Convex storage → `processUploadedPolicy`
4. Same parallelized extraction pipeline as message attachment flow
5. Summary sent via user's channel (Linq if available, else OpenPhone)

### Flow 5: Q&A (Active State)
1. User texts a question (no attachment)
2. Load all `"ready"` policies → build system prompt via CL SDK
3. Compliance guardrails injected (no selling, no legal advice, natural texting tone)
4. Claude Sonnet 4.6 generates response (800 tokens for Linq, 400 for OpenPhone)
5. Reply sent via user's channel (no truncation for iMessage, 1,550 char cap for SMS)

### Nudge Flow (text while awaiting_policy)
- Recognizes retry intent ("try again", "retry", "resend")
- Checks for category change
- Linq: nudge to send PDF directly + web upload backup
- OpenPhone: web upload link

---

## Channel Routing

```
sendAndLog(ctx, userId, phone, body, linqChatId?)
  │
  ├─ linqChatId exists? ──► Try Linq API
  │                           │
  │                     Linq fails? ──► Fallback to OpenPhone SMS
  │
  └─ No linqChatId ──► OpenPhone SMS directly
  │
  └─ Log message with channel: "linq" | "openphone"
```

- Linq supports: read receipts ("Seen"), typing indicators, no character limit, iMessage-native PDF attachments
- OpenPhone: SMS only, 1,550 char truncation, web upload links for PDFs

---

## CL SDK Functions Used

| Function | Purpose |
|----------|---------|
| `classifyDocumentType(pdfBase64)` | Is it a policy or a quote? |
| `extractFromPdf(pdfBase64)` | Structured extraction from policy PDFs |
| `extractQuoteFromPdf(pdfBase64)` | Structured extraction from quote PDFs |
| `applyExtracted(extracted)` | Normalize policy extraction into standard fields |
| `applyExtractedQuote(extracted)` | Normalize quote extraction into standard fields |
| `buildAgentSystemPrompt(config)` | System prompt tuned for SMS + direct intent |
| `buildDocumentContext(policies, quotes, question)` | Format policy data for LLM context |

---

## Environment Variables

All set in **Convex dashboard** (not `.env`).

| Variable | Description |
|----------|-------------|
| `LINQ_API_KEY` | Linq Partner API v3 key |
| `LINQ_WEBHOOK_SECRET` | HMAC-SHA256 signing secret for webhook verification |
| `LINQ_PHONE_NUMBER` | `+19294430153` — outbound sender |
| `OPENPHONE_API_KEY` | OpenPhone API key (fallback) |
| `OPENPHONE_PHONE_NUMBER_ID` | `PN3iSAb7ZR` — OpenPhone sender |
| `OPENPHONE_WEBHOOK_SECRET` | Exists but not validated in code |
| `ANTHROPIC_API_KEY` | Claude API key for CL SDK + Q&A |

Frontend: `NEXT_PUBLIC_CONVEX_URL` in `.env.local` (auto-set by `npx convex dev`). `NEXT_PUBLIC_APP_URL` for upload link base URL (defaults to `https://secure.claritylabs.inc`).

---

## Deployments

| Environment | Convex Deployment | Convex Dashboard | Deploys From |
|-------------|-------------------|------------------|-------------|
| **Production** | `cheery-giraffe-339` | dashboard.convex.dev/d/cheery-giraffe-339 | `main` branch (auto via GitHub Actions) |
| **Development** | `kindhearted-labrador-258` | dashboard.convex.dev/d/kindhearted-labrador-258 | `npx convex dev` (local) |

CI/CD: `.github/workflows/deploy.yml` — on push to `main`, runs `npx convex deploy` with `CONVEX_DEPLOY_KEY` secret.

---

## Dev Commands

```bash
npm run dev          # Convex backend (syncs to dev deployment)
npm run dev:frontend # Next.js frontend (upload page)
npm run dev:all      # Both concurrently
```

### Testing
- **Linq:** iMessage to (929) 443-0153
- **OpenPhone:** SMS to (289) 212-7916
- **Test phone:** Adyan 6479221805

### Reset a test user
```bash
npx convex run admin:deleteUserByPhone '{"phone": "+16479221805"}'
```

---

## Design Decisions

1. **Linq-first routing** — iMessage/RCS preferred over SMS for richer experience (typing indicators, no char limits, native PDF attachments)
2. **Webhook dedup via `webhookLocks`** — atomic Convex mutation prevents double-processing from either channel
3. **HMAC verification on Linq only** — Linq webhooks verified with SHA-256; OpenPhone verification not yet implemented
4. **Parallelized extraction** — classification + storage + optimistic extraction run simultaneously via `Promise.all`
5. **Async all processing** — webhook handlers return 200 immediately, everything scheduled via `ctx.scheduler.runAfter(0, ...)`
6. **sendBurst pattern** — 0.8-1.5s random delays between messages to feel human
7. **Upload tokens instead of auth** — no login, 24-char random tokens, masked phone on upload page
8. **Compliance guardrails** — Spot doesn't sell, recommend, or give legal/financial advice

---

## What's Intentionally Not Built

- No dashboard (use Convex dashboard + OpenPhone directly)
- No auth system (tokens only)
- No OpenPhone webhook signature verification
- No rate limiting or spam protection
- No commercial lines support
- No thread management (single-threaded per number)
