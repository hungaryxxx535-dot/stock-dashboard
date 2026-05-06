import * as React from "react";
import { cn } from "@/lib/utils";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "default" | "secondary" | "ghost" };
export function Button({ className, variant = "default", ...props }: ButtonProps) {
  const styles = variant === "default" ? "bg-primary text-primary-foreground shadow hover:bg-primary/90" : variant === "secondary" ? "bg-secondary text-secondary-foreground hover:bg-secondary/80" : "hover:bg-secondary";
  return <button className={cn("inline-flex items-center justify-center rounded-xl px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50", styles, className)} {...props} />;
}
