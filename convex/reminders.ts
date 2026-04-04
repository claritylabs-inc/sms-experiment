import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

export const createReminder = internalMutation({
  args: {
    userId: v.id("users"),
    policyId: v.id("policies"),
    daysBefore: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const daysBefore = args.daysBefore ?? 30;
    const policy = await ctx.db.get(args.policyId);
    if (!policy) throw new Error("Policy not found");
    if (!policy.expirationDate) throw new Error("Policy has no expiration date");

    // Parse expirationDate string — supports MM/DD/YYYY, YYYY-MM-DD, or natural language
    let expirationTs: number;
    const mmddyyyy = policy.expirationDate.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    const isoDate = policy.expirationDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);

    if (mmddyyyy) {
      const [, month, day, year] = mmddyyyy;
      expirationTs = new Date(
        parseInt(year),
        parseInt(month) - 1,
        parseInt(day)
      ).getTime();
    } else if (isoDate) {
      const [, year, month, day] = isoDate;
      expirationTs = new Date(
        parseInt(year),
        parseInt(month) - 1,
        parseInt(day)
      ).getTime();
    } else {
      // Try natural language / Date.parse fallback
      expirationTs = Date.parse(policy.expirationDate);
      if (isNaN(expirationTs)) {
        throw new Error(`Unable to parse expiration date: ${policy.expirationDate}`);
      }
    }

    const triggerDate = expirationTs - daysBefore * 24 * 60 * 60 * 1000;

    if (triggerDate <= Date.now()) {
      throw new Error("Policy expires too soon for a reminder");
    }

    return await ctx.db.insert("reminders", {
      userId: args.userId,
      policyId: args.policyId,
      triggerDate,
      daysBefore,
      status: "pending",
      createdAt: Date.now(),
    });
  },
});

export const cancelReminder = internalMutation({
  args: {
    reminderId: v.id("reminders"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.reminderId, { status: "cancelled" });
  },
});

export const getByUser = internalQuery({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const all = await ctx.db
      .query("reminders")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    return all.filter((r) => r.status !== "cancelled");
  },
});

export const markSent = internalMutation({
  args: {
    reminderId: v.id("reminders"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.reminderId, { status: "sent" });
  },
});

// Internal query to fetch pending reminders that are due
export const getPendingDueReminders = internalQuery({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    return await ctx.db
      .query("reminders")
      .withIndex("by_status_trigger", (q) =>
        q.eq("status", "pending").lte("triggerDate", now)
      )
      .collect();
  },
});

// checkAndSendReminders action is in reminderActions.ts ("use node" required)
