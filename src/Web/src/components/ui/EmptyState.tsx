import { cn } from "@/lib/cn";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  compact?: boolean;
  className?: string;
}

export function EmptyState({ icon, title, description, action, compact, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        compact ? "gap-2 px-4 py-6" : "gap-3 px-6 py-12",
        className
      )}
    >
      {icon && (
        <span aria-hidden="true" className="bg-subtle text-fg-3 grid size-12 place-items-center rounded-2xl">
          {icon}
        </span>
      )}
      <p className="text-fg text-base font-semibold">{title}</p>
      {description && <p className="text-fg-2 max-w-md text-sm">{description}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
