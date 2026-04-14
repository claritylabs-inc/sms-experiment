import type { Metadata } from "next";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { categoryLabel } from "@/app/lib/og";

const TASK_TITLES: Record<string, (cat?: string) => string> = {
  extraction: (cat) =>
    cat
      ? `Reading your ${categoryLabel(cat).toLowerCase()} policy`
      : "Reading your policy",
  "re-extraction": (cat) =>
    cat
      ? `Re-reading your ${categoryLabel(cat).toLowerCase()} policy`
      : "Re-reading your policy",
  reindex: () => "Rebuilding your search index",
  merge: () => "Merging your documents",
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;

  let title = "Spot is working on it";
  let description =
    "Watch Spot work through your insurance documents in real time. You'll get a plain-English breakdown when it's done.";

  try {
    const data = await fetchQuery(api.tasks.getOgByToken, { token });

    if (data) {
      const titleFn = TASK_TITLES[data.type] ?? TASK_TITLES["extraction"];
      title = titleFn(data.preferredCategory ?? undefined);

      if (data.policies.length > 0) {
        const count = data.policies.length;
        description = `${count} ${count === 1 ? "policy" : "policies"} on file. Spot is processing your latest document.`;
      }
    }
  } catch {
    // Fall back to defaults
  }

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      siteName: "Spot",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
    robots: {
      index: false,
      follow: false,
    },
  };
}

export default function TrackLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
