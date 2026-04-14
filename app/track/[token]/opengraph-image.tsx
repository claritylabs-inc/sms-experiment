import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { renderOgImage, OG_SIZE, categoryLabel } from "@/app/lib/og";

export const alt = "Spot — tracking progress";
export const size = OG_SIZE;
export const contentType = "image/png";

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

export default async function TrackOgImage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  try {
    const data = await fetchQuery(api.tasks.getOgByToken, { token });

    if (!data) {
      return renderOgImage({
        title: "Track your progress",
        subtitle: "Spot is working on your insurance documents",
        policies: [],
      });
    }

    const titleFn = TASK_TITLES[data.type] ?? TASK_TITLES["extraction"];
    const title = titleFn(data.preferredCategory ?? undefined);
    const subtitle =
      data.policies.length > 0
        ? undefined
        : "You'll get a plain-English breakdown when it's done";

    return renderOgImage({ title, subtitle, policies: data.policies });
  } catch {
    return renderOgImage({
      title: "Track your progress",
      subtitle: "Spot is working on your insurance documents",
      policies: [],
    });
  }
}
