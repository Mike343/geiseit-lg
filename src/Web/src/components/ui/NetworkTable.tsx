import { cn } from "@/lib/cn";

export interface NetworkRow {
  label: string;
  value: React.ReactNode;
  action?: React.ReactNode;
  mono?: boolean;
}

export function NetworkTable({ rows, className }: { rows: NetworkRow[]; className?: string }) {
  return (
    <dl className={cn("divide-line divide-y", className)}>
      {rows.map((row) => (
        <div key={row.label} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3 first:pt-0 last:pb-0">
          <dt className="text-fg-3 text-[0.8125rem] font-medium">{row.label}</dt>
          <dd className="flex min-w-0 items-center gap-1.5">
            <span className={cn("text-fg min-w-0 text-sm font-semibold break-all", row.mono && "font-mono text-[0.8125rem]")}>
              {row.value}
            </span>
            {row.action}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function DataTable({
  caption,
  head,
  children,
  className
}: {
  caption: string;
  head: (string | { label: string; align?: "left" | "right" })[];
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("scroll-x rounded-xl border border-line", className)} tabIndex={0} role="region" aria-label={caption}>
      <table className="w-full min-w-max border-collapse text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-subtle text-fg-3 text-xs font-semibold tracking-wide uppercase">
          <tr>
            {head.map((h) => {
              const cell = typeof h === "string" ? { label: h, align: "left" as const } : { align: "left" as const, ...h };
              return (
                <th key={cell.label} scope="col" className={cn("px-3.5 py-2.5 whitespace-nowrap", cell.align === "right" && "text-right")}>
                  {cell.label}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-line divide-y">{children}</tbody>
      </table>
    </div>
  );
}
