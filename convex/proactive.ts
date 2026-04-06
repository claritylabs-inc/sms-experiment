"use node";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { generateText } from "ai";
import { getModel } from "./models";
import { sendAndLog, sendBurst } from "./sendHelpers";
import { buildMemoryContext } from "./memory";

// ── Policy-type-specific analysis guidance ──

const POLICY_TYPE_GUIDANCE: Record<string, string> = {
  renters: `Renters (HO-4) policy analysis:
- Personal property limit: $30-50K is typical for renters. Below $15K is low.
- Liability: $100K minimum recommended, $300K+ is better.
- Loss of use / additional living expenses: should have this.
- Water backup coverage: important for renters, often excluded.
- Identity theft coverage: nice to have.
- No dwelling coverage expected (landlord's responsibility).`,

  homeowners: `Homeowners (HO-3/HO-5) policy analysis:
- Dwelling coverage: should be at or near replacement cost, not market value.
- Liability: $300K minimum recommended, $500K+ is better.
- Loss of use: should be at least 20% of dwelling limit.
- Water backup / sump overflow: critical, often excluded by default.
- Ordinance or law coverage: important for older homes.
- Replacement cost vs ACV on contents: replacement cost is much better.
- Wind/hail deductible: check if separate (percentage-based).`,

  auto: `Personal auto policy analysis:
- Bodily injury liability: $100K/$300K minimum recommended. $50K or less is risky.
- Uninsured/underinsured motorist: should match BI limits.
- Comprehensive vs collision: check deductibles ($500-1000 typical).
- Medical payments / PIP: important for health cost coverage.
- Rental reimbursement: useful if you depend on your vehicle.
- Gap coverage: critical if vehicle is financed/leased.`,

  flood: `Flood policy analysis:
- NFIP vs private flood: private often has broader coverage.
- Building vs contents: both should be covered.
- Waiting period: typically 30 days for NFIP.
- Basement coverage: very limited under NFIP.`,

  umbrella: `Umbrella policy analysis:
- Minimum $1M recommended, $2M+ for homeowners.
- Check underlying requirements: umbrella requires minimum BI and liability limits on auto/home.
- Should cover all household members.`,
};

function getGuidance(category: string, policyTypes?: string[]): string {
  if (POLICY_TYPE_GUIDANCE[category]) return POLICY_TYPE_GUIDANCE[category];
  // Try to match from policyTypes
  const type = policyTypes?.[0] || "";
  if (type.includes("renters") || type.includes("ho4")) return POLICY_TYPE_GUIDANCE.renters;
  if (type.includes("homeowners") || type.includes("ho3") || type.includes("ho5")) return POLICY_TYPE_GUIDANCE.homeowners;
  if (type.includes("auto")) return POLICY_TYPE_GUIDANCE.auto;
  if (type.includes("flood")) return POLICY_TYPE_GUIDANCE.flood;
  if (type.includes("umbrella")) return POLICY_TYPE_GUIDANCE.umbrella;
  return "General insurance policy — check for adequate liability limits, reasonable deductibles, and notable exclusions.";
}

// ── Tier 1: Post-Upload Policy Health Check ──

