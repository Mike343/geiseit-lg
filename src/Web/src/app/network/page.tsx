import type { Metadata } from "next";
import { NetworkView } from "@/components/pages/NetworkView";
import { loadNetwork } from "@/lib/server/loaders";

export const metadata: Metadata = {
  title: "Network information",
  description: "Public network details for the GeiseIT Looking Glass: location, addresses, ASN and platform."
};

export default async function Page() {
  return <NetworkView initial={await loadNetwork()} />;
}
