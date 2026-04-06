import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

export const create = internalMutation({
  args: {
    userId: v.id("users"),
    alertType: v.string(),
    policyId: v.optional(v.id("policies")),
    relatedPolicyId: v.optional(v.id("policies")),
    summary: v.string(),
    metadata: v.optional(v.any()),
    status: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("proactiveAlerts", {
      ...args,
      createdAt: Date.now(),
    });
  },
});

export const getByUser = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("proactiveAlerts")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .collect();
  },
});

export const hasRecentAlert = internalQuery({
  args: {
    userId: v.id("users"),
    alertType: v.string(),
    withinMs: v.number(),
  },
  handler: async (ctx, args) => {
    const alerts = await ctx.db
      .query("proactiveAlerts")
      .withIndex("by_type_user", (q) => q.eq("alertType", args.alertType).eq("userId", args.userId))
      .order("desc")
      .take(1);
    if (alerts.length === 0) return false;
    return alerts[0].createdAt > Date.now() - args.withinMs;
  },
});
