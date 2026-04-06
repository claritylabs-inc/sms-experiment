import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

export const addMemory = internalMutation({
  args: {
    userId: v.id("users"),
    type: v.string(),
    content: v.string(),
    source: v.string(),
    policyId: v.optional(v.id("policies")),
    expiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    // Check for duplicate content to avoid redundant entries
    const existing = await ctx.db
      .query("userMemory")
      .withIndex("by_user_type", (q) => q.eq("userId", args.userId).eq("type", args.type))
      .collect();
    const duplicate = existing.find((m) => m.content === args.content);
    if (duplicate) {
      // Update timestamp instead of creating duplicate
      await ctx.db.patch(duplicate._id, { updatedAt: now });
      return duplicate._id;
    }
    return await ctx.db.insert("userMemory", {
      ...args,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const getForUser = internalQuery({
  args: {
    userId: v.id("users"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const memories = await ctx.db
      .query("userMemory")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    // Filter out expired memories
    const now = Date.now();
    const active = memories.filter((m) => !m.expiresAt || m.expiresAt > now);
    // Sort by updatedAt descending, take limit
    active.sort((a, b) => b.updatedAt - a.updatedAt);
    return active.slice(0, args.limit || 30);
  },
});

export const getByType = internalQuery({
  args: {
    userId: v.id("users"),
    type: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("userMemory")
      .withIndex("by_user_type", (q) => q.eq("userId", args.userId).eq("type", args.type))
      .collect();
  },
});

export const clearExpired = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    // Scan all memories with expiresAt set
    const all = await ctx.db.query("userMemory").collect();
    let cleaned = 0;
    for (const m of all) {
      if (m.expiresAt && m.expiresAt <= now) {
        await ctx.db.delete(m._id);
        cleaned++;
      }
    }
    return cleaned;
  },
});

/**
 * Format user memories into a context block for Claude prompts.
 * Groups by type and formats as a readable block.
 */
export function buildMemoryContext(memories: Array<{
  type: string;
  content: string;
  source: string;
  updatedAt: number;
}>): string {
  if (!memories || memories.length === 0) return "";

  const grouped: Record<string, string[]> = {};
  for (const m of memories) {
    const key = m.type;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(m.content);
  }

  const sections: string[] = [];
  const typeLabels: Record<string, string> = {
    fact: "What we know",
    preference: "Preferences",
    risk_note: "Risk observations",
    event: "Life events",
    interaction: "Past interactions",
  };

  for (const [type, items] of Object.entries(grouped)) {
    const label = typeLabels[type] || type;
    sections.push(`${label}:\n${items.map((i) => `- ${i}`).join("\n")}`);
  }

  return `\n\nWHAT SPOT KNOWS ABOUT THIS PERSON:\n${sections.join("\n\n")}`;
}
