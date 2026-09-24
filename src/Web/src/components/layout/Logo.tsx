import { cn } from "@/lib/cn";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" aria-hidden="true" className={cn("size-9 shrink-0", className)}>
      <rect width="40" height="40" rx="11" className="fill-brand" />
      <circle cx="18" cy="18" r="8.5" fill="none" strokeWidth="2.6" className="stroke-on-brand" />
      <path d="M24.4 24.4 31 31" strokeWidth="3" strokeLinecap="round" className="stroke-on-brand" />
      <circle cx="14.6" cy="19.6" r="1.7" className="fill-on-brand" />
      <circle cx="21.4" cy="14.6" r="1.7" className="fill-on-brand" />
      <circle cx="21.6" cy="21.4" r="1.7" className="fill-on-brand" />
      <path d="m14.6 19.6 6.8-5m-6.8 5 7 1.8" strokeWidth="1.4" strokeLinecap="round" className="stroke-on-brand" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-3", className)}>
      <LogoMark />
      <span className="flex flex-col leading-none">
        <span className="text-fg text-[1.0625rem] font-extrabold tracking-[0.14em]">GEISEIT</span>
        <span className="text-fg-3 mt-1 text-[0.5625rem] font-semibold tracking-[0.12em]">NETWORK LOOKING GLASS</span>
      </span>
    </span>
  );
}
