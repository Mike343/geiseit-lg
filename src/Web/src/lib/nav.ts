import {
  Activity,
  Boxes,
  Gauge,
  Globe,
  HeartPulse,
  Info,
  LayoutDashboard,
  Link2,
  Network,
  Route,
  Search,
  Server,
  Waypoints,
  type LucideIcon
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  description: string;
}

export interface NavGroup {
  label: string | null;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: null,
    items: [{ label: "Dashboard", href: "/", icon: LayoutDashboard, description: "Network overview and quick diagnostics" }]
  },
  {
    label: "Diagnostics",
    items: [
      { label: "Ping", href: "/diagnostics/ping", icon: Activity, description: "Measure reachability and round-trip latency" },
      { label: "Traceroute", href: "/diagnostics/traceroute", icon: Route, description: "See the path packets take to a destination" },
      { label: "MTR", href: "/diagnostics/mtr", icon: Waypoints, description: "Combine route discovery with loss and latency statistics" },
      { label: "DNS Lookup", href: "/diagnostics/dns", icon: Globe, description: "Query public DNS records" }
    ]
  },
  {
    label: "BGP",
    items: [
      { label: "Routes", href: "/bgp/routes", icon: Network, description: "Read-only view of BGP routes" },
      { label: "Prefix Lookup", href: "/bgp/prefix", icon: Search, description: "Look up a prefix or ASN" },
      { label: "Sessions", href: "/bgp/sessions", icon: Link2, description: "Peer session status" }
    ]
  },
  {
    label: "Network",
    items: [
      { label: "Network Information", href: "/network", icon: Server, description: "Where this Looking Glass lives" },
      { label: "Looking Glass Status", href: "/network/status", icon: Gauge, description: "Connectivity and latency over time" }
    ]
  },
  {
    label: "System",
    items: [{ label: "Service Status", href: "/status", icon: HeartPulse, description: "Health of each component" }]
  },
  {
    label: "About",
    items: [
      { label: "About GeiseIT", href: "/about", icon: Info, description: "What this Looking Glass is and how to use it" },
      { label: "Infrastructure", href: "/about/infrastructure", icon: Boxes, description: "Built on Kubernetes" }
    ]
  }
];

export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

export interface Crumb {
  label: string;
  href?: string;
}

export function isActive(pathname: string, href: string): boolean {
  return pathname === href;
}

export function breadcrumbsFor(pathname: string): Crumb[] {
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  if (normalized === "/") return [{ label: "Dashboard" }];
  for (const group of NAV_GROUPS) {
    const item = group.items.find((i) => i.href === normalized);
    if (item) {
      const crumbs: Crumb[] = [{ label: "Dashboard", href: "/" }];
      if (group.label) crumbs.push({ label: group.label });
      crumbs.push({ label: item.label });
      return crumbs;
    }
  }
  return [{ label: "Dashboard", href: "/" }, { label: "Not found" }];
}
