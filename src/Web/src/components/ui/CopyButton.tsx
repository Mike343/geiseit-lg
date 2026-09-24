"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { copyText } from "@/lib/clipboard";
import { cn } from "@/lib/cn";
import { useToast } from "./Toast";

interface CopyButtonProps {
  text: string | (() => string);
  label?: string;
  copiedLabel?: string;
  toastMessage?: string;
  variant?: "secondary" | "ghost";
  size?: "md" | "sm";
  iconOnly?: boolean;
  className?: string;
}

export function CopyButton({
  text,
  label = "Copy",
  copiedLabel = "Copied",
  toastMessage,
  variant = "secondary",
  size = "md",
  iconOnly,
  className
}: CopyButtonProps) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const handleClick = async () => {
    const value = typeof text === "function" ? text() : text;
    const ok = await copyText(value);
    if (ok) {
      setCopied(true);
      toast(toastMessage ?? "Copied to clipboard");
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 2000);
    } else {
      toast("Couldn't copy to the clipboard", "danger");
    }
  };

  const Icon = copied ? Check : Copy;
  const visibleLabel = copied ? copiedLabel : label;

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={iconOnly ? (copied ? copiedLabel : label) : undefined}
      title={iconOnly ? label : undefined}
      className={cn(
        "btn",
        variant === "ghost" ? "btn-ghost" : "btn-secondary",
        size === "sm" && "btn-sm",
        iconOnly && (size === "sm" ? "size-8 min-h-0 !px-0" : "btn-icon"),
        copied && "!text-success",
        className
      )}
    >
      <Icon aria-hidden="true" className="size-4" />
      {!iconOnly && <span aria-live="polite">{visibleLabel}</span>}
    </button>
  );
}
