"use client";

import { useEffect, useMemo, useState } from "react";
import GlassCard from "./GlassCard";
import { ScrollArea } from "./ui/scroll-area";
import { PresenceDot } from "./PresenceDot";
import type { User, Presence } from "@/lib/api";
import { apiUsers } from "@/lib/api";

/** Presence heuristics:
 * - active: seen within 70s
 * - away:   seen within 30min
 * - else:   offline
 */
function derivePresence(u: User, now = Date.now()): Presence {
  const last = typeof u.lastActiveTs === "number" ? Number(u.lastActiveTs) : 0;
  if (last && now - last <= 70_000) return "active";
  if (last && now - last <= 30 * 60_000) return "away";
  return "offline";
}

export default function RightSidebar({
  users,
  onOpenDm,
}: {
  users: User[];
  onOpenDm: (userIds: number[]) => void;
}) {
  // Keep a locally refreshed view so presence stays fresh even if parent doesn’t re-render often
  const [people, setPeople] = useState<User[]>(users);
  useEffect(() => setPeople(users), [users]);

  useEffect(() => {
    let stop = false;
    const tick = async () => {
      try {
        const fresh = await apiUsers(); // includes presence + lastActiveTs
        if (!stop) setPeople(fresh);
      } catch (e) {
        console.error("presence refresh failed", e);
      }
    };
    tick();
    const id = setInterval(tick, 60_000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, []);

  const now = Date.now();
  const enhanced = useMemo(
    () => people.map((u) => ({ ...u, presence: derivePresence(u, now) })),
    [people, now]
  );

  const active = useMemo(() => enhanced.filter((u) => u.presence === "active"), [enhanced]);
  const away = useMemo(() => enhanced.filter((u) => u.presence === "away"), [enhanced]);
  const offline = useMemo(() => enhanced.filter((u) => u.presence === "offline"), [enhanced]);

  const [offlineOpen, setOfflineOpen] = useState(false);

  return (
    <div className="min-h-0 min-w-0 h-full w-80 overflow-hidden flex flex-col gap-3 p-3">
      {/* Active */}
      <GlassCard className="px-3 py-2 shrink-0">
        <div className="px-1 pb-2 text-xs uppercase tracking-wide text-white/60">Active</div>
        <ScrollArea className="max-h-70 pr-2">
          <div className="flex flex-col gap-1.5">
            {active.map((u) => (
              <UserRow key={u.id} user={u} onClick={() => onOpenDm([u.id])} />
            ))}
            {active.length === 0 && (
              <div className="px-2 py-1.5 text-sm text-white/50">No one is active right now.</div>
            )}
          </div>
        </ScrollArea>
      </GlassCard>

      {/* Others */}
      <GlassCard className="flex-1 min-h-0 overflow-hidden px-3 py-2">
        <div className="px-1 pb-2 text-xs uppercase tracking-wide text-white/60">Others</div>
        <ScrollArea className="h-full pr-2">
          <Group
            label="Away"
            colorClass=""
            items={away}
            onOpenDm={onOpenDm}
            defaultOpen
          />
          <Group
            label={`Offline ${offlineOpen ? "" : `(${offline.length})`}`}
            colorClass="bg-white/30"
            items={offline}
            onOpenDm={onOpenDm}
            collapsible
            open={offlineOpen}
            onToggle={() => setOfflineOpen((v) => !v)}
          />
        </ScrollArea>
      </GlassCard>
    </div>
  );
}

function UserRow({ user, onClick }: { user: User; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left hover:bg-white/10"
      title={`Message ${user.name}`}
    >
      {/* Avatar with presence dot */}
      <div className="relative h-6 w-6 shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={user.avatarUrl}
          alt={user.name}
          className="h-6 w-6 rounded-full object-cover border border-white/10"
          onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")}
        />
        <span className="absolute -bottom-0 -right-0">
          <PresenceDot presence={user.presence} />
        </span>
      </div>
      <div className="min-w-0">
        <div className="truncate text-sm">{user.name}</div>
        {/* Optional: show last active time when not active */}
        {user.presence !== "active" && user.lastActiveTs ? (
          <div className="truncate text-xs text-white/50">
            seen {timeAgo(user.lastActiveTs)}
          </div>
        ) : null}
      </div>
    </button>
  );
}

function Group({
  label,
  items,
  colorClass,
  onOpenDm,
  collapsible = false,
  defaultOpen = true,
  open,
  onToggle,
}: {
  label: string;
  items: User[];
  colorClass: string;
  onOpenDm: (ids: number[]) => void;
  collapsible?: boolean;
  defaultOpen?: boolean;
  open?: boolean;
  onToggle?: () => void;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const openState = collapsible ? (open ?? isOpen) : true;

  const toggle = () => {
    if (!collapsible) return;
    if (onToggle) onToggle();
    else setIsOpen((v) => !v);
  };

  return (
    <div className="mb-4">
      <button
        type="button"
        onClick={toggle}
        className="mb-1 flex w-full items-center justify-between rounded-md px-1 py-1 text-left text-xs uppercase tracking-wide text-white/60 hover:bg-white/5"
      >
        <span className="flex items-center gap-2">
          <span className={`inline-block h-2.5 w-2.5 rounded-full ${colorClass}`} />
          {label}
        </span>
        {collapsible && (
          <span className="text-white/40">{openState ? "Hide" : "Show"}</span>
        )}
      </button>

      {openState && (
        <div className="flex flex-col gap-1.5">
          {items.map((u) => (
            <UserRow key={u.id} user={u} onClick={() => onOpenDm([u.id])} />
          ))}
          {items.length === 0 && (
            <div className="px-2 py-1.5 text-sm text-white/50">No users</div>
          )}
        </div>
      )}
    </div>
  );
}

/* ---- tiny util ---- */
function timeAgo(ts: number | string) {
  const ms = Number(ts);
  const s = Math.max(1, Math.floor((Date.now() - ms) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
