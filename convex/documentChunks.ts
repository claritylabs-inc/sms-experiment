import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

/** Save extraction chunks for a policy. Deletes existing chunks first. */
export const saveChunks = internalMutation({
  args: {
    policyId: v.id("policies"),
    userId: v.id("users"),
    chunks: v.array(
      v.object({
        id: v.string(),
        documentId: v.string(),
        type: v.string(),
        text: v.string(),
        metadata: v.optional(v.any()),
      })
    ),
  },
  handler: async (ctx, args) => {
    // Delete existing chunks for this policy
    const existing = await ctx.db
      .query("documentChunks")
      .withIndex("by_policy", (q) => q.eq("policyId", args.policyId))
      .collect();
    for (const chunk of existing) {
      await ctx.db.delete(chunk._id);
    }

    // Insert new chunks (without embeddings — those get added later by embedChunks action)
    const now = Date.now();
    for (const chunk of args.chunks) {
      await ctx.db.insert("documentChunks", {
        policyId: args.policyId,
        userId: args.userId,
        chunkId: chunk.id,
        documentId: chunk.documentId,
        type: chunk.type,
        text: chunk.text,
        metadata: chunk.metadata,
        createdAt: now,
      });
    }
  },
});

/** Save a single chunk with its embedding. Used by MemoryStore.addChunks. */
export const saveChunkWithEmbedding = internalMutation({
  args: {
    policyId: v.optional(v.id("policies")),
    userId: v.id("users"),
    chunkId: v.string(),
    documentId: v.string(),
    type: v.string(),
    text: v.string(),
    metadata: v.optional(v.any()),
    embedding: v.optional(v.array(v.float64())),
  },
  handler: async (ctx, args) => {
    // Upsert by chunkId — delete existing if found
    const existing = await ctx.db
      .query("documentChunks")
      .withIndex("by_chunk_id", (q) => q.eq("chunkId", args.chunkId))
      .first();
    if (existing) {
      await ctx.db.delete(existing._id);
    }

    await ctx.db.insert("documentChunks", {
      policyId: args.policyId as any,
      userId: args.userId,
      chunkId: args.chunkId,
      documentId: args.documentId,
      type: args.type,
      text: args.text,
      metadata: args.metadata,
      embedding: args.embedding,
      createdAt: Date.now(),
    });
  },
});

/** Update a chunk's embedding. */
export const updateEmbedding = internalMutation({
  args: {
    chunkId: v.string(),
    embedding: v.array(v.float64()),
  },
  handler: async (ctx, args) => {
    const chunk = await ctx.db
      .query("documentChunks")
      .withIndex("by_chunk_id", (q) => q.eq("chunkId", args.chunkId))
      .first();
    if (chunk) {
      await ctx.db.patch(chunk._id, { embedding: args.embedding });
    }
  },
});

/** Get all chunks for a specific policy. */
export const getByPolicy = internalQuery({
  args: { policyId: v.id("policies") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("documentChunks")
      .withIndex("by_policy", (q) => q.eq("policyId", args.policyId))
      .collect();
  },
});

/** Get all chunks for a user across all policies. */
export const getByUser = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("documentChunks")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
  },
});

/** Get chunks for a user filtered by type. */
export const getByUserAndType = internalQuery({
  args: {
    userId: v.id("users"),
    type: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("documentChunks")
      .withIndex("by_user_type", (q) =>
        q.eq("userId", args.userId).eq("type", args.type)
      )
      .collect();
  },
});

/** Delete all chunks for a policy (used when re-extracting or deleting a policy). */
export const deleteByPolicy = internalMutation({
  args: { policyId: v.id("policies") },
  handler: async (ctx, args) => {
    const chunks = await ctx.db
      .query("documentChunks")
      .withIndex("by_policy", (q) => q.eq("policyId", args.policyId))
      .collect();
    for (const chunk of chunks) {
      await ctx.db.delete(chunk._id);
    }
  },
});

/** Simple text search across chunks for a user (placeholder for vector search). */
export const searchByText = internalQuery({
  args: {
    userId: v.id("users"),
    query: v.string(),
    type: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let chunks;
    if (args.type) {
      chunks = await ctx.db
        .query("documentChunks")
        .withIndex("by_user_type", (q) =>
          q.eq("userId", args.userId).eq("type", args.type!)
        )
        .collect();
    } else {
      chunks = await ctx.db
        .query("documentChunks")
        .withIndex("by_user", (q) => q.eq("userId", args.userId))
        .collect();
    }

    const queryLower = args.query.toLowerCase();
    return chunks
      .filter((c: any) => c.text.toLowerCase().includes(queryLower))
      .slice(0, 20);
  },
});
