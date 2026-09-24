import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { Crumb } from "@/lib/nav";

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="text-fg-3 flex items-center gap-1.5 text-[0.8125rem]">
        {items.map((item, index) => {
          const last = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`} className="flex items-center gap-1.5">
              {index > 0 && <ChevronRight aria-hidden="true" className="size-3.5" />}
              {item.href && !last ? (
                <Link href={item.href} className="hover:text-fg rounded transition-colors">
                  {item.label}
                </Link>
              ) : (
                <span aria-current={last ? "page" : undefined} className={last ? "text-fg font-medium" : undefined}>
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