export const analyzePolicy = internalAction({
  args: {
    policyId: v.id("policies"),
    userId: v.id("users"),
    phone: v.string(),
    linqChatId: v.optional(v.string()),
    imessageSender: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    try {
      const [policy, user, memories] = await Promise.all([
        ctx.runQuery(internal.policies.getById, { policyId: args.policyId }),
        ctx.runQuery(internal.users.get, { userId: args.userId }),
        ctx.runQuery(internal.memory.getForUser, { userId: args.userId }),
      ]);

      if (!policy || policy.status !== "ready" || !policy.rawExtracted) return;
      if (policy.analysis) return; // already analyzed

      const raw = policy.rawExtracted;
      const guidance = getGuidance(policy.category, policy.policyTypes);
      const memoryBlock = buildMemoryContext(memories);

      // Auto-extract profile facts from rawExtracted
      const profileFacts: Array<{ type: string; content: string }> = [];
      if (raw.insuredAddress) {
        const addr = raw.insuredAddress;
        profileFacts.push({ type: "fact", content: `Lives at ${[addr.street1, addr.city, addr.state, addr.zip].filter(Boolean).join(", ")}` });
      }
      if (raw.insuredName) {
        profileFacts.push({ type: "fact", content: `Full name: ${raw.insuredName}` });
      }
      if (raw.policyTypes?.includes("renters_ho4")) {
        profileFacts.push({ type: "fact", content: "Rents their home (renters policy)" });
      }
      if (raw.policyTypes?.includes("homeowners_ho3") || raw.policyTypes?.includes("homeowners_ho5")) {
        profileFacts.push({ type: "fact", content: "Owns their home (homeowners policy)" });
      }
      if (raw.policyTypes?.includes("personal_auto")) {
        profileFacts.push({ type: "fact", content: "Has a personal auto policy" });
      }

      // Save profile facts as memories
      for (const fact of profileFacts) {
        await ctx.runMutation(internal.memory.addMemory, {
          userId: args.userId,
          type: fact.type,
          content: fact.content,
          source: "policy_extraction",
          policyId: args.policyId,
        });
      }

      // Build analysis prompt
      const systemPrompt = `You are a knowledgeable insurance analyst helping a consumer understand their policy. Analyze the following policy data and produce a health check.

${guidance}
${memoryBlock}

Output ONLY a JSON object (no markdown fences):
{
  "strengths": ["2-3 things that are well-covered or good about this policy"],
  "gaps": ["coverage gaps or missing protections for this policy type — only include genuine gaps, not upselling"],
  "exclusionHighlights": ["1-3 most impactful exclusions worth knowing about, in plain language"],
  "lowLimits": ["any limits that seem low for the coverage type — include the current limit and what's typically recommended"],
  "naturalSummary": "A 2-3 sentence texting-style summary. Start positive, mention the most important finding. Write as if texting a friend — casual but informative. Don't use bullet points."
}

Be honest and practical. Don't alarm — inform. If the policy is solid, say so.`;

      const { text } = await generateText({
        model: getModel("health_check"),
        system: systemPrompt,
        prompt: JSON.stringify(raw),
        maxOutputTokens: 800,
      });

      // Parse response
      let analysis: any;
      try {
        // Strip markdown fences if present
        const cleaned = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
        analysis = JSON.parse(cleaned);
      } catch {
        console.error("Failed to parse analysis JSON:", text);
        return;
      }

      analysis.generatedAt = Date.now();

      // Store analysis on policy
      await ctx.runMutation(internal.policies.updateAnalysis, {
        policyId: args.policyId,
        analysis,
      });

      // Store risk notes as memories
      for (const gap of analysis.gaps || []) {
        await ctx.runMutation(internal.memory.addMemory, {
          userId: args.userId,
          type: "risk_note",
          content: gap,
          source: "analysis",
          policyId: args.policyId,
        });
      }
      for (const low of analysis.lowLimits || []) {
        await ctx.runMutation(internal.memory.addMemory, {
          userId: args.userId,
          type: "risk_note",
          content: low,
          source: "analysis",
          policyId: args.policyId,
        });
      }

      // Log alert
      await ctx.runMutation(internal.proactiveAlerts.create, {
        userId: args.userId,
        alertType: "health_check",
        policyId: args.policyId,
        summary: analysis.naturalSummary,
        metadata: analysis,
        status: "sent",
      });

      // Text the user the health check
      if (analysis.naturalSummary) {
        await sendAndLog(ctx, args.userId, args.phone, analysis.naturalSummary, args.linqChatId, args.imessageSender);
      }

      // Check if portfolio analysis should run (2+ ready policies)
      const allPolicies = await ctx.runQuery(internal.policies.getByUser, { userId: args.userId });
      const readyCount = allPolicies.filter((p: any) => p.status === "ready").length;
      if (readyCount >= 2) {
        await ctx.scheduler.runAfter(3000, internal.proactive.analyzePortfolio, {
          userId: args.userId,
          phone: args.phone,
          linqChatId: args.linqChatId,
          imessageSender: args.imessageSender,
        });
      }
    } catch (error: any) {
      console.error("analyzePolicy failed:", error);
      // Non-fatal — don't disrupt the user experience
    }
  },
});

