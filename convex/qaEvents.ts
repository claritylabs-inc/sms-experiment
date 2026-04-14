import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

export const log = internalMutation({
  args: {
    userId: v.id("users"),
    question: v.string(),
    normalizedQuery: v.string(),
    rewrittenQueries: v.array(v.string()),
    retrievedPolicyIds: v.array(v.id("policies")),
    retrievedChunkIds: v.array(v.string()),
    citedPolicyIds: v.optional(v.array(v.id("policies"))),
    citedSections: v.optional(v.array(v.string())),
    toolCalls: v.optional(v.array(v.string())),
    usedSmsPostProcess: v.boolean(),
    responseLength: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("qaEvents", {
      ...args,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const getLatestForUser = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("qaEvents")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .first();
  },
});

export const markFollowUp = internalMutation({
  args: {
    userId: v.id("users"),
    question: v.string(),
  },
  handler: async (ctx, args) => {
    const latest = await ctx.db
      .query("qaEvents")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .first();
    if (!latest) return;
    if (latest.hadFollowUp) return;
    if (Date.now() - latest.createdAt > 10 * 60 * 1000) return;
    if (latest.question.trim().toLowerCase() === args.question.trim().toLowerCase()) return;
    await ctx.db.patch(latest._id, {
      hadFollowUp: true,
      updatedAt: Date.now(),
    });
  },
});
