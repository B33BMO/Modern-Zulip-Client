// components/Composer.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bold, Italic, Code, FileUp, Smile, Link as LinkIcon,
  Strikethrough, ListOrdered, List, Quote, EyeOff, Image as ImageIcon,
  X
} from "lucide-react";

type Props = {
  streamName?: string;
  topicName?: string;
  dmUserIds?: number[];
  dmNames?: string[];
  onSent?: () => void;
};

type Pending = {
  id: string;
  file?: File;
  name: string;
  status: "idle" | "uploading" | "done" | "error";
  uri?: string;           // set when upload completes
  isImage?: boolean;      // quick check from file.type
  previewDataUrl?: string;
  error?: string;
};

function ToolbarIcon({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick?: () => void }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-white/85 hover:bg-white/10 active:scale-[.97]"
      onClick={onClick}
    >
      {icon}
    </button>
  );
}

export default function Composer({ streamName, topicName, dmUserIds, dmNames, onSent }: Props) {
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);
  const [attachments, setAttachments] = useState<Pending[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  const toText = useMemo(() => {
    if (dmUserIds && dmUserIds.length > 0) return dmNames || "Direct message";
    if (streamName && topicName) return `#${streamName} → ${topicName}`;
    if (streamName) return `#${streamName}`;
    return "—";
  }, [dmNames, dmUserIds, streamName, topicName]);

  /* ---------- autosize ---------- */
  const autosize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = Math.min(el.scrollHeight, 240) + "px";
  }, []);
  useEffect(() => { autosize(); }, [content, autosize]);
  useEffect(() => { setContent(""); setAttachments([]); requestAnimationFrame(autosize); }, [streamName, topicName, dmUserIds, autosize]);

  const canSendSomewhere = (dmUserIds?.length ?? 0) > 0 || !!streamName;
  const canSendNow = canSendSomewhere && !sending && content.trim().length > 0;

  /* ---------- upload helpers ---------- */
  const beginUpload = async (file: File) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const isImage = /^image\//.test(file.type);
    const p: Pending = { id, file, name: file.name, status: "uploading", isImage };

    // optional tiny preview
    if (isImage) {
      const reader = new FileReader();
      reader.onload = () =>
        setAttachments(a => a.map(x => x.id === id ? { ...x, previewDataUrl: String(reader.result) } : x));
      reader.readAsDataURL(file);
    }

    setAttachments(a => [...a, p]);

    try {
      const fd = new FormData();
      fd.set("file", file, file.name);
      const res = await fetch("/api/zulip/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok || !data?.uri) {
        const msg = data?.error || `Upload failed (${res.status})`;
        setAttachments(a => a.map(x => x.id === id ? { ...x, status: "error", error: msg } : x));
        return;
      }
      setAttachments(a => a.map(x => x.id === id ? { ...x, status: "done", uri: data.uri } : x));
    } catch (e: any) {
      setAttachments(a => a.map(x => x.id === id ? { ...x, status: "error", error: e?.message || "Upload error" } : x));
    }
  };

  const handleFiles = (files: FileList | File[]) => {
    const list = Array.from(files || []);
    list.forEach(beginUpload);
  };

  // Click to pick
  const fileInputRef = useRef<HTMLInputElement>(null);
  const onPick = () => fileInputRef.current?.click();

  // Drag/drop + paste
  useEffect(() => {
    const el = dropRef.current;
    if (!el) return;

    const prevent = (e: DragEvent) => { e.preventDefault(); e.stopPropagation(); };
    const onDrop = (e: DragEvent) => {
      prevent(e);
      if (e.dataTransfer?.files?.length) handleFiles(e.dataTransfer.files);
    };
    el.addEventListener("dragover", prevent);
    el.addEventListener("dragenter", prevent);
    el.addEventListener("drop", onDrop);
    return () => {
      el.removeEventListener("dragover", prevent);
      el.removeEventListener("dragenter", prevent);
      el.removeEventListener("drop", onDrop);
    };
  }, []);

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (e.clipboardData?.files?.length) handleFiles(e.clipboardData.files);
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, []);

  const removeAttachment = (id: string) =>
    setAttachments(a => a.filter(x => x.id !== id));

  /* ---------- send ---------- */
  async function doSend() {
    if (!canSendNow) return;

    // wait for uploads that are still running
    const pending = attachments.filter(a => a.status === "uploading");
    if (pending.length) {
      // simple UX: block send until uploads complete
      return alert("Please wait for uploads to finish.");
    }

    // Build content with links for completed uploads
// inside doSend(), right before we build finalContent
const lines: string[] = [];
for (const a of attachments) {
  if (a.status !== "done" || !a.uri) continue;

  const uri = encodeURI(a.uri); // handle spaces etc.
  if (a.isImage) {
    // Zulip inline image syntax
    lines.push(`[](${uri})`);
  } else {
    // Regular file link
    const label = a.name || "file";
    lines.push(`[${label}](${uri})`);
  }
}

    const finalContent =
      [content.trim(), ...lines].filter(Boolean).join("\n\n");

    setSending(true);
    try {
      const res = await fetch("/api/zulip/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: finalContent,
          streamName,
          topic: topicName,
          dmUserIds,
        }),
      });
      const data = await res.json();
      if (!res.ok || data?.error) throw new Error(data?.error || "Send failed");

      setContent("");
      setAttachments([]);
      onSent?.();
      textareaRef.current?.focus();
    } catch (err) {
      console.error(err);
      alert((err as any)?.message || "Send failed");
    } finally {
      setSending(false);
    }
  }

  // Enter to send; Shift+Enter => newline (IME-aware)
  const isComposing = useRef(false);
  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !isComposing.current) {
      e.preventDefault();
      void doSend();
    }
  };

  // ---- formatting helpers (same as your version) ----
  const applyInline = (before: string, after = before) => {
    const el = textareaRef.current; if (!el) return;
    const { selectionStart, selectionEnd, value } = el;
    const sel = value.slice(selectionStart, selectionEnd) || "";
    const next = value.slice(0, selectionStart) + before + sel + after + value.slice(selectionEnd);
    setContent(next);
    requestAnimationFrame(() => {
      const pos = selectionStart + before.length + sel.length + after.length;
      el.setSelectionRange(pos, pos); el.focus();
    });
  };
  const prefixLines = (prefix: string) => {
    const el = textareaRef.current; if (!el) return;
    const { selectionStart, selectionEnd, value } = el;
    const start = value.lastIndexOf("\n", selectionStart - 1) + 1;
    const end = (value.indexOf("\n", selectionEnd) + 1 || value.length + 1) - 1;
    const block = value.slice(start, end);
    const replaced = block.split("\n").map(l => l.length ? prefix + l : prefix.trimEnd()).join("\n");
    const next = value.slice(0, start) + replaced + value.slice(end);
    setContent(next);
    requestAnimationFrame(() => { el.setSelectionRange(start, start + replaced.length); el.focus(); });
  };
  const orderedList = () => {
    const el = textareaRef.current; if (!el) return;
    const { selectionStart, selectionEnd, value } = el;
    const start = value.lastIndexOf("\n", selectionStart - 1) + 1;
    const end = (value.indexOf("\n", selectionEnd) + 1 || value.length + 1) - 1;
    const block = value.slice(start, end);
    const replaced = block.split("\n").map((l, i) => `${i + 1}. ${l || ""}`).join("\n");
    const next = value.slice(0, start) + replaced + value.slice(end);
    setContent(next);
    requestAnimationFrame(() => { el.setSelectionRange(start, start + replaced.length); el.focus(); });
  };
  const insertLink = () => {
    const url = window.prompt("Link URL:"); if (!url) return;
    const el = textareaRef.current; if (!el) return;
    const { selectionStart, selectionEnd, value } = el;
    const text = value.slice(selectionStart, selectionEnd) || "link";
    const snippet = `[${text}](${url})`;
    const next = value.slice(0, selectionStart) + snippet + value.slice(selectionEnd);
    setContent(next);
    requestAnimationFrame(() => { const pos = selectionStart + snippet.length; el.setSelectionRange(pos, pos); el.focus(); });
  };
  const insertSpoiler = () => prefixLines(">! ");
  const insertEmoji = () => applyInline("🙂", "");

  return (
    <div className="shrink-0 px-3 py-3">
      <div ref={dropRef} className="rounded-2xl border border-white/10 bg-white/5 shadow-sm backdrop-blur">
        {/* To */}
        <div className="border-b border-white/10 px-4 py-2 text-sm text-white/70">
          <span className="mr-2 text-white/50">To:</span>
          <span className="font-medium">{toText}</span>
        </div>

        {/* Input + attachments */}
        <div className="px-4 pt-3 space-y-3">
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-3">
              {attachments.map(a => (
                <div key={a.id} className="relative w-44 rounded-xl border border-white/10 bg-white/5 p-2">
                  <button
                    type="button"
                    className="absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-black/40 hover:bg-black/60"
                    title="Remove"
                    onClick={() => removeAttachment(a.id)}
                  >
                    <X size={14} />
                  </button>

                  {a.previewDataUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.previewDataUrl} alt={a.name} className="h-24 w-full rounded-lg object-cover" />
                  ) : (
                    <div className="h-24 w-full rounded-lg bg-white/10 grid place-items-center text-xs text-white/60">
                      {a.isImage ? "Image" : "File"}
                    </div>
                  )}

                  <div className="mt-2 truncate text-xs">{a.name}</div>
                  <div className="text-[11px] text-white/60">
                    {a.status === "uploading" && "Uploading…"}
                    {a.status === "done" && <span className="text-emerald-400">Uploaded</span>}
                    {a.status === "error" && <span className="text-red-400">Failed: {a.error}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}

          <textarea
            ref={textareaRef}
            className="w-full resize-none bg-transparent outline-none placeholder:text-white/40"
            rows={1}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onInput={autosize}
            onKeyDown={onKeyDown}
            onCompositionStart={() => (isComposing.current = true)}
            onCompositionEnd={() => (isComposing.current = false)}
            placeholder={
              canSendSomewhere
                ? "Write a message…  (Shift+Enter for newline). Drag, paste, or click to add files."
                : "Pick a stream/topic or DM to start…"
            }
            disabled={sending || !canSendSomewhere}
          />

          {/* hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            hidden
            multiple
            onChange={(e) => e.target.files && handleFiles(e.target.files)}
          />
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-1 border-t border-white/10 px-2 py-2 text-white/85">
          <div className="flex flex-wrap items-center gap-1">
            <ToolbarIcon icon={<Code size={18} />} label="Code" onClick={() => applyInline("`")} />
            <ToolbarIcon icon={<Italic size={18} />} label="Italic" onClick={() => applyInline("*")} />
            <ToolbarIcon icon={<Bold size={18} />} label="Bold" onClick={() => applyInline("**")} />
            <ToolbarIcon icon={<FileUp size={18} />} label="Upload" onClick={onPick} />
            <ToolbarIcon icon={<Smile size={18} />} label="Emoji" onClick={insertEmoji} />
            <ToolbarIcon icon={<LinkIcon size={18} />} label="Link" onClick={insertLink} />
            <ToolbarIcon icon={<Strikethrough size={18} />} label="Strike" onClick={() => applyInline("~~")} />
            <ToolbarIcon icon={<ListOrdered size={18} />} label="Numbered" onClick={orderedList} />
            <ToolbarIcon icon={<List size={18} />} label="Bulleted" onClick={() => prefixLines("- ")} />
            <ToolbarIcon icon={<Quote size={18} />} label="Quote" onClick={() => prefixLines("> ")} />
            <ToolbarIcon icon={<EyeOff size={18} />} label="Spoiler" onClick={insertSpoiler} />
            <ToolbarIcon icon={<ImageIcon size={18} />} label="Image" onClick={onPick} />
          </div>

          <div className="ml-auto flex items-center gap-2 pr-2">
            <button
              type="button"
              className="rounded-lg bg-white/20 px-4 py-1.5 text-sm font-medium text-white hover:bg-white/25 disabled:opacity-40"
              onClick={doSend}
              disabled={!canSendNow}
            >
              {sending ? "Sending…" : "Send"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
