// components/LoginModal.tsx
"use client";

import { useEffect, useState } from "react";
import GlassCard from "./GlassCard";
import { isElectron } from "@/lib/desktopBridge";
import {
  saveCredentialsWeb,
  loginWithApiKey,
  loginWithPassword, // desktop-only
} from "@/lib/api";

type Props = {
  open: boolean;
  onClose?: () => void;
  onSuccess?: (email: string, apiKey: string, baseUrl: string) => void;
  defaultBase?: string;
};

type Method = "apiKey" | "password";

export default function ZulipLoginModal({ open, onClose, onSuccess, defaultBase }: Props) {
  const [method, setMethod] = useState<Method>("apiKey");

  const [email, setEmail] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);

  const [base, setBase] = useState<string>(defaultBase ?? process.env.NEXT_PUBLIC_ZULIP_BASE ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setErr(null);
      setSubmitting(false);
    } else {
      // Prefill from localStorage if available
      const lsBase = localStorage.getItem("zulip.baseUrl");
      const lsEmail = localStorage.getItem("zulip.email");
      if (!base && lsBase) setBase(lsBase);
      if (!email && lsEmail) setEmail(lsEmail);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;

  function normalizeUrl(u: string) {
    let s = (u || "").trim();
    if (!/^https?:\/\//i.test(s)) s = "https://" + s;
    s = s.replace(/^(https?:\/\/)\s*(?=https?:\/\/)/i, "");
    s = s.replace(/^(https?:)\/{2,}/i, "$1//");
    s = s.replace(/\/+$/, "");
    return s;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setErr(null);

    const emailTrim = email.trim();
    const baseUrl = normalizeUrl(base);

    try {
      if (method === "apiKey") {
        const apiKeyTrim = apiKey.trim();
        if (!apiKeyTrim) throw new Error("API key is required.");

        // Web: set cookies so Next.js API routes work in web/desktop renderer.
        await saveCredentialsWeb(emailTrim, apiKeyTrim, baseUrl);

        // Desktop: also store creds via Electron IPC for API calls/proxy auth.
        if (isElectron) {
          await loginWithApiKey({ email: emailTrim, apiKey: apiKeyTrim, baseUrl });
          localStorage.setItem("zulip_base", baseUrl);
          localStorage.setItem("zulip_email", emailTrim);
        }

        // Convenience prefill
        localStorage.setItem("zulip.baseUrl", baseUrl);
        localStorage.setItem("zulip.email", emailTrim);

        onSuccess?.(emailTrim, apiKeyTrim, baseUrl);
      } else {
        // Password login — desktop only (establishes Zulip session cookie for assets).
        if (!isElectron) throw new Error("Password login is only available in the desktop app.");
        if (!password) throw new Error("Password is required.");

        await loginWithPassword({ email: emailTrim, password, baseUrl });

        // Convenience prefill (we don't store the password)
        localStorage.setItem("zulip.baseUrl", baseUrl);
        localStorage.setItem("zulip.email", emailTrim);

        // API key may be blank here; images will work via session cookie.
        onSuccess?.(emailTrim, "", baseUrl);
      }

      onClose?.();
    } catch (error: any) {
      setErr(String(error?.message || error));
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit =
    method === "apiKey"
      ? !!email && !!apiKey && !!base
      : !!email && !!password && !!base;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <GlassCard className="w-[640px] max-w-[92vw] p-6">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Login to Zulip</h2>

          {/* Switcher */}
          <div className="flex items-center gap-2 rounded-xl bg-white/5 p-1 ring-1 ring-white/10">
            <button
              type="button"
              onClick={() => setMethod("apiKey")}
              className={`rounded-lg px-3 py-1 text-xs font-medium ${
                method === "apiKey" ? "bg-white/10" : "hover:bg-white/10"
              }`}
              disabled={submitting}
            >
              API key
            </button>
            <button
              type="button"
              onClick={() => setMethod("password")}
              className={`rounded-lg px-3 py-1 text-xs font-medium ${
                method === "password" ? "bg-white/10" : "hover:bg-white/10"
              }`}
              disabled={submitting}
              title={isElectron ? "" : "Desktop only"}
            >
              Password
            </button>
          </div>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email…"
            type="email"
            autoFocus
            className="w-full rounded-xl bg-white/5 px-4 py-3 outline-none ring-1 ring-white/10 focus:ring-white/20"
          />

          {method === "apiKey" ? (
            <input
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="API key…"
              type="password"
              className="w-full rounded-xl bg-white/5 px-4 py-3 outline-none ring-1 ring-white/10 focus:ring-white/20"
            />
          ) : (
            <div className="relative">
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password…"
                type={showPw ? "text" : "password"}
                className="w-full rounded-xl bg-white/5 px-4 py-3 pr-12 outline-none ring-1 ring-white/10 focus:ring-white/20"
              />
              <button
                type="button"
                onClick={() => setShowPw((s) => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-xs ring-1 ring-white/10 hover:bg-white/10"
                tabIndex={-1}
              >
                {showPw ? "Hide" : "Show"}
              </button>
              {isElectron ? (
                <p className="mt-1 text-xs text-white/60">
                  Desktop only: creates a Zulip session cookie for images/uploads. Your password is not stored.
                </p>
              ) : (
                <p className="mt-1 text-xs text-amber-400">
                  Password login requires the desktop app.
                </p>
              )}
            </div>
          )}

          <input
            value={base}
            onChange={(e) => setBase(e.target.value)}
            placeholder="https://zulip.example.com"
            className="w-full rounded-xl bg-white/5 px-4 py-3 outline-none ring-1 ring-white/10 focus:ring-white/20"
          />

          {err && <div className="text-sm text-red-400">{err}</div>}

          <div className="mt-4 flex items-center justify-between">
            <div className="text-xs text-white/50">
              {method === "apiKey"
                ? "We’ll store your API key in the OS keychain (desktop) and a secure cookie (web)."
                : "We only keep the session cookie; your password is never stored."}
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                className="rounded-xl px-4 py-2 text-sm ring-1 ring-white/10 hover:bg-white/10"
                onClick={onClose}
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-xl bg-cyan-600 px-5 py-2 text-sm font-semibold text-white hover:bg-cyan-500 disabled:opacity-60"
                disabled={submitting || !canSubmit}
              >
                {submitting ? "Signing in…" : method === "apiKey" ? "Login with API key" : "Login with Password"}
              </button>
            </div>
          </div>
        </form>
      </GlassCard>
    </div>
  );
}
