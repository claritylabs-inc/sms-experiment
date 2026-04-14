"use node";

type ChunkMetadata = Record<string, unknown> | undefined;

export function normalizeQueryKey(query: string): string {
  return query.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

export function extractKeywordTerms(query: string): string[] {
  const normalized = normalizeQueryKey(query);
  const terms = normalized.split(" ").filter((term) => term.length > 2);
  return [...new Set(terms)];
}

function coerceString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function metadataString(metadata: ChunkMetadata, key: string): string | undefined {
  return coerceString(metadata?.[key]);
}

export function extractChunkSearchFields(
  chunk: {
    type: string;
    text: string;
    metadata?: ChunkMetadata;
  },
  policyCategory?: string,
) {
  const metadata = chunk.metadata;
  const title =
    metadataString(metadata, "title") ||
    metadataString(metadata, "name") ||
    metadataString(metadata, "sectionTitle");
  const formNumber =
    metadataString(metadata, "formNumber") ||
    metadataString(metadata, "endorsementNumber") ||
    metadataString(metadata, "number");
  const coverageType =
    metadataString(metadata, "coverageType") ||
    metadataString(metadata, "coverage") ||
    metadataString(metadata, "lineOfBusiness");
  const sectionPath =
    metadataString(metadata, "sectionPath") ||
    metadataString(metadata, "path") ||
    metadataString(metadata, "clause");

  return {
    variant: "focused",
    policyCategory,
    title,
    formNumber,
    coverageType,
    sectionPath,
  };
}

export function buildChunkSearchText(
  chunk: {
    type: string;
    text: string;
    metadata?: ChunkMetadata;
  },
  policyCategory?: string,
): string {
  const fields = extractChunkSearchFields(chunk, policyCategory);
  const prelude = [
    fields.policyCategory,
    chunk.type,
    fields.coverageType,
    fields.title,
    fields.formNumber,
    fields.sectionPath,
  ].filter(Boolean).join(" | ");

  const raw = chunk.text.trim();
  const compactRaw = raw.replace(/\s+/g, " ");
  const focusedRaw = compactRaw.length > 1200 ? compactRaw.slice(0, 1200) : compactRaw;
  return [prelude, focusedRaw].filter(Boolean).join("\n");
}

export function keywordScore(searchText: string, queries: string[]): number {
  const haystack = normalizeQueryKey(searchText);
  let score = 0;
  for (const query of queries) {
    const normalizedQuery = normalizeQueryKey(query);
    if (!normalizedQuery) continue;
    if (haystack.includes(normalizedQuery)) score += 8;
    for (const term of extractKeywordTerms(query)) {
      if (haystack.includes(term)) score += 2;
    }
  }
  return score;
}

export function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
