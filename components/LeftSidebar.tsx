"use client";

import GlassCard from "./GlassCard";
import { ScrollArea } from "./ui/scroll-area";
import { useMemo, useState, useEffect, useRef } from "react";
import type { Stream, Topic, DmThread, User, Presence } from "@/lib/api";
import { apiDmThreads, apiUsers, toProxy } from "@/lib/api";

/* --------------------- tiny utils ---------------------- */
const DM_BADGE_KEY = "zulip.dmBadgeCounts"; // { [dmKey]: number }
const clamp99 = (n: number) => (n > 99 ? 99 : n);
/** Canonical (sorted) key so we’re consistent everywhere */
const keyOf = (ids: number[]) => ids.slice().sort((a, b) => a - b).join(",");

function loadBadgeMap(): Record<string, number> {
  try {
    const raw = localStorage.getItem(DM_BADGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    return {};
  }
}
function saveBadgeMap(m: Record<string, number>) {
  try {
    localStorage.setItem(DM_BADGE_KEY, JSON.stringify(m));
  } catch {}
}

/** Heuristic presence from lastActiveTs. */
function derivePresence(u: Pick<User, "presence" | "lastActiveTs">, now = Date.now()): Presence {
  const last = typeof u.lastActiveTs === "number" ? Number(u.lastActiveTs) : 0;
  if (last && now - last <= 70_000) return "active";
  if (last && now - last <= 30 * 60_000) return "away";
  return "offline";
}

/** Presence → color classes */
function presenceClass(p: Presence | undefined) {
  switch (p) {
    case "active":
      return "bg-emerald-500";
    case "away":
      return "bg-amber-500";
    default:
      return "bg-zinc-500";
  }
}

export default function LeftSidebar({
  mode,
  onMode,
  onSelectStream,
  onSelectTopic,
  onSelectDm,
  selectedStreamId,
  streams,
  topics,
  /** The DM currently open in the center pane */
  currentDmUserIds,
}: {
  mode: "streams" | "topics" | "dm";
  onMode: (m: "streams" | "topics" | "dm") => void;
  onSelectStream: (id: number | undefined) => void;
  onSelectTopic: (id: number | undefined) => void;
  onSelectDm: (userIds: number[]) => void;
  selectedStreamId?: number;
  streams: Stream[];
  topics: Topic[];
  currentDmUserIds?: number[];
}) {
  const [dmSearch, setDmSearch] = useState("");
  const [threads, setThreads] = useState<DmThread[]>([]);
  const threadsRef = useRef<DmThread[]>([]);
  const [badge, setBadge] = useState<Record<string, number>>(loadBadgeMap());

  /** id -> lightweight user (avatar + lastActive + name) */
  const [users, setUsers] = useState<
    Record<number, Pick<User, "avatarUrl" | "presence" | "lastActiveTs" | "name">>
  >({});

  /* -------- users: avatars + presence (refresh every 60s) -------- */
  useEffect(() => {
    let stop = false;
    const load = async () => {
      try {
        const list = await apiUsers();
        if (stop) return;
        const map: Record<
          number,
          Pick<User, "avatarUrl" | "presence" | "lastActiveTs" | "name">
        > = {};
        list.forEach((u) => {
          map[u.id] = {
            avatarUrl: u.avatarUrl,
            presence: u.presence,
            lastActiveTs: u.lastActiveTs,
            name: u.name,
          };
        });
        setUsers(map);
      } catch (e) {
        console.error(e);
      }
    };
    load();
    const t = setInterval(load, 60_000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, []);

  /* -------- if the open DM changes, clear its badge immediately -------- */
  useEffect(() => {
    if (!currentDmUserIds?.length) return;
    const k = keyOf(currentDmUserIds);
    if (badge[k]) {
      const next = { ...badge };
      delete next[k];
      setBadge(next);
      saveBadgeMap(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDmUserIds?.join(",")]);

  /* -------- threads: initial + poll every 20s -------- */
  useEffect(() => {
    let stop = false;
    let ticking = false;

    const tick = async () => {
      ticking = true;
      try {
        const list = await apiDmThreads();
        if (stop) return;

        const prev = threadsRef.current;

        // Index previous by canonical key
        const prevByCanon = new Map(prev.map((t) => [keyOf(t.userIds), t]));

        // Start from current badge map
        const nextBadge: Record<string, number> = { ...badge };

        // Migrate any old unsorted keys to canonical
        for (const t of list) {
          const canon = keyOf(t.userIds);
          if (t.key && nextBadge[t.key] && !nextBadge[canon]) {
            nextBadge[canon] = nextBadge[t.key];
            delete nextBadge[t.key];
          }
        }

        const openKey = currentDmUserIds?.length ? keyOf(currentDmUserIds) : null;

        for (const t of list) {
          const canon = keyOf(t.userIds);
          const before = prevByCanon.get(canon);
          const isOpenDm = openKey && canon === openKey;

          // Keep badge cleared for the currently open DM
          if (isOpenDm) {
            if (nextBadge[canon]) delete nextBadge[canon];
            continue;
          }

          // Increment when a new message arrives and the thread isn't open
          if (before && t.lastTs > before.lastTs) {
            nextBadge[canon] = clamp99((nextBadge[canon] || 0) + 1);
          }
        }

        threadsRef.current = list;
        setThreads(list);
        if (JSON.stringify(nextBadge) !== JSON.stringify(badge)) {
          setBadge(nextBadge);
          saveBadgeMap(nextBadge);
        }
      } catch (e) {
        console.error(e);
      } finally {
        ticking = false;
      }
    };

    tick();
    const interval = setInterval(() => {
      if (!ticking) tick();
    }, 20_000);

    return () => {
      stop = true;
      clearInterval(interval);
    };
    // re-run when the open DM changes so we clear it promptly too
  }, [mode, currentDmUserIds?.join(","), badge]);

  /* -------- filter DMs -------- */
  const filteredThreads = useMemo(() => {
    const q = dmSearch.trim().toLowerCase();
    if (!q) return threads;
    return threads.filter((t) => t.names.join(" ").toLowerCase().includes(q));
  }, [threads, dmSearch]);

  /* -------- open DM + clear badge (canonical key) -------- */
  const openDm = (ids: number[]) => {
    const key = keyOf(ids);
    if (badge[key]) {
      const next = { ...badge };
      delete next[key];
      setBadge(next);
      saveBadgeMap(next);
    }
    onSelectStream(undefined);
    onSelectTopic(undefined);
    onSelectDm(ids);
    onMode("dm");
  };

  /* -------- topics filter -------- */
  const [topicQ, setTopicQ] = useState("");
  useEffect(() => {
    if (mode === "topics") setTopicQ("");
  }, [mode]);
  const shownTopics = useMemo(() => {
    const needle = topicQ.trim().toLowerCase();
    if (!needle) return topics;
    return topics.filter((t) => t.name.toLowerCase().includes(needle));
  }, [topics, topicQ]);

  const now = Date.now();

  return (
    <div className="min-h-0 min-w-0 h-full w-80 overflow-hidden flex flex-col gap-3 p-3">
      {/* -------------------- DMs -------------------- */}
      <GlassCard className="px-3 py-2 shrink-0">
        <div className="px-1 pb-2 text-xs uppercase tracking-wide text-white/60">Recent DMs</div>
        <div className="px-1 pb-2">
          <input
            value={dmSearch}
            onChange={(e) => setDmSearch(e.target.value)}
            placeholder="Search people…"
            className="w-full rounded-lg bg-white/5 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-white/20"
          />
        </div>

        <ScrollArea className="max-h-56 pr-2">
          <div className="flex flex-col gap-1.5">
            {filteredThreads.map((t) => {
              const isGroup = t.userIds.length > 1;

              // 1:1 — the other user
              const otherId = !isGroup ? t.userIds[0] : undefined;
              const other = otherId ? users[otherId] : undefined;
              const otherPresence = other ? derivePresence(other, now) : "offline";

              // avatars (avoid empty src)
              const singleAvatar = otherId ? toProxy(`/avatar/${otherId}`) : undefined;
              const groupAvatars = isGroup
                ? t.userIds.slice(0, 2).map((id) => toProxy(`/avatar/${id}`))
                : [];

              // group presence roll-up
              let groupPresence: Presence = "offline";
              if (isGroup) {
                const presences = t.userIds.map((id) => derivePresence(users[id] || {}, now));
                if (presences.includes("active")) groupPresence = "active";
                else if (presences.includes("away")) groupPresence = "away";
              }

              const bkey = keyOf(t.userIds);

              return (
                <button
                  key={t.key || bkey}
                  className="group relative flex items-center gap-2 rounded-xl px-2 py-1.5 text-left hover:bg-white/10"
                  onClick={() => openDm(t.userIds)}
                >
                  {!isGroup ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {singleAvatar ? (
                        <img
                          src={singleAvatar}
                          alt={t.names.join(", ")}
                          loading="lazy"
                          className="h-6 w-6 rounded-full object-cover border border-white/10 flex-none"
                          onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")}
                        />
                      ) : (
                        <div className="h-6 w-6 rounded-full bg-white/10 border border-white/10" />
                      )}
                      <span
                        className={`absolute left-6 top-2 h-2.5 w-2.5 rounded-full ring-2 ring-zinc-900 ${presenceClass(
                          otherPresence
                        )}`}
                        aria-hidden
                      />
                    </>
                  ) : (
                    <div className="relative h-6 w-6">
                      <div className="absolute right-0 top-0 h-4.5 w-4.5 rounded-full overflow-hidden border border-white/10 bg-white/10">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {groupAvatars[0] ? (
                          <img
                            src={groupAvatars[0]}
                            alt=""
                            loading="lazy"
                            className="h-full w-full object-cover"
                            onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")}
                          />
                        ) : null}
                      </div>
                      <div className="absolute left-0 bottom-0 h-4.5 w-4.5 rounded-full overflow-hidden border border-white/10 bg-white/10">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {groupAvatars[1] ? (
                          <img
                            src={groupAvatars[1]}
                            alt=""
                            loading="lazy"
                            className="h-full w-full object-cover"
                            onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")}
                          />
                        ) : null}
                      </div>
                      {/* roll-up presence dot */}
                      <span
                        className={`absolute -right-0 -bottom-0 h-2.5 w-2.5 rounded-full ring-2 ring-zinc-900 ${presenceClass(
                          groupPresence
                        )}`}
                        aria-hidden
                      />
                    </div>
                  )}

                  <div className="min-w-0">
                    <div className="truncate text-sm">
                      {t.names.join(", ")}{" "}
                      {badge[bkey] ? (
                        <span className="ml-1 rounded-md bg-cyan-600/80 px-1.5 py-[1px] text-[10px] font-semibold text-white align-middle">
                          {badge[bkey]}
                        </span>
                      ) : null}
                    </div>
                    <div className="truncate text-xs text-white/55">{t.lastExcerpt}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </ScrollArea>
      </GlassCard>

      {/* ---------------- Streams / Topics ---------------- */}
      <GlassCard className="flex-1 min-h-0 overflow-hidden px-3 py-2 flex flex-col">
        <div className="mb-2 flex items-center justify-between shrink-0">
          <div className="px-1 text-xs uppercase tracking-wide text-white/60">
            {mode === "topics" ? "Topics" : "Streams"}
          </div>
          {mode === "topics" && (
            <button className="icon-btn px-2 py-1 rounded-lg hover:bg-white/10" onClick={() => onMode("streams")}>
              ⟵ Back
            </button>
          )}
        </div>

        {mode === "topics" && (
          <div className="mb-2 px-1 shrink-0">
            <input
              value={topicQ}
              onChange={(e) => setTopicQ(e.target.value)}
              placeholder="Search topics…"
              className="w-full rounded-lg bg-white/5 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-white/20"
            />
          </div>
        )}

        <ScrollArea className="flex-1 min-h-0 pr-2">
          <div className="flex flex-col gap-1.5">
            {(mode === "streams" || mode === "dm") &&
              streams.map((s) => (
                <button
                  key={s.id}
                  className={`rounded-xl px-2 py-1.5 text-left hover:bg-white/10 ${
                    selectedStreamId === s.id ? "bg-white/10" : ""
                  }`}
                  onClick={() => {
                    onSelectStream(s.id);
                    onMode("topics");
                  }}
                >
                  <div className="text-sm font-medium flex items-center gap-2">#{s.name}</div>
                  <div className="text-xs text-white/55">Click to view topics</div>
                </button>
              ))}

            {mode === "topics" &&
              shownTopics.map((t) => (
                <button
                  key={t.id}
                  className="rounded-xl px-2 py-1.5 text-left hover:bg-white/10"
                  onClick={() => onSelectTopic(t.id)}
                >
                  <div className="text-sm truncate">{t.name}</div>
                </button>
              ))}
          </div>
        </ScrollArea>
      </GlassCard>
    </div>
  );
}
