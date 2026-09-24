import { cn } from "@/lib/cn";

interface CardProps extends React.HTMLAttributes<HTMLElement> {
  as?: "div" | "section" | "article" | "aside";
  padded?: boolean;
}

export function Card({ as: Tag = "div", padded = true, className, ...props }: CardProps) {
  return <Tag className={cn("card", padded && "p-5 sm:p-6", className)} {...props} />;
}

interface CardHeaderProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  titleId?: string;
  headingLevel?: 2 | 3;
  className?: string;
}

export function CardHeader({ title, description, icon, action, titleId, headingLevel = 2, className }: CardHeaderProps) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <div className={cn("mb-4 flex items-start justify-between gap-3", className)}>
      <div className="flex min-w-0 items-start gap-3">
        {icon && (
          <span
            aria-hidden="true"
            className="bg-brand-soft text-brand-fg mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl"
          >
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <Heading id={titleId} className="text-fg text-base leading-6 font-semibold sm:text-[1.0625rem]">
            {title}
          </Heading>
          {description && <p className="text-fg-3 mt-0.5 text-[0.8125rem] leading-5">{description}</p>}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
