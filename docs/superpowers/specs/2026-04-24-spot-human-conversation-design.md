# Spot Human Conversation Redesign

**Date:** 2026-04-24
**Status:** Design approved, ready for implementation plan
**Trigger:** User (Anna Maria, CEO of impact.ai) hit an identical-message loop on first contact and disengaged. Root cause: Spot funnels every first message through a rigid category parser instead of reading what was actually said.
**Deploy constraint:** Full redesign ships today for a 300-person event. Requires 30-60 min real-phone soak before doors open.

---

## Problem

Two failures combined in one conversation:

1. **Tone-deaf routing.** User asked "what insurance can I get with you" — a discovery question. Spot replied with a canned "pick a category" pitch. Spot is a policy vault, not a shop; it never said so.
2. **Literal loop bug.** `convex/process.ts` `handleCategorySelection` re-sends an identical hardcoded string ("Haha no worries, is it auto, homeowners, renters, or something else?") whenever `parseCategoryInput` returns null. User said "I don't have any yet. I am new to the US" → same line. Said "I have NONE" → same line word-for-word.

Beyond the bug, the broader conversation feel is robotic: long paragraph welcomes, no read receipts, no typing indicator, "Haha no worries" fallback tic, no acknowledgment of what the user actually said.

## Goals

- Fix the identical-message loop permanently
- Make Spot's first-message response match the user's actual intent
- Build a graceful "no policy yet / curious / early-stage" path that feels like texting a friend
- Replace the robotic cadence with a human rhythm (read receipts, typing, short chunked bubbles)
- Apply a consistent voice (chill friend who works in insurance) across all copy
- Survive a 300-person event day with reliability safeguards

## Non-goals

- Becoming an insurance shopping assistant or broker referral product
- Full ongoing-advisor feature (checking in on users over time, proactive coaching)
- Typo injection or other extreme realism hacks
- Changing the state machine's handling of users who already have policies uploaded (Q&A voice only)
- Rebuilding the upload flow or extraction pipeline

---

## Architecture

Five coordinated pieces. All additive; none replace the existing state machine wholesale.

### 1. First-message intent classifier

New file `convex/intent.ts`. Runs **once per user, on their first inbound message**. Uses Claude Haiku with a 3s timeout.

Returns one of six intents plus extracted context:

| Intent | Example | Route |
|---|---|---|
| `greeting` | "hey", "hi", "yo" | Rewritten short welcome |
| `capability_question` | "what can you do", "what insurance can I get with you" | No-policy chat handler (opens with capability clarification + discovery) |
| `has_policy` | "need to upload my renters", "here's my auto policy" | Skip to upload-ready state with pre-filled category |
| `no_policy_yet` | "i don't have insurance", "new to the US, looking for coverage" | No-policy chat handler |
| `wrong_number` | "who is this", "stop texting me" | One-line deflect, soft opt-out |
| `unclear` | anything ambiguous | Default to capability path (errs on friendly explainer) |

On any error (timeout, API fail, parse fail) → default to `unclear`. The classifier never blocks a reply.

### 2. No-policy discovery chat

New file `convex/noPolicyChat.ts`. Claude Sonnet with structured output and an 8s timeout.

