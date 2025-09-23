import GlassCard from "./GlassCard";
import { Input } from "./ui/input";
import { TopicBreadcrumb } from "./TopicBreadcrumb";
import { toProxy } from "@/lib/api";
import { useEffect, useMemo, useState } from "react";
import { Settings } from "lucide-react"; // uses lucide-react; inline SVG fallback shown below if you don't use this lib

type CurrentUser = {
  id?: number;
  name: string;
  email: string;
  avatarUrl?: string; // ideally already proxied by caller
};

/** Safe join for realm-relative URLs; falls back to plain path if base missing */
function realmPath(baseUrl: string | undefined, path: string) {
  if (!baseUrl) return path;
  try {
    return new URL(path, baseUrl).toString();
  } catch {
    return path;
  }
}

/** MD5 hex via WebCrypto (for gravatar); returns undefined if not available */
async function md5Hex(input: string): Promise<string | undefined> {
  try {
    const enc = new TextEncoder().encode(input);
    const digest = await crypto.subtle.digest("MD5", enc);
    const bytes = new Uint8Array(digest);
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return undefined;
  }
}

export default function TopBar({
  titleLeft,
  breadcrumb,
  onStreamClick,
  baseUrl,
  currentUser,
  onOpenSelfDM,
  onLogout,
  onOpenSettings,
  onToggleTheme,
}: {
  titleLeft?: string;
  breadcrumb?: { stream?: string; topic?: string };
  onStreamClick?: () => void;
  baseUrl?: string;
  currentUser?: CurrentUser;
  onOpenSelfDM?: () => void;
  onLogout?: () => void;
  onOpenSettings?: () => void;
  onToggleTheme?: () => void;
}) {
  /* ---------------- Realm logo candidates ---------------- */
  const logoCandidates = useMemo(() => {
    // 1) Prefer a public asset (drop your file into /public). Change the first path if you like.
    const publicAssets = ["/topbar-realm.png", "/logo.png", "/images/realm.png"]; // public/...
    // 2) Fall back to realm-resolved icons (proxied for desktop use)
    const realmAssets = [
      realmPath(baseUrl, "/favicon.ico"),
      realmPath(baseUrl, "/static/favicon.ico"),
      realmPath(baseUrl, "/static/images/logo/zulip.svg"),
      realmPath(baseUrl, "/static/images/logo/zulip-icon-128x128.png"),
    ].map((u) => toProxy(u));
    return [...publicAssets, ...realmAssets];
  }, [baseUrl]);

  const [logoIdx, setLogoIdx] = useState(0);
  const logoSrc = logoCandidates[logoIdx];
  const realmLetter =
    (baseUrl?.replace(/^https?:\/\//, "").trim()[0] || "Z").toUpperCase();

  /* ---------------- (Kept) gravatar derivation; harmless even though we no longer show the avatar in the UI ---------------- */
  const [gravatarUrl, setGravatarUrl] = useState<string | undefined>(undefined);

  useEffect(() => {
    let dead = false;
    (async () => {
      const email = currentUser?.email?.trim().toLowerCase();
      if (!email) return setGravatarUrl(undefined);
      const h = await md5Hex(email);
      if (!dead) {
        setGravatarUrl(h ? `https://www.gravatar.com/avatar/${h}?s=128&d=404` : undefined);
      }
    })();
    return () => {
      dead = true;
    };
  }, [currentUser?.email]);

  const avatarCandidates = useMemo(() => {
    if (!currentUser) return [];
    const list: string[] = [];

    if (currentUser.avatarUrl && currentUser.avatarUrl.trim()) {
      list.push(currentUser.avatarUrl);
    }
    if (currentUser.id != null) {
      list.push(toProxy(`/avatar/${currentUser.id}`));
    }
    if (currentUser.email) {
      list.push(toProxy(`/avatar/${encodeURIComponent(currentUser.email)}`));
    }
    if (gravatarUrl) list.push(gravatarUrl);

    return list;
  }, [currentUser, gravatarUrl]);


  return (
    <GlassCard className="sticky top-0 z-20 mx-3 mt-3 px-4 py-3">
      <div className="flex items-center gap-4">
        {/* LEFT: realm logo + breadcrumb/title */}
        <div className="flex w-1/3 items-center gap-3 truncate text-sm text-white/80">
          <div className="relative h-7 w-7 overflow-hidden rounded-lg bg-white/10 ring-1 ring-white/10 grid place-items-center">
            {/* Prefer public image, then fallbacks */}
            {logoSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoSrc}
                alt="Realm"
                className="h-full w-full object-cover"
                onError={() => {
                  if (logoIdx < logoCandidates.length - 1) {
                    setLogoIdx((i) => i + 1);
                  }
                }}
              />
            ) : null}
            {/* final fallback */}
            {!logoSrc || logoIdx >= logoCandidates.length ? (
              <span className="text-xs font-semibold text-white/80">{realmLetter}</span>
            ) : null}
          </div>

          <button
            className="truncate text-left hover:underline"
            onClick={onStreamClick}
            title="Go to All Streams"
          >
            {titleLeft}
          </button>

          {breadcrumb?.stream ? (
            <TopicBreadcrumb stream={breadcrumb.stream} topic={breadcrumb.topic} />
          ) : null}
        </div>

        {/* CENTER: search */}
        <div className="w-1/2">
          <Input placeholder="Search conversations… (⌘K)" />
        </div>

        {/* RIGHT: settings cog + menu (replaces user avatar icon) */}
        <div className="w-1/3 flex items-center justify-end">
          <div className="relative">
            <details className="group">
              <summary className="list-none cursor-pointer">
                <div
                  className="h-8 w-8 rounded-full border border-white/10 bg-white/10 grid place-items-center hover:bg-white/[0.15] transition"
                  aria-label="Open menu"
                  title="Open menu"
                >
                  <Settings className="h-5 w-5 text-white/85" />
                  {/* If you don't use lucide-react, comment the line above and uncomment the inline SVG below:
                  <svg viewBox="0 0 24 24" className="h-5 w-5 text-white/85" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.69.27 1.18.94 1.18 1.71s-.49 1.44-1.18 1.79Z"/>
                  </svg>
                  */}
                </div>
              </summary>

              <div className="absolute right-0 mt-2 min-w-56 rounded-xl bg-zinc-900/95 p-2 ring-1 ring-white/10 shadow-xl backdrop-blur supports-[backdrop-filter]:bg-zinc-900/80">
                <div className="px-2 py-1.5 text-xs text-white/60">
                  {currentUser?.name || currentUser?.email || "You"}
                </div>
                <button
                  className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-white/10"
                  onClick={onOpenSelfDM}
                >
                  Messages with yourself
                </button>
                <button
                  className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-white/10"
                  onClick={onOpenSettings}
                >
                  Settings
                </button>
                <button
                  className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-white/10"
                  onClick={onToggleTheme}
                >
                  Toggle theme
                </button>
                <div className="my-2 h-px bg-white/10" />
                <button
                  className="w-full rounded-md px-3 py-2 text-left text-sm text-rose-300 hover:bg-white/10"
                  onClick={onLogout}
                >
                  Log out
                </button>
              </div>
            </details>
          </div>
        </div>
      </div>
    </GlassCard>
  );
}
