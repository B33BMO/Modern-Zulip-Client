import { ChevronRight } from "lucide-react";

export function TopicBreadcrumb({ stream, topic, onStreamClick }: { stream?: string; topic?: string; onStreamClick?: () => void }) {
  return (
    <div className="flex items-center gap-2 text-sm text-white/80">
      {stream ? (
        <button className="hover:underline" onClick={onStreamClick}>{stream}</button>
      ) : (
        <span>All Streams</span>
      )}
      {topic && (
        <>
          <ChevronRight size={16} className="opacity-60" />
          <span className="text-white/90">{topic}</span>
        </>
      )}
    </div>
  );
}
