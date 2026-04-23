import type { Metadata } from "next";
import { MessageRedirect } from "./MessageRedirect";

export const metadata: Metadata = {
  title: "Text Spot",
  robots: { index: false, follow: false },
};

export default function MessagePage() {
  return <MessageRedirect />;
}
