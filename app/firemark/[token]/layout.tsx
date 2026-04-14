import type { Metadata } from "next";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { categoryLabel } from "@/app/lib/og";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;

  let title = "Your policy firemark";
  let description =
    "A plain-English breakdown of your insurance coverage from Spot.";

  try {
    const data = await fetchQuery(api.policies.getFiremarkOg, { token });

    if (data) {
      const cat = categoryLabel(data.category);
      const carrier = data.carrier;

      title = carrier
        ? `${carrier} ${cat}`
        : `${cat} ${data.documentType === "policy" ? "Policy" : data.documentType}`;

      const parts: string[] = [];
      if (data.policyNumber) parts.push(`Policy #${data.policyNumber}`);
      if (data.effectiveDate && data.expirationDate)
        parts.push(`${data.effectiveDate} – ${data.expirationDate}`);
      if (data.premium) parts.push(data.premium);

      if (parts.length > 0) {
        description = parts.join(" · ");
      }
    }
  } catch {
    // Fall back to defaults
  }

  return {
    title,
    description,
    openGraph: {
      title: `${title} | Spot`,
      description,
      type: "website",
      siteName: "Spot",
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} | Spot`,
      description,
    },
    robots: {
      index: false,
      follow: false,
    },
  };
}

export default function FiremarkLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
