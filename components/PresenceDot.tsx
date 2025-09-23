import { Presence } from "@/lib/types";

export function PresenceDot({ presence, className = "" }: { presence: Presence; className?: string }) {
  const color = presence === "active" ? "bg-[rgb(var(--ok))]" : presence === "away" ? "bg-[rgb(var(--warn))]" : "bg-white/30";
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${color} ${className}`} />;
}