// ── Tier 2: Multi-Policy Portfolio Analysis ──

export const analyzePortfolio = internalAction({
  args: {
    userId: v.id("users"),
    phone: v.string(),
    linqChatId: v.optional(v.string()),
    imessageSender: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    try {
      const [policies, user, memories] = await Promise.all([
        ctx.runQuery(internal.policies.getByUser, { userId: args.userId }),
        ctx.runQuery(internal.users.get, { userId: args.userId }),
        ctx.runQuery(internal.memory.getForUser, { userId: args.userId }),
      ]);

      const readyPolicies = policies.filter((p: any) => p.status === "ready" && p.rawExtracted);
      if (readyPolicies.length < 2) return;

      // Check if we already have a recent portfolio analysis (within 1 hour)
      const existing = user?.portfolioAnalysis;
      if (existing?.generatedAt && Date.now() - existing.generatedAt < 3600000) return;

      const memoryBlock = buildMemoryContext(memories);

      // Build policy summaries for the prompt (trim sections to save tokens)
      const policySummaries = readyPolicies.map((p: any) => {
        const raw = p.rawExtracted;
        return {
          id: p._id,
          category: p.category,
          carrier: raw.carrier || raw.security || "Unknown",
          insurer: raw.security || raw.carrierLegalName || raw.carrier || "Unknown",
          policyNumber: raw.policyNumber,
          effectiveDate: raw.effectiveDate,
          expirationDate: raw.expirationDate,
          premium: raw.premium,
          insuredName: raw.insuredName,
          policyTypes: raw.policyTypes,
          coverages: raw.coverages,
          // Omit full sections/exclusions to save tokens — the individual health checks already flagged those
        };
      });

      const systemPrompt = `You are an insurance portfolio analyst. The user has ${readyPolicies.length} policies. Analyze them together for the big picture.
${memoryBlock}

Look for:
1. Coverage overlaps (same risk covered by multiple policies)
2. Portfolio gaps (e.g., auto + renters but no umbrella tying them together; no flood in a relevant area)
3. Consistency issues (different named insured spellings, address mismatches)
4. Total liability adequacy (combined across all policies)
5. Optimization suggestions (practical, not upselling)

Output ONLY a JSON object:
{
  "overlaps": ["any overlapping coverages found"],
  "gaps": ["portfolio-level gaps — things not covered by any policy"],
  "consistencyIssues": ["any mismatches across policies"],
  "suggestions": ["1-2 practical suggestions"],
  "naturalSummary": "2-3 sentence texting-style portfolio summary. Start with the big picture, then the most important finding."
}

Be practical and concise. If the portfolio is solid, say so.`;

      const { text } = await generateText({
        model: getModel("portfolio_analysis"),
        system: systemPrompt,
        prompt: JSON.stringify(policySummaries),
        maxOutputTokens: 800,
      });

      let portfolioAnalysis: any;
      try {
        const cleaned = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
        portfolioAnalysis = JSON.parse(cleaned);
      } catch {
        console.error("Failed to parse portfolio analysis:", text);
        return;
      }

      portfolioAnalysis.generatedAt = Date.now();

      await ctx.runMutation(internal.users.updatePortfolioAnalysis, {
        userId: args.userId,
        portfolioAnalysis,
      });

      // Store portfolio gaps as memories
      for (const gap of portfolioAnalysis.gaps || []) {
        await ctx.runMutation(internal.memory.addMemory, {
          userId: args.userId,
          type: "risk_note",
          content: `[Portfolio] ${gap}`,
          source: "analysis",
        });
      }

      await ctx.runMutation(internal.proactiveAlerts.create, {
        userId: args.userId,
        alertType: "portfolio",
        summary: portfolioAnalysis.naturalSummary,
        metadata: portfolioAnalysis,
        status: "sent",
      });

      if (portfolioAnalysis.naturalSummary) {
        await sendAndLog(ctx, args.userId, args.phone, portfolioAnalysis.naturalSummary, args.linqChatId, args.imessageSender);
      }
    } catch (error: any) {
      console.error("analyzePortfolio failed:", error);
    }
  },
});

