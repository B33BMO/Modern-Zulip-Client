"use client";

import GlassCard from "./GlassCard";
import { useEffect, useMemo, useRef, useState } from "react";
import { apiMessages, type UiMessage } from "@/lib/api";

/* ------------- helpers ------------- */
function initialsOf(name?: string) {
  if (!name) return "??";
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "??";
}

const POLL_MS = 4000;          // refresh cadence
const NEAR_BOTTOM_PX = 12;     // “close enough” threshold

type Key = string; // conversation key
const convoKey = (streamName?: string, topicName?: string, dmUserIds?: number[]): Key => {
  if (dmUserIds?.length) return `dm:${dmUserIds.slice().sort((a, b) => a - b).join(",")}`;
  if (streamName && topicName) return `st:${streamName}#${topicName}`;
  if (streamName) return `s:${streamName}`;
  return "all";
};

export default function MessageList({
  streamName,
  topicName,
  dmUserIds,
  refreshKey,
  onReply,
  onQuote,
}: {
  streamName?: string;
  topicName?: string;
  dmUserIds?: number[];
  refreshKey?: number;
  onReply?: (m: UiMessage) => void;
  onQuote?: (m: UiMessage) => void;
}) {
  const [msgs, setMsgs] = useState<UiMessage[]>([]);
  const [loading, setLoading] = useState(false);

  // scroll state
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [pendingNew, setPendingNew] = useState(false);

  // lightbox
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  // jump-once bookkeeping (per conversation)
  const didInitialJump = useRef<Record<Key, boolean>>({});

  const key = convoKey(streamName, topicName, dmUserIds);

  const jumpBottom = () => {
    const el = scrollerRef.current;
    if (!el) return;
    // schedule on next frame so layout is up-to-date
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  };

  const distFromBottom = () => {
    const el = scrollerRef.current;
    if (!el) return Number.POSITIVE_INFINITY;
    return el.scrollHeight - el.scrollTop - el.clientHeight;
  };

  /* First load / selection change */
  useEffect(() => {
    let cancelled = false;
    setPendingNew(false); // reset the pill when switching convos

    const load = async () => {
      setLoading(true);
      try {
        const list = await apiMessages(streamName, topicName, dmUserIds);
        if (cancelled) return;

        setMsgs(list ?? []);

        // Only now (after data is in the DOM) do the first jump for this convo
        if (!didInitialJump.current[key]) {
          didInitialJump.current[key] = true;
          jumpBottom();
        }
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
    // include key so switching convos resets the logic
  }, [key, streamName, topicName, dmUserIds, refreshKey]);

  /* Poll for new messages. If user is near bottom at poll time, jump after update. */
  useEffect(() => {
    let killed = false;
    let timer: any;

    async function poll() {
      try {
        const wasNearBottom = distFromBottom() <= NEAR_BOTTOM_PX;
        const list = await apiMessages(streamName, topicName, dmUserIds);
        if (killed) return;

        const newestBefore = msgs[msgs.length - 1]?.id;
        const newestAfter = list[list.length - 1]?.id;

        if (newestAfter && newestAfter !== newestBefore) {
          if (wasNearBottom) {
            setMsgs(list);
            jumpBottom();
          } else {
            setPendingNew(true);
          }
        }
      } catch (e) {
        console.error("poll error", e);
      } finally {
        if (!killed) timer = setTimeout(poll, POLL_MS);
      }
    }

    timer = setTimeout(poll, POLL_MS);
    return () => {
      killed = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, streamName, topicName, dmUserIds, msgs]);

  /* Make content images gentle (no giant reflows) + if you were at bottom, keep you there after images load */
  useEffect(() => {
    const root = scrollerRef.current;
    if (!root) return;

    const wasNearBottom = distFromBottom() <= NEAR_BOTTOM_PX;

    const imgs = Array.from(root.querySelectorAll<HTMLImageElement>(".msg-content img"));
    for (const img of imgs) {
      img.loading = "lazy";
      img.decoding = "async";
      img.style.display = "block";
      img.style.maxWidth = "100%";
      img.style.height = "auto";
      img.style.objectFit = "contain";
      img.style.maxHeight = "70vh";
      img.style.setProperty("content-visibility", "auto");
      img.style.setProperty("contain-intrinsic-size", "320px 240px");

      if (wasNearBottom && !img.complete) {
        img.addEventListener("load", jumpBottom, { once: true });
      }
    }

    return () => {
      for (const img of imgs) {
        img.removeEventListener("load", jumpBottom);
      }
    };
  }, [msgs]);

  /* Intercept <img> clicks for lightbox */
  useEffect(() => {
    const root = scrollerRef.current;
    if (!root) return;
    const onClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && t.tagName === "IMG") {
        e.preventDefault();
        e.stopPropagation();
        const src = (t as HTMLImageElement).src;
        if (src) setLightboxUrl(src);
      }
    };
    root.addEventListener("click", onClick);
    return () => root.removeEventListener("click", onClick);
  }, []);

  const list = useMemo(() => msgs ?? [], [msgs]);

  return (
    <div className="flex min-h-0 h-full flex-col gap-3 p-3">
      <GlassCard className="relative flex-1 min-h-0 overflow-hidden">
        {/* New messages pill */}
        {pendingNew && (
          <button
            className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full bg-cyan-600/90 px-4 py-1.5 text-sm font-semibold text-white shadow ring-1 ring-white/20 hover:bg-cyan-500"
            onClick={() => {
              setPendingNew(false);
              apiMessages(streamName, topicName, dmUserIds)
                .then((l) => setMsgs(l ?? []))
                .finally(jumpBottom);
            }}
          >
            New messages — jump to latest
          </button>
        )}

        <div
          ref={scrollerRef}
          // Turn OFF native overflow anchoring so the browser won’t snap around
          className="messages-scroller h-full overflow-y-auto px-4 py-3 flex flex-col gap-4 [overscroll-behavior-y:contain] [overflow-anchor:none]"
        >
          {loading && <div className="text-white/60 text-sm">Loading…</div>}

          {list.map((m) => {
            const hasAvatar = !!(m.avatarUrl && m.avatarUrl.trim().length > 0);
            const initials = initialsOf(m.senderName);
            return (
              <div key={m.id} className="group relative flex items-start gap-3">
                {hasAvatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={m.avatarUrl || undefined}
                    alt={m.senderName}
                    className="h-9 w-9 rounded-full object-cover border border-white/10 flex-none"
                  />
                ) : (
                  <div className="h-9 w-9 rounded-full bg-white/10 border border-white/10 flex items-center justify-center text-xs font-medium flex-none">
                    {initials}
                  </div>
                )}

                {/* Hover actions */}
                <div className="pointer-events-none absolute right-2 -top-2 opacity-0 transition-opacity group-hover:opacity-100">
                  <div className="flex gap-2">
                    <button
                      className="pointer-events-auto rounded-md bg-white/10 px-2 py-1 text-[11px] leading-none ring-1 ring-white/15 hover:bg-white/15"
                      onClick={() => onReply?.(m)}
                    >
                      Reply
                    </button>
                    <button
                      className="pointer-events-auto rounded-md bg-white/10 px-2 py-1 text-[11px] leading-none ring-1 ring-white/15 hover:bg-white/15"
                      onClick={() => onQuote?.(m)}
                    >
                      Quote
                    </button>
                  </div>
                </div>

                <div className="min-w-0">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="text-sm font-semibold">{m.senderName}</span>
                    <span className="text-xs text-white/50">
                      {new Date(Number(m.ts)).toLocaleTimeString()}
                    </span>
                  </div>

                  <div
                    className={[
                      "msg-content leading-relaxed text-[15px]",
                      // layout guards
                      "break-words break-anywhere whitespace-pre-wrap",
                      // inline code + blocks
                      "[&_code]:font-mono [&_code]:text-[13px] [&_code]:bg-white/10 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded",
                      "[&_pre]:font-mono [&_pre]:text-[13px] [&_pre]:bg-white/5 [&_pre]:p-3 [&_pre]:rounded-lg [&_pre]:overflow-x-auto",
                      // lists
                      "[&_ul]:list-disc [&_ul]:ml-6 [&_ol]:list-decimal [&_ol]:ml-6 [&_li]:my-1",
                      // quote
                      "[&_blockquote]:border-l [&_blockquote]:border-white/20 [&_blockquote]:pl-3 [&_blockquote]:text-white/80",
                      // images
                      "[&_img]:block [&_img]:max-w-full [&_img]:h-auto [&_img]:rounded-lg [&_img]:border [&_img]:border-white/10",
                      "[&_img]:max-h-[70vh] [&_img]:object-contain",
                      // make <picture> act like a block
                      "[&_picture]:block",
                    ].join(" ")}
                    dangerouslySetInnerHTML={{ __html: m.contentHtml }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </GlassCard>

      {/* Lightbox modal */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
          onClick={() => setLightboxUrl(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightboxUrl} alt="preview" className="max-h-[90%] max-w-[90%] rounded-lg shadow-lg" />
        </div>
      )}
    </div>
  );
}
