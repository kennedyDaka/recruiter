import { cn } from "@/lib/utils";

export function Logo({
  className,
  variant = "full",
  size = "md",
}: {
  className?: string;
  variant?: "full" | "mark";
  size?: "sm" | "md" | "lg";
}) {
  const dims = {
    sm: "h-7 w-7",
    md: "h-10 w-10",
    lg: "h-12 w-12",
    xl: "h-48 w-48",
  };

  const textSizes = {
    sm: "text-sm",
    md: "text-base",
    lg: "text-lg",
    xl: "text-2xl",
  };

  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <img
        src="/recruitermw-logo.png"
        alt="RecruiterMW"
        className={cn("shrink-0 object-contain", dims[size])}
      />
      {variant === "full" ? (
        <span className={cn("font-display font-semibold tracking-tight text-foreground", textSizes[size])}>
          RecruiterMW
        </span>
      ) : null}
    </span>
  );
}
