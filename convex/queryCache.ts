import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

export const get = internalQuery({
  args: {
    userId: v.id("users"),
    queryKey: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("queryCache")
      .withIndex("by_user_query", (q) => q.eq("userId", args.userId).eq("queryKey", args.queryKey))
      .first();
  },
});

export const upsert = internalMutation({
  args: {
    userId: v.id("users"),
    queryKey: v.string(),
    normalizedQuery: v.string(),
    rewrittenQueries: v.array(v.string()),
    embedding: v.optional(v.array(v.float64())),
    retrievalPolicyIds: v.optional(v.array(v.id("policies"))),
    retrievalChunkIds: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("queryCache")
      .withIndex("by_user_query", (q) => q.eq("userId", args.userId).eq("queryKey", args.queryKey))
      .first();

    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        normalizedQuery: args.normalizedQuery,
        rewrittenQueries: args.rewrittenQueries,
        embedding: args.embedding ?? existing.embedding,
        retrievalPolicyIds: args.retrievalPolicyIds ?? existing.retrievalPolicyIds,
        retrievalChunkIds: args.retrievalChunkIds ?? existing.retrievalChunkIds,
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("queryCache", {
      ...args,
      createdAt: now,
      updatedAt: now,
    });
  },
});
