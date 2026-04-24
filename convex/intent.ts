"use node";
import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { createAnthropic } from "@ai-sdk/anthropic";
import { generateObject } from "ai";
import { z } from "zod";

export type Intent =
  | "greeting"
  | "capability_question"
  | "has_policy"
  | "no_policy_yet"
  | "wrong_number"
  | "unclear";

const IntentSchema = z.object({
  intent: z.enum([
    "greeting",
    "capability_question",
    "has_policy",
    "no_policy_yet",
    "wrong_number",
    "unclear",
  ]),
  extractedCategory: z
    .enum(["auto", "renters", "homeowners", "other"])
    .nullable()
    .describe("if user mentioned a specific policy category, extract it"),
  noteForContext: z
    .string()
    .max(200)
    .describe("one-line summary of what the user said, for downstream context"),
});

const SYSTEM = `you classify the first message someone sends to spot, an insurance-policy reader.

intents:
- greeting: just a hello, no content ("hey", "hi", "yo", "sup")
- capability_question: asking what spot does or what insurance they can get ("what is this", "what can you do", "what insurance can i get with you")
- has_policy: they have a policy to upload or mentioned a specific policy ("need to upload my renters", "here's my auto policy", "i've got my homeowners")
- no_policy_yet: they don't have insurance yet or are new / shopping / looking ("i don't have any", "new to the us", "just looking", "shopping for coverage")
- wrong_number: they don't know who you are in a hostile way ("who is this", "stop texting me", "remove me")
- unclear: anything else, including off-topic or ambiguous

if has_policy and they named a category (auto/renters/homeowners), set extractedCategory.
noteForContext: a single short line capturing the essence of what they said, useful for downstream handlers.`;

export const classifyFirstMessage = internalAction({
  args: { text: v.string() },
  handler: async (_ctx, args): Promise<{ intent: Intent; extractedCategory: string | null; noteForContext: string }> => {
    const anthropic = createAnthropic();
    const model = anthropic("claude-haiku-4-5-20251001");

    try {
      const result = await Promise.race([
        generateObject({
          model,
          schema: IntentSchema,
          system: SYSTEM,
          prompt: args.text,
          temperature: 0,
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("classifier timeout")), 3000)
        ),
      ]);

      return {
        intent: result.object.intent,
        extractedCategory: result.object.extractedCategory,
        noteForContext: result.object.noteForContext,
      };
    } catch (err) {
      console.warn("[spot:intent_classifier_failed]", { text: args.text.slice(0, 80), err: String(err) });
      return {
        intent: "unclear",
        extractedCategory: null,
        noteForContext: args.text.slice(0, 200),
      };
    }
  },
});
