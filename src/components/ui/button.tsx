import * as React from "react";
import { cn } from "@/lib/utils";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "secondary" | "ghost" | "outline";
  size?: "default" | "sm";
};

export function Button({ className, variant = "default", size = "default", ...props }: ButtonProps) {
  const styles =
    variant === "default"
      ? "bg-primary text-primary-foreground shadow hover:bg-primary/90"
      : variant === "secondary"
        ? "bg-secondary text-secondary-foreground hover:bg-secondary/80"
        : variant === "outline"
          ? "border border-slate-200 bg-white hover:bg-slate-50"
          : "hover:bg-secondary";
  const sizing = size === "sm" ? "rounded-lg px-2 py-1 text-xs" : "rounded-xl px-3 py-2 text-sm";
  return (
    <button
      className={cn("inline-flex items-center justify-center font-medium transition-colors disabled:opacity-50", sizing, styles, className)}
      {...props}
    />
  );
}
