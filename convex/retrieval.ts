/* eslint-disable @typescript-eslint/no-unsafe-function-type */
"use node";

import { z } from "zod";
import { internal } from "./_generated/api";
import { generateObjectWithFallback, getModel } from "./models";
import { makeEmbedText } from "./sdkAdapter";
import {
  extractKeywordTerms,
  keywordScore,
  normalizeQueryKey,
  uniqueStrings,
} from "./retrievalUtils";

type ReadyPolicy = {
  _id: string;
  carrier?: string;
  category?: string;
  policyNumber?: string;
  rawExtracted?: Record<string, unknown> | null;
};

type RetrievedChunk = {
  policyId: string;
  chunkId: string;
  type: string;
  text: string;
  title?: string;
  formNumber?: string;
  coverageType?: string;
  sectionPath?: string;
  searchText: string;
  combinedScore: number;
};

type VectorFilterBuilder = {
  and: (...clauses: unknown[]) => unknown;
  eq: (field: unknown, value: unknown) => unknown;
  field: (name: string) => unknown;
};

function extractFormNumbers(query: string): string[] {
  return query.match(/\b[A-Z]{1,5}\d{2,}[A-Z0-9-]*\b/gi) ?? [];
}

function queryKeywords(query: string): string[] {
  return uniqueStrings([...extractKeywordTerms(query), ...extractFormNumbers(query)]);
}

async function buildRewrittenQueries(
  question: string,
): Promise<string[]> {
  const keywords = queryKeywords(question);
  try {
    const result = await generateObjectWithFallback({
      model: getModel("qa_simple"),
      schema: z.object({
        rewrites: z.array(z.string()).max(6),
      }),
      system:
        "Rewrite an insurance coverage question into short retrieval queries. Focus on endorsement numbers, exclusions, conditions, coverage names, and likely alternate phrasings. Return compact search strings only.",
      prompt: `Question: ${question}\nKnown key terms: ${keywords.join(", ") || "none"}`,
      maxOutputTokens: 200,
    });
    return uniqueStrings([question, ...keywords, ...(result.object?.rewrites ?? [])]).slice(0, 6);
  } catch {
    return uniqueStrings([question, ...keywords]).slice(0, 6);
  }
}

