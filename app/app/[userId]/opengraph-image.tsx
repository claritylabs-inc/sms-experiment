import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { renderOgImage, OG_SIZE, categoryLabel } from "@/app/lib/og";

export const alt = "Upload Your Policy | Spot";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function UploadOgImage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId: token } = await params;

  try {
    const data = await fetchQuery(api.users.getOgByUploadToken, { token });

    if (!data) {
      return renderOgImage({
        title: "Upload your policy",
        subtitle:
          "Spot will read through it and text you a plain-English breakdown",
        policies: [],
      });
    }

    const hasPolicies = data.policies.length > 0;
    const cat = data.preferredCategory;

    const title = hasPolicies
      ? cat
        ? `Upload your ${categoryLabel(cat).toLowerCase()} policy`
        : "Upload another policy"
      : cat
        ? `Upload your ${categoryLabel(cat).toLowerCase()} policy`
        : "Upload your first policy";

    const subtitle = hasPolicies
      ? undefined
      : "Spot will read through it and text you a plain-English breakdown";

    return renderOgImage({ title, subtitle, policies: data.policies });
  } catch {
    return renderOgImage({
      title: "Upload your policy",
      subtitle:
        "Spot will read through it and text you a plain-English breakdown",
      policies: [],
    });
  }
}
