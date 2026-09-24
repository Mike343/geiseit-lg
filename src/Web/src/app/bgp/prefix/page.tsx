import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/PageHeader";
import { BgpLookup } from "@/components/pages/BgpViews";

export const metadata: Metadata = { title: "BGP prefix lookup", description: "Look up a BGP prefix or ASN." };

export default function Page() {
  return (
    <>
      <PageHeader eyebrow="BGP" title="Prefix lookup" description="Look up a prefix or an autonomous system number (ASN)." />
      <BgpLookup />
    </>
  );
}