export async function retrievePolicyContext(
  ctx: { vectorSearch: Function; runQuery: Function; runMutation: Function },
  userId: string,
  readyPolicies: ReadyPolicy[],
  question: string,
): Promise<{
  context: string;
  normalizedQuery: string;
  rewrittenQueries: string[];
  retrievedPolicyIds: string[];
  retrievedChunkIds: string[];
}> {
  const normalizedQuery = normalizeQueryKey(question);
  const queryKey = normalizedQuery;
  const policyMap = new Map(readyPolicies.map((policy) => [String(policy._id), policy]));
  if (policyMap.size === 0) {
    return {
      context: "",
      normalizedQuery,
      rewrittenQueries: [question],
      retrievedPolicyIds: [],
      retrievedChunkIds: [],
    };
  }

  const cached = await ctx.runQuery(internal.queryCache.get, {
    userId,
    queryKey,
  });

  if (
    cached?.retrievalChunkIds?.length &&
    Date.now() - cached.updatedAt < 5 * 60 * 1000
  ) {
    const cachedChunks = await ctx.runQuery(internal.documentChunks.getByChunkIds, {
      chunkIds: cached.retrievalChunkIds,
    });
    const hydrated = cachedChunks
      .filter((chunk: Record<string, unknown>) => policyMap.has(String(chunk.policyId)))
      .map((chunk: Record<string, unknown>) => ({
        policyId: String(chunk.policyId),
        chunkId: String(chunk.chunkId),
        type: String(chunk.type),
        text: String(chunk.text),
        title: typeof chunk.title === "string" ? chunk.title : undefined,
        formNumber: typeof chunk.formNumber === "string" ? chunk.formNumber : undefined,
        coverageType: typeof chunk.coverageType === "string" ? chunk.coverageType : undefined,
        sectionPath: typeof chunk.sectionPath === "string" ? chunk.sectionPath : undefined,
        searchText: String(chunk.searchText || chunk.text),
        combinedScore: 1,
      }));
    if (hydrated.length > 0) {
      const chunksByPolicy = new Map<string, RetrievedChunk[]>();
      for (const chunk of hydrated) {
        if (!chunksByPolicy.has(chunk.policyId)) chunksByPolicy.set(chunk.policyId, []);
        chunksByPolicy.get(chunk.policyId)!.push(chunk);
      }
      const sections: string[] = [];
      for (const [policyId, chunks] of chunksByPolicy) {
        const policy = policyMap.get(policyId);
        if (!policy) continue;
        const heading = [
          `POLICY: ${policy.carrier || policy.category || "Insurance"}`,
          policy.policyNumber ? `#${policy.policyNumber}` : null,
          `(ID:${policyId})`,
        ].filter(Boolean).join(" ");
        let section = `\n--- ${heading} ---`;
        for (const chunk of chunks) {
          const label = [chunk.type, chunk.coverageType, chunk.title, chunk.formNumber].filter(Boolean).join(" | ");
          section += `\n\n[${label || chunk.type}]\n${chunk.text.slice(0, 1800)}`;
        }
        sections.push(section);
      }
      return {
        context: `\n\nRELEVANT POLICY TEXT (cached hybrid retrieval):\n${sections.join("\n")}`,
        normalizedQuery,
        rewrittenQueries: cached.rewrittenQueries,
        retrievedPolicyIds: (cached.retrievalPolicyIds ?? []).map(String),
        retrievedChunkIds: cached.retrievalChunkIds.map(String),
      };
    }
  }

  const rewrittenQueries = cached?.rewrittenQueries?.length
    ? cached.rewrittenQueries
    : await buildRewrittenQueries(question);

  const embed = makeEmbedText();
  const primaryEmbedding = cached?.embedding ?? await embed(rewrittenQueries[0] || question);

  const vectorResults = await ctx.vectorSearch("documentChunks", "by_embedding", {
    vector: primaryEmbedding,
    limit: 24,
    filter: (q: VectorFilterBuilder) =>
      q.and(
        q.eq(q.field("userId"), userId),
        q.eq(q.field("hasEmbedding"), true),
      ),
  });

  const chunkScores = new Map<string, RetrievedChunk>();
  for (const result of vectorResults) {
    const chunk = await ctx.runQuery(internal.documentChunks.get, { id: result._id });
    if (!chunk || !policyMap.has(String(chunk.policyId))) continue;
    const chunkId = String(chunk.chunkId);
    const keyword = keywordScore(chunk.searchText || chunk.text, rewrittenQueries);
    const combinedScore = Number(result._score || 0) * 10 + keyword;
    const prev = chunkScores.get(chunkId);
    if (prev && prev.combinedScore >= combinedScore) continue;
    chunkScores.set(chunkId, {
      policyId: String(chunk.policyId),
      chunkId,
      type: String(chunk.type),
      text: String(chunk.text),
      title: typeof chunk.title === "string" ? chunk.title : undefined,
      formNumber: typeof chunk.formNumber === "string" ? chunk.formNumber : undefined,
      coverageType: typeof chunk.coverageType === "string" ? chunk.coverageType : undefined,
      sectionPath: typeof chunk.sectionPath === "string" ? chunk.sectionPath : undefined,
      searchText: String(chunk.searchText || chunk.text),
      combinedScore,
    });
  }

  for (const query of rewrittenQueries) {
    const textMatches = await ctx.runQuery(internal.documentChunks.searchByText, {
      userId,
      query,
    });
    for (const chunk of textMatches) {
      if (!policyMap.has(String(chunk.policyId))) continue;
      const chunkId = String(chunk.chunkId);
      const score = keywordScore(chunk.searchText || chunk.text, rewrittenQueries) + 20;
      const prev = chunkScores.get(chunkId);
      if (prev && prev.combinedScore >= score) continue;
      chunkScores.set(chunkId, {
        policyId: String(chunk.policyId),
        chunkId,
        type: String(chunk.type),
        text: String(chunk.text),
        title: typeof chunk.title === "string" ? chunk.title : undefined,
        formNumber: typeof chunk.formNumber === "string" ? chunk.formNumber : undefined,
        coverageType: typeof chunk.coverageType === "string" ? chunk.coverageType : undefined,
        sectionPath: typeof chunk.sectionPath === "string" ? chunk.sectionPath : undefined,
        searchText: String(chunk.searchText || chunk.text),
        combinedScore: score,
      });
    }
  }

  const policyScores = new Map<string, number>();
  for (const chunk of chunkScores.values()) {
    const policy = policyMap.get(chunk.policyId);
    if (!policy) continue;
    const current = policyScores.get(chunk.policyId) ?? 0;
    const policyText = [
      policy.carrier,
      policy.policyNumber,
      policy.category,
      policy.rawExtracted?.policyTypes,
    ].filter(Boolean).join(" ");
    const score = current + chunk.combinedScore + keywordScore(policyText, rewrittenQueries);
    policyScores.set(chunk.policyId, score);
  }

  const topPolicies = [...policyScores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([policyId]) => policyId);

  const topPolicySet = new Set(topPolicies);
  const rankedChunks = [...chunkScores.values()]
    .filter((chunk) => topPolicySet.has(chunk.policyId))
    .sort((a, b) => b.combinedScore - a.combinedScore)
    .slice(0, 8);

  const chunksByPolicy = new Map<string, RetrievedChunk[]>();
  for (const chunk of rankedChunks) {
    if (!chunksByPolicy.has(chunk.policyId)) chunksByPolicy.set(chunk.policyId, []);
    chunksByPolicy.get(chunk.policyId)!.push(chunk);
  }

  const sections: string[] = [];
  for (const [policyId, chunks] of chunksByPolicy) {
    const policy = policyMap.get(policyId);
    if (!policy) continue;
    const heading = [
      `POLICY: ${policy.carrier || policy.category || "Insurance"}`,
      policy.policyNumber ? `#${policy.policyNumber}` : null,
      `(ID:${policyId})`,
    ].filter(Boolean).join(" ");
    let section = `\n--- ${heading} ---`;
    for (const chunk of chunks) {
      const label = [
        chunk.type,
        chunk.coverageType,
        chunk.title,
        chunk.formNumber,
      ].filter(Boolean).join(" | ");
      const excerpt = chunk.text.length > 1800 ? `${chunk.text.slice(0, 1800)}\n... [truncated]` : chunk.text;
      section += `\n\n[${label || chunk.type}]\n${excerpt}`;
    }
    sections.push(section);
  }

  await ctx.runMutation(internal.queryCache.upsert, {
    userId,
    queryKey,
    normalizedQuery,
    rewrittenQueries,
    embedding: primaryEmbedding,
    retrievalPolicyIds: topPolicies as never,
    retrievalChunkIds: rankedChunks.map((chunk) => chunk.chunkId),
  });

  return {
    context: sections.length > 0
      ? `\n\nRELEVANT POLICY TEXT (hybrid semantic + keyword retrieval):\n${sections.join("\n")}`
      : "",
    normalizedQuery,
    rewrittenQueries,
    retrievedPolicyIds: topPolicies,
    retrievedChunkIds: rankedChunks.map((chunk) => chunk.chunkId),
  };
}

export async function compressSmsReply(replyText: string): Promise<string> {
  if (replyText.length < 320) return replyText;
  try {
    const result = await generateObjectWithFallback({
      model: getModel("qa_simple"),
      schema: z.object({
        text: z.string(),
      }),
      system:
        "Rewrite the assistant reply for plain SMS. Keep the answer accurate, brief, and direct. Remove filler. Keep key coverage caveats and quoted form numbers if they matter.",
      prompt: replyText,
      maxOutputTokens: 180,
    });
    return result.object?.text?.trim() || replyText;
  } catch {
    return replyText;
  }
}
