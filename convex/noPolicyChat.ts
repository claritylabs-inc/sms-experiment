"use node";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { createAnthropic } from "@ai-sdk/anthropic";
import { generateObject } from "ai";
import { z } from "zod";
import { sendBurst } from "./sendHelpers";

const NoPolicyResponseSchema = z.object({
  messages: z
    .array(z.string())
    .describe("1-5 short bubbles, each 1-2 sentences max — never more than 5 items"),
  updatedContext: z
    .string()
    .max(600)
    .describe("running summary of what you've learned about this person — preserved across turns"),
  shouldExit: z
    .boolean()
    .describe("true when conversation is done (user signed off, has a policy to upload, or 6+ turns with no progress)"),
});

const SYSTEM = `you're spot — a chill friend who happens to know insurance. someone is texting you and they either don't have a policy yet, asked what spot does, or got here by mistake.

your mission: learn who this person is and figure out where you can actually be useful in their life.
- most people text you because they have a policy to read
- some don't — they're new, early-stage, just curious, or nothing set up yet
- your job isn't to get rid of them. get to know them. make them feel heard.
- if they're early-stage / new to the country / haven't set things up — probe for personal policies they might already have (parents' auto, previous-country renters, etc.). cover the personal side before the business side.
- be the friend they text when they DO finally get a policy. that's the win.

voice:
- lowercase unless proper noun
- short bubbles, 1-2 sentences each
- acknowledge what they said before pivoting
- no "haha", "no worries", "great question", or assistant tics
- no emojis unless they use one first
- chill friend, not a chatbot

engagement (tennis not lecture):
- short volleys, fast back-and-forth
- one question per message max, don't stack
- end with something that invites a reply (question, observation, callback)
- never dump the full answer in one bubble

discovery:
- lead with curiosity about THEM not their coverage needs
- ask what they do, where they're at, what they're building
- coverage read surfaces from who they are, never opens with it

boundaries:
- you don't sell insurance or recommend specific carriers
- you don't give legal or financial advice
- you don't promise coverage amounts or prices

exit conditions (set shouldExit: true):
- they mention having a policy or quote → "drop it in here and i'll read it"
- they sign off / say thanks / conversation drifts → warm wrap
- 6+ exchanges with no progress → warm wrap

output: 1-5 short bubbles per turn, updatedContext preserved for next turn, shouldExit when done.`;

export const handleNoPolicyChat = internalAction({
  args: {
    userId: v.id("users"),
    phone: v.string(),
    input: v.string(),
    linqChatId: v.optional(v.string()),
    imessageSender: v.optional(v.string()),
    seedContext: v.optional(v.string()), // for first turn coming from capability_question
  },
  handler: async (ctx, args) => {
    // Load user + recent messages + existing context
    const user: any = await ctx.runQuery(internal.users.getUser, {
      userId: args.userId,
    });
    const recentMessages: any[] = await ctx.runQuery(
      internal.messages.getRecent,
      { userId: args.userId, limit: 10 }
    );

    const priorContext = user?.noPolicyContext || args.seedContext || "";
    const history = recentMessages
      .map((m: any) => `${m.direction === "inbound" ? "user" : "spot"}: ${m.body}`)
      .join("\n");

    const prompt = `${priorContext ? `context so far: ${priorContext}\n\n` : ""}recent exchange:\n${history}\n\nuser just said: ${args.input}\n\nyour turn.`;

    const anthropic = createAnthropic();
    const model = anthropic("claude-sonnet-4-6");

    let result: { messages: string[]; updatedContext: string; shouldExit: boolean };
    try {
      const llmResult = await Promise.race([
        generateObject({
          model,
          schema: NoPolicyResponseSchema,
          system: SYSTEM,
          prompt,
          temperature: 0.7,
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("no-policy chat timeout")), 8000)
        ),
      ]);
      result = llmResult.object;
    } catch (err) {
      console.warn("[spot:no_policy_chat_failed]", { userId: args.userId, err: String(err) });
      result = {
        messages: ["hmm one sec — something went weird on my end", "what's going on?"],
        updatedContext: priorContext,
        shouldExit: false,
      };
    }

    // Send bubbles
    await sendBurst(
      ctx,
      args.userId,
      args.phone,
      result.messages,
      args.linqChatId,
      args.imessageSender
    );

    // Persist context
    await ctx.runMutation(internal.users.setNoPolicyContext, {
      userId: args.userId,
      context: result.updatedContext,
    });

    // Transition state if done
    if (result.shouldExit) {
      await ctx.runMutation(internal.users.updateState, {
        userId: args.userId,
        state: "active",
      });
      console.log("[spot:no_policy_exit]", {
        userId: args.userId,
        context: result.updatedContext,
      });
    }
  },
});
