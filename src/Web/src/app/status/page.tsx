import type { Metadata } from "next";
import { StatusView } from "@/components/pages/StatusView";

export const metadata: Metadata = {
  title: "Service status",
  description: "Live health of every GeiseIT Looking Glass component."
};

export default function Page() {
  return <StatusView />;
}
