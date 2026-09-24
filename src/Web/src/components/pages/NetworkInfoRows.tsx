"use client";

import { CopyButton } from "@/components/ui/CopyButton";
import { NetworkTable, type NetworkRow } from "@/components/ui/NetworkTable";
import type { NetworkInfo } from "@/lib/api/types";

const NOT_AVAILABLE = "Not published";

function copyAction(value: string | null, label: string) {
  return value ? <CopyButton text={value} label={`Copy ${label}`} toastMessage={`${label} copied`} variant="ghost" size="sm" iconOnly /> : undefined;
}

export function networkRows(info: NetworkInfo, full: boolean): NetworkRow[] {
  const rows: NetworkRow[] = [
    { label: "Location", value: info.location },
    { label: "Network", value: info.network },
    { label: "ASN", value: info.asn ?? NOT_AVAILABLE, mono: true, action: copyAction(info.asn, "ASN") },
    { label: "IPv4", value: info.ipv4 ?? NOT_AVAILABLE, mono: true, action: copyAction(info.ipv4, "IPv4 address") },
    { label: "IPv6", value: info.ipv6 ?? NOT_AVAILABLE, mono: true, action: copyAction(info.ipv6, "IPv6 address") }
  ];
  if (full) {
    rows.unshift({ label: "Hostname", value: info.hostname, mono: true, action: copyAction(info.hostname, "hostname") });
    rows.push({ label: "Platform", value: info.platform }, { label: "Connectivity", value: info.connectivity }, { label: "Version", value: info.version, mono: true });
  } else {
    rows.push({ label: "Platform", value: info.platform });
  }
  return rows;
}

export function NetworkInfoRows({ info, full = false }: { info: NetworkInfo; full?: boolean }) {
  return <NetworkTable rows={networkRows(info, full)} />;
}
