import { cn } from "@/lib/cn";

interface TerminalOutputProps {
  output: string;
  title?: string;
  className?: string;
  maxHeightClass?: string;
}

export function TerminalOutput({ output, title = "Technical output", className, maxHeightClass = "max-h-[32rem]" }: TerminalOutputProps) {
  return (
    <div className={cn("bg-term border-term-line overflow-hidden rounded-xl border", className)}>
      <div className="border-term-line flex items-center gap-2 border-b px-4 py-2">
        <span aria-hidden="true" className="flex gap-1.5">
          <span className="bg-term-line size-2.5 rounded-full" />
          <span className="bg-term-line size-2.5 rounded-full" />
          <span className="bg-term-line size-2.5 rounded-full" />
        </span>
        <span className="text-term-muted ml-1 font-mono text-xs">{title}</span>
      </div>
      <pre
        tabIndex={0}
        aria-label={title}
        className={cn(
          "text-term-fg overflow-auto px-4 py-3 font-mono text-[0.8125rem] leading-6 whitespace-pre",
          maxHeightClass
        )}
      >
        {output.trim() === "" ? "(no output)" : output}
      </pre>
    </div>
  );
}
