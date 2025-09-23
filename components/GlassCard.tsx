import { cn } from "@/lib/utils"; // your usual helper; if you don't have one, replace with simple join
import { ReactNode } from "react";

export default function GlassCard({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  // IMPORTANT: no default overflow here; let parents decide.
  return (
    <div
      className={cn(
        "rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md",
        className
      )}
    >
      {children}
    </div>
  );
}
