"use client";
import { useParams } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Calendar, Hash, DollarSign, Download } from "lucide-react";

// ─── Category labels ────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  auto: "Auto",
  homeowners: "Homeowners",
  renters: "Renters",
  flood: "Flood",
  umbrella: "Umbrella",
  pet: "Pet",
  travel: "Travel",
  earthquake: "Earthquake",
  recreational: "Recreational",
  farm: "Farm",
  commercial: "Commercial",
  other: "Other",
};

function categoryLabel(cat: string): string {
  return CATEGORY_LABELS[cat] || cat.charAt(0).toUpperCase() + cat.slice(1);
}

function docTypeLabel(dt: string): string {
  if (dt === "policy") return "Policy";
  if (dt === "quote") return "Quote";
  if (dt === "binder") return "Binder";
  if (dt === "endorsement") return "Endorsement";
  if (dt === "certificate") return "Certificate";
  return dt;
}

// ─── Coverage parser ────────────────────────────────────────────────────────

interface Coverage {
  name: string;
  limit?: string;
  deductible?: string;
  description?: string;
}

function parseCoverages(raw: unknown): Coverage[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((c): c is Record<string, unknown> => c && typeof c === "object")
    .map((c) => ({
      name: String(c.name || c.coverageName || c.type || "Coverage"),
      limit: c.limit != null ? String(c.limit) : c.perOccurrenceLimit != null ? String(c.perOccurrenceLimit) : undefined,
      deductible: c.deductible != null ? String(c.deductible) : undefined,
      description: c.description != null ? String(c.description) : undefined,
    }));
}

// ─── Detail row ─────────────────────────────────────────────────────────────

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 flex size-5 shrink-0 items-center justify-center text-muted-foreground/60">
        {icon}
      </div>
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground/70">
          {label}
        </p>
        <p className="text-[0.95rem] text-foreground">{value}</p>
      </div>
    </div>
  );
}

// ─── Main page ──────────────────────────────────────────────────────────────

