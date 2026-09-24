import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { NavItem } from "@/lib/nav";

export function DiagnosticCard({ item }: { item: NavItem }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className="card card-hover group flex items-start gap-4 p-5"
    >
      <span aria-hidden="true" className="bg-brand-soft text-brand-fg grid size-11 shrink-0 place-items-center rounded-xl">
        <Icon className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="text-fg flex items-center justify-between gap-2 text-base font-semibold">
          {item.label}
          <ArrowUpRight aria-hidden="true" className="text-fg-3 group-hover:text-brand-fg size-4 transition-colors" />
        </span>
        <span className="text-fg-2 mt-0.5 block text-sm">{item.description}</span>
      </span>
    </Link>
  );
}
