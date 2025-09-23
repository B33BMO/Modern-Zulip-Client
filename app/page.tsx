"use client";

import { useEffect, useMemo, useState } from "react";
import TopBar from "@/components/TopBar";
import LeftSidebar from "@/components/LeftSidebar";
import MessageList from "@/components/MessageList";
import RightSidebar from "@/components/RightSidebar";
import Composer from "@/components/Composer";
import LoginModal from "@/components/LoginModal";
import { isElectron } from "@/lib/desktopBridge";
import {
  apiStreams,
  apiTopics,
  apiUsers,
  saveCredentialsWeb,
  loginWithApiKey,
  toProxy, // proxy avatar/logo URLs when needed
} from "@/lib/api";
import type { Stream, Topic, User } from "@/lib/api";

type MeLite = { id?: number; name: string; email: string; avatarUrl?: string };
type Theme = "dark" | "light";

export default function Page() {
  const [mode, setMode] = useState<"streams" | "topics" | "dm">("streams");
  const [authReady, setAuthReady] = useState(false);
  const [showLogin, setShowLogin] = useState(false);

  const [streams, setStreams] = useState<Stream[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [users, setUsers] = useState<User[]>([]);

  const [selectedStreamId, setSelectedStreamId] = useState<number | undefined>();
  const [selectedTopicId, setSelectedTopicId] = useState<number | undefined>();
  const [dmUserIds, setDmUserIds] = useState<number[] | undefined>();

  const [refreshKey, setRefreshKey] = useState(0);
  const [authCheck, setAuthCheck] = useState<0 | 1 | 2 | 3>(0);

  // current user for TopBar
  const [me, setMe] = useState<MeLite | undefined>(undefined);

  // theme state
  const [theme, setTheme] = useState<Theme>("dark");

  /* ---------- theme helpers ---------- */
  const applyTheme = (t: Theme) => {
    const root = document.documentElement;
    if (t === "light") root.setAttribute("data-theme", "light");
    else root.removeAttribute("data-theme"); // dark = default (no attr)
  };

  // on first load: saved preference or system preference
  useEffect(() => {
    const stored = (typeof window !== "undefined"
      ? (localStorage.getItem("theme") as Theme | null)
      : null) as Theme | null;

    const initial: Theme =
      stored ??
      (window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: light)").matches
        ? "light"
        : "dark");

    setTheme(initial);
    applyTheme(initial);
  }, []);

  const handleToggleTheme = () => {
    const next: Theme = theme === "light" ? "dark" : "light";
    setTheme(next);
    try {
      localStorage.setItem("theme", next);
    } catch {}
    applyTheme(next);
  };

  /* ---------- auth check (web cookies) ---------- */
  useEffect(() => {
    let cancelled = false;
    setAuthCheck(1);
    (async () => {
      try {
        const res = await fetch("/api/auth/zulip", { cache: "no-store" });
        const ok = res.ok && (await res.json()).configured;
        if (!cancelled) {
          setAuthReady(!!ok);
          setShowLogin(!ok);
          setAuthCheck(ok ? 2 : 3);
        }
      } catch {
        if (!cancelled) {
          setAuthReady(false);
          setShowLogin(true);
          setAuthCheck(3);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /* ---------- bootstrap data after auth ---------- */
  useEffect(() => {
    if (!authReady) return;
    let dead = false;
    (async () => {
      try {
        const [s, u] = await Promise.all([apiStreams(), apiUsers()]);
        if (!dead) {
          setStreams(s);
          setUsers(u);
        }
      } catch (e) {
        console.error(e);
      }
    })();
    return () => {
      dead = true;
    };
  }, [authReady]);

  /* ---------- load topics when stream selected ---------- */
  useEffect(() => {
    if (!authReady || !selectedStreamId) {
      setTopics([]);
      return;
    }
    let dead = false;
    apiTopics(selectedStreamId)
      .then((ts) => {
        if (!dead) setTopics(ts);
      })
      .catch(console.error);
    return () => {
      dead = true;
    };
  }, [authReady, selectedStreamId]);

  /* ---------- fetch the current user (for avatar in TopBar) ---------- */
  useEffect(() => {
    if (!authReady) return;
    let dead = false;

    (async () => {
      try {
        let meData: any | undefined;

        // Try Zulip 8+ endpoint first
        let r = await fetch("/api/zulip/get-own-user", { cache: "no-store" });
        if (r.ok) {
          const d = await r.json();
          meData = d.user ?? d;
        } else if (r.status !== 404) {
          throw new Error(`get-own-user ${r.status}`);
        }

        // Fallback 1: users/me
        if (!meData) {
          r = await fetch("/api/zulip/users/me", { cache: "no-store" });
          if (r.ok) {
            meData = await r.json();
          } else if (r.status !== 404) {
            throw new Error(`me ${r.status}`);
          }
        }

        // Fallback 2: list users and pick by stored email
        if (!meData) {
          const selfEmail =
            (typeof window !== "undefined" && localStorage.getItem("zulip_email")) || "";
          if (!selfEmail) throw new Error("no self email in storage");

          const ru = await fetch("/api/zulip/users", { cache: "no-store" });
          if (!ru.ok) throw new Error(`users ${ru.status}`);
          const list = await ru.json(); // { users: [...] }
          const mine = (list.users || list.members || []).find(
            (u: any) => (u.email || "").toLowerCase() === selfEmail.toLowerCase()
          );
          if (mine) {
            meData = {
              user_id: mine.id,
              full_name: mine.name,
              email: mine.email,
              avatar_url: mine.avatarUrl, // already proxied by backend
            };
          }
        }

        if (!meData) throw new Error("could not resolve current user");

        const id: number | undefined = meData.user_id ?? meData.id ?? undefined;
        const name: string = meData.full_name ?? meData.name ?? "";
        const email: string = meData.email ?? "";
        const raw = meData.avatar_url as string | undefined;
        const avatarUrl = raw ? (raw.startsWith("app-proxy://") ? raw : toProxy(raw)) : undefined;

        if (!dead) {
          setMe({ id, name, email, avatarUrl });
          if (email) localStorage.setItem("zulip_email", email);
        }
      } catch (e) {
        console.warn("Failed to load current user:", e);
      }
    })();

    return () => {
      dead = true;
    };
  }, [authReady]);

  /* ---------- derived labels ---------- */
  const streamName = useMemo(
    () => streams.find((s) => s.id === selectedStreamId)?.name,
    [streams, selectedStreamId]
  );
  const topicName = useMemo(
    () => topics.find((t) => t.id === selectedTopicId)?.name,
    [topics, selectedTopicId]
  );
  const dmNames = useMemo(
    () =>
      dmUserIds ? users.filter((u) => dmUserIds.includes(u.id)).map((u) => u.name) : [],
    [users, dmUserIds]
  );

  const titleLeft =
    dmUserIds?.length ? "Direct message" : topicName || streamName || "All Streams";

  /* ---------- realm + self for TopBar ---------- */
  const baseUrl =
    (typeof window !== "undefined" && localStorage.getItem("zulip_base")) || undefined;

  /* ---------- helpers ---------- */
  const goHome = () => {
    setSelectedTopicId(undefined);
    setSelectedStreamId(undefined);
    setDmUserIds(undefined);
    setMode("streams");
  };

  const handleLoggedIn = async (email?: string, apiKey?: string, base?: string) => {
    try {
      if (email && apiKey && base) {
        await saveCredentialsWeb(email, apiKey, base);

        // Always store for TopBar/logo (web & desktop)
        localStorage.setItem("zulip_base", base);
        localStorage.setItem("zulip_email", email);

        if (isElectron) {
          await loginWithApiKey({ email, apiKey, baseUrl: base });
        }
      }

      const chk = await fetch("/api/auth/zulip", { cache: "no-store" })
        .then((r) => r.json())
        .catch(() => ({ configured: false }));

      setAuthReady(!!chk.configured);
      setShowLogin(!chk.configured);

      if (chk.configured) {
        const [s, u] = await Promise.all([apiStreams(), apiUsers()]);
        setStreams(s);
        setUsers(u);
      }
    } catch (e) {
      console.error("Login flow failed:", e);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/zulip", { method: "DELETE" }).catch(() => {});
    } finally {
      if (typeof window !== "undefined") {
        localStorage.removeItem("zulip_base");
        localStorage.removeItem("zulip_email");
        window.location.reload();
      }
    }
  };

  /* ---------- loading screen while checking ---------- */
  if (authCheck === 0 || authCheck === 1) {
    return (
      <div className="grid h-dvh place-items-center text-white/70">
        <div className="text-sm">Preparing…</div>
      </div>
    );
  }

  return (
    <div className="grid h-dvh grid-rows-[auto_minmax(0,1fr)]">
      <TopBar
        titleLeft={titleLeft}
        breadcrumb={{ stream: streamName, topic: topicName }}
        onStreamClick={goHome}
        baseUrl={baseUrl}
        currentUser={
          me
            ? { id: me.id, name: me.name, email: me.email, avatarUrl: me.avatarUrl }
            : undefined
        }
        onOpenSelfDM={() => {
          if (me?.id != null) {
            setDmUserIds([me.id]);
            setSelectedStreamId(undefined);
            setSelectedTopicId(undefined);
            setMode("dm");
          }
        }}
        onLogout={handleLogout}
        onToggleTheme={handleToggleTheme} // ✅ wired to global theme toggle
      />

      <main className="grid min-h-0 min-w-0 grid-cols-[20rem_minmax(0,1fr)_20rem]">
        {/* LEFT */}
        {authReady ? (
          <LeftSidebar
            mode={mode}
            onMode={setMode}
            onSelectStream={(id) => {
              setSelectedStreamId(id);
              setSelectedTopicId(undefined);
              setDmUserIds(undefined);
            }}
            onSelectTopic={(id) => setSelectedTopicId(id)}
            onSelectDm={(ids) => {
              setDmUserIds(ids);
              setSelectedStreamId(undefined);
              setSelectedTopicId(undefined);
              setMode("dm");
            }}
            selectedStreamId={selectedStreamId}
            streams={streams}
            topics={topics.filter((t) => t.streamId === selectedStreamId)}
            currentDmUserIds={dmUserIds}
          />
        ) : (
          <div />
        )}

        {/* CENTER */}
        <div className="grid min-h-0 min-w-0 grid-rows-[minmax(0,1fr)_auto]">
          <div className="min-h-0 min-w-0">
            {authReady && (
              <MessageList
                key={authReady ? "authed" : "not-authed"}
                streamName={streamName}
                topicName={topicName}
                dmUserIds={dmUserIds}
                refreshKey={refreshKey}
              />
            )}
          </div>

          <div className="border-t border-white/10">
            {authReady && (
              <Composer
                streamName={streamName}
                topicName={topicName}
                dmUserIds={dmUserIds}
                dmNames={dmNames}
                onSent={() => setRefreshKey((k) => k + 1)}
              />
            )}
          </div>
        </div>

        {/* RIGHT */}
        <RightSidebar
          users={users}
          onOpenDm={(ids) => {
            setDmUserIds(ids);
            setSelectedStreamId(undefined);
            setSelectedTopicId(undefined);
            setMode("dm");
          }}
        />
      </main>

      <LoginModal
        open={showLogin}
        onClose={() => setShowLogin(false)}
        onSuccess={handleLoggedIn}
      />
    </div>
  );
}
