"use node";
/**
 * One-off backfill: re-extract all existing policies through the CL SDK v0.5.0
 * pipeline, store chunks, embed them, and extract contacts.
 *
 * Run via: npx convex run backfill:backfillAllPolicies
 */
import { action, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { sanitizeNulls } from "@claritylabs/cl-sdk";
import { chunkDocument } from "@claritylabs/cl-sdk";
import {
  getExtractor,
  documentToUpdateFields,
  extractContactsFromDocument,
  makeEmbedText,
} from "./sdkAdapter";
import { buildChunkSearchText } from "./retrievalUtils";

/** Backfill a single policy: re-extract, store chunks, embed, extract contacts. */
export const backfillPolicy = internalAction({
  args: {
    policyId: v.id("policies"),
    userId: v.id("users"),
    pdfStorageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    try {
      const blob = await ctx.storage.get(args.pdfStorageId);
      if (!blob) {
        console.warn(`[backfill] No PDF found for policy ${args.policyId}, skipping`);
        return;
      }

      const buffer = await blob.arrayBuffer();
      const pdfBase64 = Buffer.from(buffer).toString("base64");

      console.log(`[backfill] Extracting policy ${args.policyId}...`);
      const extractionResult = await getExtractor().extract(pdfBase64);
      const { document, chunks } = extractionResult;
      const applied = documentToUpdateFields(document, extractionResult);

      // Update policy with new InsuranceDocument format
      await ctx.runMutation(internal.policies.updateExtracted, {
        policyId: args.policyId,
        ...applied,
        status: "ready",
      });

      // Store chunks
      await ctx.runMutation(internal.documentChunks.saveChunks, {
        policyId: args.policyId,
        userId: args.userId,
        chunks: sanitizeNulls(chunks),
      });

      // Embed chunks
      const embed = makeEmbedText();
      for (const chunk of chunks) {
        try {
          const embedding = await embed(buildChunkSearchText(chunk));
          await ctx.runMutation(internal.documentChunks.updateEmbedding, {
            chunkId: chunk.id,
            embedding,
          });
        } catch (e) {
          console.warn(`[backfill] Embedding failed for chunk ${chunk.id}:`, e);
        }
      }

      // Extract contacts
      const contacts = extractContactsFromDocument(document);
      for (const c of contacts) {
        await ctx.runMutation(internal.contacts.upsert, {
          userId: args.userId,
          ...c,
        });
      }

      console.log(`[backfill] Done: policy ${args.policyId} — ${chunks.length} chunks, ${contacts.length} contacts`);
    } catch (e) {
      console.error(`[backfill] Failed for policy ${args.policyId}:`, e);
    }
  },
});

/** Backfill all policies. Schedules each one as a separate action to avoid timeouts. */
export const backfillAllPolicies = action({
  handler: async (ctx) => {
    const policies = await ctx.runQuery(internal.backfillHelpers.getAllPoliciesWithPdf);
    console.log(`[backfill] Found ${policies.length} policies to backfill`);

    for (let i = 0; i < policies.length; i++) {
      const p = policies[i];
      // Stagger by 2s each to avoid rate limits
      ctx.scheduler.runAfter(i * 2000, internal.backfill.backfillPolicy, {
        policyId: p._id,
        userId: p.userId,
        pdfStorageId: p.pdfStorageId,
      });
    }

    console.log(`[backfill] Scheduled ${policies.length} re-extractions`);
  },
});

/** Reindex all ready policies for a user using existing extracted data only. */
export const reindexAllPoliciesForUser = internalAction({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const policies = await ctx.runQuery(internal.policies.getByUser, { userId: args.userId });
    const readyPolicies = policies.filter((policy) => policy.status === "ready" && policy.rawExtracted);
    const embed = makeEmbedText();

    let processed = 0;
    let chunked = 0;

    for (const policy of readyPolicies) {
      const raw = policy.rawExtracted as Record<string, unknown>;
      const doc = sanitizeNulls({
        ...raw,
        documentId: raw.documentId || String(policy._id),
        type: raw.type || policy.documentType,
      });

      const chunks = chunkDocument(doc);
      await ctx.runMutation(internal.documentChunks.deleteByPolicy, { policyId: policy._id });
      await ctx.runMutation(internal.documentChunks.saveChunks, {
        policyId: policy._id,
        userId: args.userId,
        chunks: sanitizeNulls(chunks),
      });

      for (const chunk of chunks) {
        const embedding = await embed(buildChunkSearchText(chunk, policy.category));
        await ctx.runMutation(internal.documentChunks.updateEmbedding, {
          chunkId: chunk.id,
          embedding,
        });
      }

      processed += 1;
      chunked += chunks.length;
    }

    return { processed, chunked };
  },
});