export default function FiremarkPage() {
  const params = useParams();
  const token = params.token as string;

  const policy = useQuery(api.policies.getByFiremarkToken, { token });

  // Loading
  if (policy === undefined) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background p-6">
        <div className="size-8 animate-spin rounded-full border-3 border-border border-t-foreground" />
      </div>
    );
  }

  // Invalid token
  if (policy === null) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-background p-6">
        <div className="w-full max-w-[440px] text-center">
          <div className="mb-8 flex items-center justify-center">
            <span className="font-logo text-xl tracking-wide text-foreground">
              SPOT
            </span>
          </div>
          <h1 className="mb-3 font-heading text-3xl tracking-tight text-foreground">
            Firemark not found
          </h1>
          <p className="text-[0.95rem] leading-relaxed text-muted-foreground">
            This link isn&apos;t valid. Text Spot to get a new one.
          </p>
        </div>
      </div>
    );
  }

  const coverages = parseCoverages(policy.coverages);
  const isExpired = policy.expirationDate
    ? new Date(policy.expirationDate) < new Date()
    : false;

  // Parse summary lines (skip lines that duplicate structured fields)
  const summaryLines = (() => {
    if (!policy.summary) return [];
    return policy.summary
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .filter(
        (l) =>
          !l.startsWith("Carrier:") &&
          !l.startsWith("Policy #:") &&
          !l.startsWith("Premium:") &&
          !(l.startsWith("Coverage:") && l.includes(" to "))
      );
  })();

  return (
    <div className="flex min-h-dvh flex-col items-center justify-start bg-background px-6 pb-16 pt-12">
      <div className="w-full max-w-[480px]">
        {/* Logo */}
        <div className="mb-10 flex items-center justify-center">
          <span className="font-logo text-xl tracking-wide text-foreground">
            SPOT
          </span>
        </div>

        {/* ── Firemark card ── */}
        <div className="relative mb-8 overflow-hidden rounded-3xl border border-border bg-white p-8">
          {/* Subtle top accent bar */}
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-brand-blue via-brand-blue/60 to-transparent" />

          {/* Category + type pills */}
          <div className="mb-6 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-brand-blue/15 px-3 py-1 text-xs font-medium text-foreground">
              {categoryLabel(policy.category)}
            </span>
            <span className="rounded-full bg-secondary px-3 py-1 text-xs font-medium capitalize text-muted-foreground">
              {docTypeLabel(policy.documentType)}
            </span>
            {isExpired && (
              <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-600">
                Expired
              </span>
            )}
          </div>

          {/* Carrier as heading */}
          {policy.carrier && (
            <h1 className="mb-1 font-heading text-3xl tracking-tight text-foreground">
              {policy.carrier}
            </h1>
          )}

          {/* Insured name */}
          {policy.insuredName && (
            <p className="mb-6 text-[0.95rem] text-muted-foreground">
              {policy.insuredName}
            </p>
          )}

          {/* Key details grid */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-5">
            {policy.policyNumber && (
              <DetailRow
                icon={<Hash className="size-4" />}
                label="Policy #"
                value={policy.policyNumber}
              />
            )}
            {policy.premium && (
              <DetailRow
                icon={<DollarSign className="size-4" />}
                label="Premium"
                value={policy.premium}
              />
            )}
            {policy.effectiveDate && (
              <DetailRow
                icon={<Calendar className="size-4" />}
                label="Effective"
                value={policy.effectiveDate}
              />
            )}
            {policy.expirationDate && (
              <DetailRow
                icon={<Calendar className="size-4" />}
                label="Expires"
                value={policy.expirationDate}
              />
            )}
          </div>
        </div>

        {/* ── PDF download ── */}
        {policy.pdfUrl && (
          <div className="mb-8">
            <a
              href={policy.pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-white px-6 py-4 text-[0.95rem] font-medium text-foreground transition-colors hover:bg-warm-card"
            >
              <Download className="size-4" />
              Download policy PDF
            </a>
          </div>
        )}

        {/* ── Summary ── */}
        {summaryLines.length > 0 && (
          <div className="mb-8">
            <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground/70">
              Summary
            </h2>
            <div className="rounded-2xl border border-border bg-white p-6">
              <div className="space-y-2 text-[0.95rem] leading-relaxed text-muted-foreground">
                {summaryLines.map((line, i) => {
                  if (line.startsWith("- ")) {
                    return (
                      <div key={i} className="flex gap-2">
                        <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand-blue" />
                        <span>{line.slice(2)}</span>
                      </div>
                    );
                  }
                  if (line.startsWith("Key coverages:") || line.startsWith("Coverages:")) {
                    return (
                      <p key={i} className="pt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground/70">
                        {line.replace(":", "")}
                      </p>
                    );
                  }
                  return <p key={i}>{line}</p>;
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── Coverages ── */}
        {coverages.length > 0 && (
          <div className="mb-8">
            <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground/70">
              Coverages
            </h2>
            <div className="space-y-2">
              {coverages.map((cov, i) => (
                <div
                  key={i}
                  className="rounded-2xl border border-border bg-white p-5"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="min-w-0 shrink text-[0.95rem] font-medium text-foreground">
                      {cov.name}
                    </p>
                    {cov.limit && (
                      <p className="max-w-[50%] shrink-0 truncate text-right text-sm text-muted-foreground">
                        {cov.limit}
                      </p>
                    )}
                  </div>
                  {cov.deductible && (
                    <p className="mt-1 text-sm text-muted-foreground">
                      Deductible: {cov.deductible}
                    </p>
                  )}
                  {cov.description && (
                    <p className="mt-1 truncate text-sm text-muted-foreground/80">
                      {cov.description}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <p className="mt-2 text-center text-xs text-muted-foreground/70">
          Your documents are encrypted and only used to help you understand your
          coverage.
        </p>
        <div className="mt-6 flex items-center justify-center text-xs text-muted-foreground/50">
          <span>Spot from Clarity Labs</span>
        </div>
      </div>
    </div>
  );
}
