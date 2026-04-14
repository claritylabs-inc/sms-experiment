import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Spot is reading your document",
  description:
    "Watch Spot read through your insurance document in real time. You'll get a plain-English breakdown of your coverage when it's done.",
  openGraph: {
    title: "Spot is reading your document",
    description:
      "Watch Spot read through your insurance document in real time. You'll get a plain-English breakdown of your coverage when it's done.",
    type: "website",
    siteName: "Spot",
  },
  twitter: {
    card: "summary_large_image",
    title: "Spot is reading your document",
    description:
      "Watch Spot read through your insurance document in real time. You'll get a plain-English breakdown of your coverage when it's done.",
  },
  robots: {
    index: false,
    follow: false,
  },
};

export default function TrackLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
