import { cn } from "@/lib/utils";

export function Logo({
  className,
  variant = "full",
}: {
  className?: string;
  variant?: "full" | "mark";
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <span
        aria-hidden="true"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary font-display text-sm font-semibold text-primary-foreground"
      >
        OR
      </span>
      {variant === "full" ? (
        <span className="font-display text-sm font-semibold tracking-tight">Operon Recruit</span>
      ) : null}
    </span>
  );
}