**Mission (per user guidance):** learn who this person is and find where Spot can be useful in their life. Not an offramp — a real conversation. Probe for personal policies they might already have (parents' auto, previous country renters). Be the friend they text when they do have something later.

**User state:** `"no_policy_chat"` (new). Persists until the LLM emits `shouldExit: true`.

**New user field:** `noPolicyContext: string` — short running summary of what Spot learned. Updated each turn. Loaded into next turn's system prompt. Persists after exit so future interactions feel continuous.

**LLM output schema:**
```ts
{
  messages: string[],        // 1-5 short bubbles
  updatedContext: string,    // running summary
  shouldExit: boolean        // true when conversation is done or user has a policy to upload
}
```

**Exit conditions (model decides):**
- User mentions having a policy / quote → "drop it in here and i'll read it", `shouldExit: true`
- User signs off / thanks / drifts → warm wrap, `shouldExit: true`
- 6+ exchanges with no progress → warm wrap, `shouldExit: true`

**Fallback on timeout or malformed output:** send a single hardcoded bubble ("hmm one sec — something went weird on my end. what's going on?") so the user never sees silence.

### 3. The loop fix (two-layer)

**Layer 1 — keyword scan in `parseCategoryInput` fallback.** Before reaching the hardcoded re-prompt, check the input for no-policy phrases: `"don't have"`, `"no insurance"`, `"none"`, `"nothing"`, `"new to"`, `"haven't"`, `"looking to get"`, `"shopping for"`. If matched → transition user to `no_policy_chat` state and invoke the no-policy chat handler.

**Layer 2 — attempt counter + LLM clarifier.** New user field `categoryAttempts: number`. On each fallback:
- Attempt 1: hardcoded varied re-prompt ("not sure i followed — auto, renters, homeowners, or something else?")
- Attempt 2+: route to LLM clarifier (same no-policy chat handler, with context "user keeps not matching a category"). If LLM fails/times out, send a different hardcoded bubble ("sorry, having a moment — are you trying to upload a policy or looking for coverage?") so there's still no repeat.

No two consecutive outbound messages can ever be identical. This invariant is enforced in `sendAndLog` as a safety net: if the outgoing body matches the last-sent body for this user, log a warning and append a trivial suffix to force difference.

### 4. Human cadence

**Read receipts + typing indicator on inbound** (Linq only):

New helper `acknowledgeInbound(ctx, user)`. Fires at the top of every Linq inbound processing path, before the state machine decides what to do. Sequence:
1. `markRead` → "Read" appears on user's side (~500ms)
2. 150-400ms random pause
3. `startTyping` → dots appear
4. Hand off to handler

Typing clears automatically on first `sendAndLog`. No typing restarts between rapid bubbles — real people don't pulse dots between every line in a burst.

Both Linq calls are fire-and-forget with swallowed errors. OpenPhone/iMessage-bridge paths skip this helper entirely (unsupported).

**Chunked replies with tight delays.** `sendBurst` updated delay formula:

```ts
delay = clamp(300 + nextMessage.length * 8, 400, 1200) + jitter(±100ms)
```

Short "hey!" → ~400ms. Two-sentence bubble → up to 1200ms. Tennis rhythm, not lecture.

**Rate limit debounce.** New helper `debounceInbound(ctx, userId, text)`. Collects inbound messages into a 2-second window keyed on user ID. First message opens the window and schedules a Convex action to fire 2s later; subsequent inbound messages append to `messageBuffer` and return null (their webhook returns 200 immediately, no reply fires). When the scheduled action fires, it reads + clears the buffer and processes the concatenated text as a single turn. If a new message arrives *after* the window closes but while processing is underway, it opens a fresh window. Kills the "user sends three rapid messages, three replies race each other" failure mode.

### 5. Voice codex

Applies to every hardcoded string AND prepends every LLM system prompt:

```
voice:
- lowercase unless proper noun
- short bubbles — 1-2 sentences each, max
- acknowledge what they said before pivoting
- no "haha", "no worries", "great question", or assistant tics
- no emojis unless they use one first (then match theirs sparingly)
- chill friend who works in insurance, not a chatbot

engagement (tennis, not lecture):
- short volleys, fast back-and-forth
- one question per message max, don't stack
- end with something that invites a reply
- never dump the full answer in one bubble

discovery:
- lead with curiosity about THEM, not their coverage
- ask what they do, where they're at, what they're building
- coverage read surfaces from who they are, never opens with it
```

**No-policy chat system prompt adds:**

```
you're trying to learn who this person is and figure out where
you can actually be useful in their life.

most people text you because they have a policy to read. but
some don't — they're new, they're early-stage, they're just
curious, they don't have anything set up yet.

when someone has nothing: your job isn't to get rid of them.
it's to actually get to know them. ask what they do, what
they're building, where they're at. make them feel heard.

if they're early-stage / new to the country / haven't set
things up yet — probe for personal policies they might
already have back home, or in a previous life. maybe they
have renters somewhere, maybe their parents have an auto
policy on a car they still drive. cover the personal side
before the business side.

be the friend they text when they DO finally get a policy.
that's the win. not closing them today.

boundaries:
- you don't sell insurance or recommend specific carriers
- you don't give legal or financial advice
- you don't promise coverage amounts or prices
```

---

## Copy rewrites

### Welcome (intent = greeting)

**Before:**
- "Hey! This is Spot 👋"
- "I can go through your insurance policy and tell you exactly what you're covered for — plus send proof of insurance, set reminders, and more"
- "Is it auto, homeowners, renters, or something else?"

**After:**
- "hey, i'm spot"
- "drop an insurance policy in here and i'll read it for you"
- "what kind is it?"

### Welcome (intent = capability_question)

Two-step: send hardcoded `"hey!"` immediately via `sendAndLog` for instant warmth (no LLM wait), then invoke the no-policy chat handler with a seeded context (`"user just asked what Spot does — clarify + start discovery"`). The LLM's `messages[]` becomes bubbles 2-N. This keeps the first bubble latency low even if Sonnet is slow.

### Category confirmed (auto / homeowners / renters)

**Before:** `"${label}, got it"` + "Just send me the PDF or a photo right here and I'll go through it"
**After:** `"${label}, cool"` + "drop the pdf or a photo in here"

### Category confirmed (other)

**Before:** "Works for me" + "Just send me the PDF or a photo of the doc right here and I'll take a look"
**After:** "ok cool" + "send the pdf or photo whenever you have it"

### Category unclear (attempt 1)

**Before:** "Haha no worries, is it auto, homeowners, renters, or something else?" (repeated indefinitely)
**After:** "not sure i followed — auto, renters, homeowners, or something else?"

### Category unclear (attempt 2+)

Route to LLM clarifier. On LLM fail: "sorry, having a moment — are you trying to upload a policy or looking for coverage?"

### Post-extraction summary

**Before:** Long paragraph dump of carrier, policy type, dates, coverages, premium
**After:** 3-4 short bubbles:
- "ok got it"
- "[carrier] [category]"
- "runs [effectiveDate] to [expirationDate]"
- "[premium] — anything you want me to dig into?"

### Upload-in-progress

**Before:** "Got it — reading through your document now" → "Found your policy — pulling out coverages and limits"
**After:** Single bubble: "ok reading through this". Typing indicator carries the rest.

### Insurance slip prompt (auto/home post-upload)

**Before:** "Do you have an existing insurance slip you'd like to send?"
**After:** "got any existing insurance slips? can send them too or skip"

### Merge prompt

**Before:** "This looks like it goes with [existing policy]. Want me to merge them?"
**After:** "this looks like the same policy as [carrier] — want me to merge them or keep separate?"

### Email confirmation

**Before:** "I'll send [details] to [recipient]. Reply 'send' to confirm, or cancel."
**After:** "good to send?" / "reply send or cancel whenever"

### `nudgeForPolicy` (text while awaiting_policy)

**Before:** Generic re-prompt for PDF/photo
**After:** Variant-aware:
- Retry intent detected → "all good, try again whenever"
- "can't find it" detected → "all good, send it over when you find it"
- Otherwise → "send the pdf or photo whenever you have it"

### Q&A agentic system prompt

Voice codex prepended. Existing tool definitions unchanged.

### Utility commands (`/debug`, `/logs`, `/autosend`)

Strip caps to match voice. Keep utility format (lists, key-value).

---

## Anna's rewritten conversation (reference)

> user: Hey Spot, what insurance can I get with you
>
> *(Read receipt fires. Typing dots appear. Classifier returns `capability_question`, routes to no-policy chat.)*
>
> spot: hey!
> spot: you can't actually "get" insurance with me
> spot: i just read policies you already have — or help you think through what you might need
> spot: what do you do?
>
> user: I don't have any yet. I am new to the US
>
> spot: oh welcome
> spot: where'd you move from?
>
> user: Austria, just got here last month for a new gig
>
> spot: nice, what's the gig?
>
> user: ceo of a healthtech company, we just raised
>
> spot: oh wow congrats
> spot: ok so a few things probably worth thinking about — renters for wherever you're living, and if the company doesn't already have D&O and E&O in place that's usually the first call once a round closes
> spot: are you renting or did you buy somewhere?
>
> user: renting a place in SF
>
> spot: got it — renters there is pretty much table stakes, most landlords require it anyway
> spot: usually $20-30/mo, covers your stuff and liability if something happens in the unit
> spot: when you pull a quote or have any of this stuff in place, send me the pdf and i'll go through it with you

LLM emits `shouldExit: true` on her sign-off. `noPolicyContext` saved as something like "Austrian, moved to SF last month, CEO of healthtech, just raised, renting, needs renters + future D&O/E&O conversation."

---

## Code touchpoints

### New files

**`convex/intent.ts`**
- `classifyFirstMessage(text)` — Haiku call, 3s timeout, returns `{ intent, extracted }`
- Defaults to `unclear` on any failure

**`convex/noPolicyChat.ts`**
- `handleNoPolicyChat(ctx, userId, input)` — Sonnet with structured output
- Loads `noPolicyContext` + last 10 messages
- 8s timeout with hardcoded fallback
- Transitions state to `"active"` on `shouldExit: true`, persists `noPolicyContext`

### Modified files

**`convex/schema.ts`** — add (all optional, additive):
```ts
noPolicyContext: v.optional(v.string()),
categoryAttempts: v.optional(v.number()),
hasClassifiedFirstMessage: v.optional(v.boolean()),
messageBufferFirstAt: v.optional(v.number()),
messageBuffer: v.optional(v.array(v.string())),
```

Add `"no_policy_chat"` to the allowed `state` values.

**`convex/sendHelpers.ts`**
- `acknowledgeInbound(ctx, user)` — Linq-only `markRead` + 150-400ms pause + `startTyping`. Swallows errors.
- `sendBurst` — new delay formula `clamp(300 + text.length * 8, 400, 1200) + jitter(±100ms)`
- `debounceInbound(ctx, userId, text)` — 2s collection window, returns concatenated buffer when window closes
- Consecutive-duplicate guard in `sendAndLog` — compare against last outbound, append a trivial suffix if identical

**`convex/process.ts`** — largest surface:
- `ingestMessage` / `ingestLinqMessage` — call `acknowledgeInbound` + `debounceInbound` at top of handler chain
- First-message branch — if `!user.hasClassifiedFirstMessage`, route through `intent.classifyFirstMessage` and dispatch by intent
- `handleCategorySelection` — add keyword scan for no-policy phrases in fallback, track `categoryAttempts`, route to LLM clarifier after attempt 2
- All hardcoded copy rewrites per above
- Voice codex prepended to agentic Q&A system prompt

**`convex/linq.ts`**
- Webhook calls `acknowledgeInbound` (fire-and-forget) before scheduler dispatch

**`convex/openphone.ts` / `convex/imessageBridge.ts`**
- Route through `debounceInbound` for rate-limit parity
- Skip `acknowledgeInbound`

**`convex/models.ts`**
- Confirm Haiku task config is registered for `"intent_classification"`; add if not

---

## Observability

Structured `console.log` at every decision point in `process.ts`:

```ts
console.log("[spot:intent]", { userId, intent, extracted });
console.log("[spot:state_transition]", { userId, from, to });
console.log("[spot:llm_fallback]", { userId, reason });
console.log("[spot:debounce]", { userId, bufferedCount });
console.log("[spot:no_policy_exit]", { userId, context });
console.log("[spot:duplicate_guard]", { userId, body });
```

Convex log stream is the dashboard. Post-event, full replay is possible by filtering logs per user.

---

## Reliability safeguards (event-day)

- All external calls have hard timeouts with fallbacks (Haiku 3s, Sonnet 8s, Linq `markRead`/`startTyping` swallowed)
- LLM structured output parse failure → raw text as single bubble rather than error
- Rate limit debounce (2s window per user) prevents reply races on rapid-fire inbound
- Consecutive-duplicate guard in `sendAndLog` ensures no identical back-to-back messages, ever
- Additive schema migration — no existing field changes, safe on prod

---

## Order of implementation

1. Schema migration (`schema.ts`) — additive, safe
2. Helpers (`sendHelpers.ts`) — dormant until called
3. Classifier (`intent.ts`) — isolated, testable
4. No-policy chat (`noPolicyChat.ts`) — isolated, testable
5. Wire-up (`process.ts`, `linq.ts`, `openphone.ts`, `imessageBridge.ts`)
6. Copy rewrites (bulk pass in `process.ts`)
7. Deploy to dev (`kindhearted-labrador-258`) — smoke test every intent branch
8. Deploy to prod (`cheery-giraffe-339`) — GitHub Action on push to main
9. 30-60 min real-phone soak with 3+ devices before event doors open

---

## Test matrix (soak-test checklist)

Every branch must be exercised on a real phone before go-live:

- [ ] Greeting → short welcome → category → upload → post-extraction summary → Q&A
- [ ] Capability question → no-policy chat → discovery → warm exit
- [ ] "I have a renters policy" first message → skip to upload, category pre-filled
- [ ] "I don't have insurance" first message → no-policy chat
- [ ] "who is this" first message → deflect
- [ ] Unclear first message ("asdf") → defaults to capability path
- [ ] Rapid-fire inbound (3 messages in 1s) → debounced into single turn
- [ ] Category attempt 1 unclear ("idk") → varied re-prompt
- [ ] Category attempt 2 unclear → LLM clarifier fires
- [ ] No-policy chat exits cleanly on "thanks" / sign-off
- [ ] Returning user (state already `active`) → existing flows untouched
- [ ] Linq read receipt + typing visible on iMessage test device
- [ ] OpenPhone path still works (no read receipt, but replies send)
- [ ] Consecutive-duplicate guard trips if Spot ever tries to repeat

---

## Open questions

None at spec time. All design decisions are locked with user.
