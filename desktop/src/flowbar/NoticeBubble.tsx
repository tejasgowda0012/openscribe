import React from "react";
import { X } from "lucide-react";
import type { MeetingRecord, MeetingSegment } from "../api/parityTypes";

interface NoticeBubbleProps {
  notice?: string | null;
  isError?: boolean;
  shortMeeting?: MeetingRecord | null;
  onDismissNotice: () => void;
  onInspectNotice?: () => void;
  onResolveShortMeeting: (action: "summarize" | "keep" | "delete") => void;
}

export const NoticeBubble: React.FC<NoticeBubbleProps> = ({
  notice,
  isError = false,
  shortMeeting,
  onDismissNotice,
  onInspectNotice,
  onResolveShortMeeting
}) => {
  if (shortMeeting) {
    const wordCount = shortMeeting.segments.reduce(
      (acc: number, s: MeetingSegment) =>
        acc + s.text.trim().split(/\s+/).filter(Boolean).length,
      0
    );
    return (
      <div
        style={{
          background: "#14171f",
          border: "1px solid rgba(255, 255, 255, 0.12)",
          borderRadius: 12,
          padding: "9px 11px",
          color: "#fffaf0",
          boxShadow: "0 4px 12px rgba(0, 0, 0, 0.4)",
          display: "flex",
          flexDirection: "column",
          gap: 6,
          maxWidth: 280,
          pointerEvents: "auto"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "#f0b864"
            }}
          />
          <span style={{ fontSize: 11.5, fontWeight: 500 }}>
            {wordCount === 0
              ? "That meeting had almost no speech."
              : `That meeting was very short (${wordCount} words).`}
          </span>
        </div>
        <span style={{ fontSize: 11, opacity: 0.65 }}>
          Started by mistake? Summarize only if you need it.
        </span>
        <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
          <button
            onClick={() => onResolveShortMeeting("summarize")}
            style={{
              background: "#f0b864",
              color: "#14171f",
              border: "none",
              borderRadius: 999,
              padding: "3px 9px",
              fontSize: 11,
              fontWeight: 600,
              cursor: "pointer"
            }}
          >
            Summarize
          </button>
          <button
            onClick={() => onResolveShortMeeting("keep")}
            style={{
              background: "rgba(255, 255, 255, 0.1)",
              color: "#fffaf0",
              border: "none",
              borderRadius: 999,
              padding: "3px 9px",
              fontSize: 11,
              fontWeight: 500,
              cursor: "pointer"
            }}
          >
            Keep
          </button>
          <button
            onClick={() => onResolveShortMeeting("delete")}
            style={{
              background: "rgba(255, 99, 102, 0.15)",
              color: "#ff6366",
              border: "none",
              borderRadius: 999,
              padding: "3px 9px",
              fontSize: 11,
              fontWeight: 500,
              cursor: "pointer"
            }}
          >
            Delete
          </button>
        </div>
      </div>
    );
  }

  if (notice) {
    return (
      <div
        onClick={onInspectNotice}
        style={{
          background: "#14171f",
          border: "1px solid rgba(255, 255, 255, 0.12)",
          borderRadius: 11,
          padding: "7px 10px",
          color: "#fffaf0",
          boxShadow: "0 4px 12px rgba(0, 0, 0, 0.4)",
          display: "flex",
          alignItems: "center",
          gap: 8,
          maxWidth: 280,
          cursor: onInspectNotice ? "pointer" : "default",
          pointerEvents: "auto"
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: isError ? "#f0b864" : "#4dd28d",
            flexShrink: 0
          }}
        />
        <span
          style={{
            fontSize: 11.5,
            fontWeight: 500,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            flex: 1
          }}
        >
          {notice}
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDismissNotice();
          }}
          style={{
            background: "transparent",
            border: "none",
            color: "rgba(255, 250, 240, 0.6)",
            cursor: "pointer",
            padding: 2,
            display: "flex",
            alignItems: "center"
          }}
        >
          <X size={12} />
        </button>
      </div>
    );
  }

  return null;
};