// ── Tier 6: Renewal Comparison ──

export const compareRenewal = internalAction({
  args: {
    newPolicyId: v.id("policies"),
    oldPolicyId: v.id("policies"),
    userId: v.id("users"),
    phone: v.string(),
    linqChatId: v.optional(v.string()),
    imessageSender: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    try {
      const [newPolicy, oldPolicy] = await Promise.all([
        ctx.runQuery(internal.policies.getById, { policyId: args.newPolicyId }),
        ctx.runQuery(internal.policies.getById, { policyId: args.oldPolicyId }),
      ]);

      if (!newPolicy?.rawExtracted || !oldPolicy?.rawExtracted) return;

      const systemPrompt = `You are comparing two versions of the same insurance policy — an old version and a new renewal. Identify what changed.

Focus on:
1. Premium change (amount and percentage)
2. Coverage changes (added, removed, or modified coverages)
3. Limit changes (increased or decreased)
4. Deductible changes
5. Any regressions (things that got worse for the policyholder)
6. Any improvements

Output ONLY a JSON object:
{
  "premiumDelta": "e.g., '$394 → $412 (+4.6%)' or 'unchanged'",
  "changes": ["list of notable changes"],
  "regressions": ["things that got worse"],
  "improvements": ["things that got better"],
  "naturalSummary": "2-3 sentence texting-style renewal summary. Lead with the premium change, then the most important coverage change."
}`;

      const { text } = await generateText({
        model: getModel("renewal_comparison"),
        system: systemPrompt,
        prompt: JSON.stringify({
          oldPolicy: {
            policyNumber: oldPolicy.rawExtracted.policyNumber,
            effectiveDate: oldPolicy.rawExtracted.effectiveDate,
            expirationDate: oldPolicy.rawExtracted.expirationDate,
            premium: oldPolicy.rawExtracted.premium,
            coverages: oldPolicy.rawExtracted.coverages,
            policyTypes: oldPolicy.rawExtracted.policyTypes,
          },
          newPolicy: {
            policyNumber: newPolicy.rawExtracted.policyNumber,
            effectiveDate: newPolicy.rawExtracted.effectiveDate,
            expirationDate: newPolicy.rawExtracted.expirationDate,
            premium: newPolicy.rawExtracted.premium,
            coverages: newPolicy.rawExtracted.coverages,
            policyTypes: newPolicy.rawExtracted.policyTypes,
          },
        }),
        maxOutputTokens: 600,
      });

      let comparison: any;
      try {
        const cleaned = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
        comparison = JSON.parse(cleaned);
      } catch {
        console.error("Failed to parse renewal comparison:", text);
        return;
      }

      await ctx.runMutation(internal.proactiveAlerts.create, {
        userId: args.userId,
        alertType: "renewal_comparison",
        policyId: args.newPolicyId,
        relatedPolicyId: args.oldPolicyId,
        summary: comparison.naturalSummary,
        metadata: comparison,
        status: "sent",
      });

      if (comparison.naturalSummary) {
        await sendBurst(ctx, args.userId, args.phone, [
          "Your renewal just came through — here's what changed",
          comparison.naturalSummary,
        ], args.linqChatId, args.imessageSender);
      }
    } catch (error: any) {
      console.error("compareRenewal failed:", error);
    }
  },
});
