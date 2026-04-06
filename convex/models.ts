"use node";

import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";

/**
 * Centralized model configuration for Spot.
 *
 * Maps each task type to a provider + model. Tune costs and quality from one place.
 * All models are accessed via Vercel AI SDK's provider-agnostic interface —
 * generateText/tool calls work identically regardless of provider.
 *
 * Env vars needed:
 *   ANTHROPIC_API_KEY — Claude models
 *   OPENAI_API_KEY — GPT models (optional, falls back to Anthropic)
 *   GOOGLE_GENERATIVE_AI_API_KEY — Gemini models (optional, falls back to Anthropic)
 */

// Provider factories (lazy — only created when first used)
let _anthropic: ReturnType<typeof createAnthropic> | null = null;
let _openai: ReturnType<typeof createOpenAI> | null = null;
let _google: ReturnType<typeof createGoogleGenerativeAI> | null = null;

function anthropic() {
  if (!_anthropic) _anthropic = createAnthropic();
  return _anthropic;
}

function openai() {
  if (!_openai) _openai = createOpenAI();
  return _openai;
}

function google() {
  if (!_google) _google = createGoogleGenerativeAI();
  return _google;
}

/**
 * Task types used throughout the codebase.
 * Each maps to a specific model optimized for cost/quality tradeoff.
 */
export type ModelTask =
  | "qa"                  // Agentic Q&A with tool use (handleQuestion)
  | "qa_simple"           // Simple Q&A without tools
  | "image_classify"      // Image intent classification (document vs question)
  | "email_generate"      // AI-written email body
  | "email_reply"         // Inbound email reply handling
  | "health_check"        // Post-upload policy analysis
  | "portfolio_analysis"  // Multi-policy portfolio analysis
  | "renewal_comparison"  // Old vs new policy comparison
  | "extraction_classify" // Document type classification (policy vs quote)
  ;

/**
 * Model configuration — change these to swap providers/models per task.
 *
 * Cost tiers (approximate $/1M tokens, input/output):
 *   Claude Haiku:     $0.80 / $4      (fast, cheap)
 *   GPT-4o-mini:      $0.15 / $0.60   (very cheap)
 *   Gemini Flash:     $0.075 / $0.30  (cheapest)
 *   Claude Sonnet:    $3 / $15        (best reasoning)
 *   GPT-4o:           $2.50 / $10     (strong all-rounder)
 *   Gemini Pro:       $1.25 / $5      (good value)
 */
const MODEL_CONFIG: Record<ModelTask, () => ReturnType<ReturnType<typeof createAnthropic>>> = {
  // High-quality reasoning tasks — need strong tool use + insurance knowledge
  qa:                   () => anthropic()("claude-sonnet-4-6"),
  health_check:         () => anthropic()("claude-sonnet-4-6"),
  portfolio_analysis:   () => anthropic()("claude-sonnet-4-6"),
  renewal_comparison:   () => anthropic()("claude-sonnet-4-6"),

  // Medium tasks — good writing, moderate reasoning
  email_generate:       () => anthropic()("claude-sonnet-4-6"),
  email_reply:          () => anthropic()("claude-sonnet-4-6"),
  qa_simple:            () => anthropic()("claude-sonnet-4-6"),

  // Fast/cheap tasks — classification, simple decisions
  image_classify:       () => anthropic()("claude-haiku-4-5-20251001"),
  extraction_classify:  () => anthropic()("claude-haiku-4-5-20251001"),
};

/**
 * Get the model for a given task.
 * Usage: `const model = getModel("qa");`
 * Then: `generateText({ model, ... })`
 */
export function getModel(task: ModelTask) {
  const factory = MODEL_CONFIG[task];
  if (!factory) {
    console.warn(`Unknown model task "${task}", falling back to qa`);
    return MODEL_CONFIG.qa();
  }
  return factory();
}

/**
 * Check which provider is available based on env vars.
 * Useful for fallback logic.
 */
export function availableProviders(): string[] {
  const providers: string[] = [];
  if (process.env.ANTHROPIC_API_KEY) providers.push("anthropic");
  if (process.env.OPENAI_API_KEY) providers.push("openai");
  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) providers.push("google");
  return providers;
}
