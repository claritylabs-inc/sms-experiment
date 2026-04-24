"use node";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { sendAndLog, sendBurst, sleep } from "./sendHelpers";

// ── Sandbox phone gate ──
// Only this number gets scripted responses. Everything else flows normally.
export const SANDBOX_PHONE = "+16479221805";

// ── Demo script ──
// Sequential: step N = Nth inbound message (0-indexed).
// Each step has an array of response messages sent as a burst,
// with an optional typing delay before the main content.
const SCRIPT: {
  responses: string[];
  typingDelay?: number; // ms to show typing indicator before responding
}[] = [
  // Step 0: First contact — any message
  {
    responses: [
      "Hey! This is Spot \u{1F44B}",
      "I'll read through your insurance policy and break down exactly what you're covered for. Send me the PDF right here — what type is it? Auto, renters, or something else?",
    ],
  },

  // Step 1: Category selection (e.g. "renters")
  {
    responses: [
      "Renters, got it. Send me the PDF right here and I'll go through it",
    ],
  },

  // Step 2: PDF upload (attachment)
  {
    typingDelay: 3000,
    responses: [
      "Got it — reading through your document now",
      "Square One Insurance \u00B7 Renters \u00B7 Policy #4528019-2\nJul 25, 2025 \u2192 Jul 25, 2026 \u00B7 $32.86/mo\n\n\u00B7 Personal Property \u2014 $15,000\n\u00B7 Additional Living Expenses \u2014 $20,000\n\u00B7 Personal Liability \u2014 $500,000\n\u00B7 Deductible \u2014 $500",
      "Ask me anything about your coverage",
    ],
  },

  // Step 3: Q&A — "Does my policy cover flood damage?"
  {
    responses: [
      "No. There's a specific exclusion on your policy \u2014 your building's location doesn't qualify for inland flood protection. Sewer backup caused by flood is also excluded.\n\nIf you want flood coverage you'd need a separate policy.",
    ],
  },

  // Step 4: Q&A — "What's my deductible?"
  {
    responses: [
      "$500 for all covered claims except liability, which has no deductible.",
    ],
  },

  // Step 5: Q&A — "What does my liability cover?"
  {
    responses: [
      "$500,000 for bodily injury or property damage you cause to others \u2014 at your place or elsewhere. No deductible.\n\nCovers things like someone slipping in your apartment, your dog biting someone, or accidentally damaging someone else's property.",
    ],
  },

  // Step 6: COI request — "Can you send a COI to my landlord?"
  {
    responses: [
      "Sure \u2014 what's their name and email?",
    ],
  },

  // Step 7: COI details — "John Smith, john@example.com"
  {
    responses: [
      "Sending a Certificate of Insurance for your Square One renters policy to John Smith (john@example.com). You'll be CC'd.\n\nGood to go?",
    ],
  },

  // Step 8: Confirm — "Yes"
  {
    responses: [
      "Sent! John should have it shortly.",
    ],
  },

  // Step 9: Reminder — "Can you remind me before my policy expires?"
  {
    responses: [
      "Done \u2014 I'll text you 30 days before Jul 25, 2026 so you have time to renew.",
    ],
  },

  // Step 10: Another Q&A — "What if someone breaks into my apartment?"
  {
    responses: [
      "Your personal property is covered up to $15,000 minus the $500 deductible. So if $5,000 worth of stuff is stolen, you'd get $4,500.\n\nYou're also covered for lock replacement and temporary living expenses if your place becomes unsafe.",
    ],
  },

  // Step 11: Wrap — "Thanks"
  {
    responses: [
      "Anytime. I'm here whenever you need to check your coverage, send proof of insurance, or anything else \u2014 just text me.",
    ],
  },
];

// Fallback for messages beyond the script
const FALLBACK_RESPONSE = "What else can I help you with?";

// ── Handler ──
export const handleSandboxMessage = internalAction({
  args: {
    userId: v.id("users"),
    linqChatId: v.string(),
    phone: v.string(),
  },
  handler: async (ctx, args) => {
    const { userId, linqChatId, phone } = args;

    // Count inbound messages to determine script step
    const messages = await ctx.runQuery(internal.messages.getByUser, { userId });
    const inboundCount = messages.filter((m: any) => m.direction === "inbound").length;
    // Current step is inboundCount - 1 because this message was already logged
    const step = inboundCount - 1;

    const entry = SCRIPT[step];

    if (!entry) {
      // Past the script — send fallback
      await sendAndLog(ctx, userId, phone, FALLBACK_RESPONSE, linqChatId);
      return;
    }

    // Optional typing delay (simulates extraction/processing)
    if (entry.typingDelay) {
      // Send first message immediately, then delay before the rest
      await sendAndLog(ctx, userId, phone, entry.responses[0], linqChatId);
      await ctx.runAction(internal.sendLinq.startTyping, { chatId: linqChatId });
      await sleep(entry.typingDelay);
      await ctx.runAction(internal.sendLinq.stopTyping, { chatId: linqChatId });
      // Send remaining messages as burst
      if (entry.responses.length > 1) {
        await sendBurst(ctx, userId, phone, entry.responses.slice(1), linqChatId);
      }
    } else {
      await sendBurst(ctx, userId, phone, entry.responses, linqChatId);
    }
  },
});
