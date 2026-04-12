import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

/** Add a conversation turn (used by MemoryStore.addTurn). */
export const add = internalMutation({
  args: {
    userId: v.id("users"),
    turnId: v.string(),
    conversationId: v.string(),
    role: v.string(),
    content: v.string(),
    toolName: v.optional(v.string()),
    toolResult: v.optional(v.string()),
    embedding: v.optional(v.array(v.float64())),
    timestamp: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("conversationTurns", {
      userId: args.userId,
      conversationId: args.conversationId,
      role: args.role,
      content: args.content,
      toolName: args.toolName,
      toolResult: args.toolResult,
      embedding: args.embedding,
      timestamp: args.timestamp,
    });
  },
});

/** Get conversation history by conversationId, most recent first. */
export const getHistory = internalQuery({
  args: {
    conversationId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const turns = await ctx.db
      .query("conversationTurns")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", args.conversationId)
      )
      .order("desc")
      .collect();
    const limited = args.limit ? turns.slice(0, args.limit) : turns;
    return limited.reverse(); // chronological order
  },
});

/** Get all turns for a user. */
export const getByUser = internalQuery({
  args: {
    userId: v.id("users"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const turns = await ctx.db
      .query("conversationTurns")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .collect();
    return args.limit ? turns.slice(0, args.limit) : turns;
  },
});
