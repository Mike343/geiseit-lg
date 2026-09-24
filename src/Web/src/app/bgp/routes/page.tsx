import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/PageHeader";
import { BgpView } from "@/components/pages/BgpViews";

export const metadata: Metadata = { title: "BGP routes", description: "Read-only view of BGP routes seen by the GeiseIT Looking Glass." };

export default function Page() {
  return (
    <>
      <PageHeader eyebrow="BGP" title="Routes" description="Read-only view of the BGP routes known to this Looking Glass." />
      <BgpView mode="routes" />
    </>
  );
}
