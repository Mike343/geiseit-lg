import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/PageHeader";
import { BgpView } from "@/components/pages/BgpViews";

export const metadata: Metadata = { title: "BGP sessions", description: "Read-only BGP peer session status." };

export default function Page() {
  return (
    <>
      <PageHeader eyebrow="BGP" title="Sessions" description="Read-only status of BGP peer sessions." />
      <BgpView mode="sessions" />
    </>
  );
}
