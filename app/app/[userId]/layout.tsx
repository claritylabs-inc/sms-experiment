import type { Metadata } from "next";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { categoryLabel } from "@/app/lib/og";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ userId: string }>;
}): Promise<Metadata> {
  const { userId: token } = await params;

  let title = "Upload Your Policy";
  let description =
    "Securely upload your insurance policy PDF. Spot will read through it and text you a plain-English breakdown of your coverage.";

  try {
    const data = await fetchQuery(api.users.getOgByUploadToken, { token });

    if (data) {
      const cat = data.preferredCategory;
      const hasPolicies = data.policies.length > 0;

      title = hasPolicies
        ? cat
          ? `Upload your ${categoryLabel(cat).toLowerCase()} policy`
          : "Upload another policy"
        : cat
          ? `Upload your ${categoryLabel(cat).toLowerCase()} policy`
          : "Upload your first policy";

      if (hasPolicies) {
        const count = data.policies.length;
        description = `${count} ${count === 1 ? "policy" : "policies"} already on file. Upload another to add to your vault.`;
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

export default function UploadLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
