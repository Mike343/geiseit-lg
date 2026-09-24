import { cn } from "@/lib/cn";

interface PageHeaderProps {
  title: string;
  description?: React.ReactNode;
  eyebrow?: string;
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({ title, description, eyebrow, actions, className }: PageHeaderProps) {
  return (
    <div className={cn("mb-6 flex flex-wrap items-end justify-between gap-4 sm:mb-8", className)}>
      <div className="min-w-0">
        {eyebrow && <p className="text-brand-fg mb-1 text-xs font-semibold tracking-[0.12em] uppercase">{eyebrow}</p>}
        <h1 className="text-fg text-[1.625rem] leading-tight font-bold tracking-tight sm:text-[2rem]">{title}</h1>
        {description && <p className="text-fg-2 mt-1.5 max-w-2xl text-[0.9375rem]">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
