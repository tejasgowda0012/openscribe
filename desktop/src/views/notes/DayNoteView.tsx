import React, { useEffect, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import {
  Calendar as CalendarIcon,
  Camera,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  ExternalLink,
  FileText,
  Mic,
  Pin,
  Plus,
  Trash2,
  Users
} from "lucide-react";
import {
  addCapture,
  attachmentPath,
  deleteNote,
  removeCapture,
  saveNote,
  takeScreenshot,
  updateCapture
} from "../../api/parity";
import type {
  NoteCapture,
  NoteCaptureKind,
  VoiceNote
} from "../../api/parityTypes";
import { formatDuration } from "../meetings/transcriptHelpers";
import { reportUiError, sendIntent } from "../../workspaceEvents";

interface DayNoteViewProps {
  note: VoiceNote;
  isToday: boolean;
  onUpdate: (updated: VoiceNote) => Promise<void>;
  onRefresh: () => Promise<void>;
  onDeleteNote: (id: string) => void;
  onOpenMeeting?: (meetingId: string) => void;
  onStartDictation?: () => void;
  onStartMeeting?: () => void;
}

export const DayNoteView: React.FC<DayNoteViewProps> = ({
  note,
  isToday,
  onUpdate,
  onRefresh,
  onDeleteNote,
  onOpenMeeting,
  onStartDictation,
  onStartMeeting
}) => {
  const [composer, setComposer] = useState("");
  const [screenshotUrls, setScreenshotUrls] = useState<Record<string, string>>({});
  const [expandedOcr, setExpandedOcr] = useState<Record<string, boolean>>({});
  const [showOriginal, setShowOriginal] = useState<Record<string, boolean>>({});
  const [screenshotDropdown, setScreenshotDropdown] = useState(false);

  const captures = note.captures ?? [];

  useEffect(() => {
    // Resolve attachment paths
    captures.forEach((c) => {
      if (c.attachment && !screenshotUrls[c.attachment]) {
        attachmentPath(c.attachment)
          .then((p) => {
            setScreenshotUrls((prev) => ({
              ...prev,
              [c.attachment!]: convertFileSrc(p)
            }));
          })
          .catch(() => undefined);
      }
    });
  }, [captures]);

  const handleAddThought = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = composer.trim();
    if (!text) return;

    const newCapture: NoteCapture = {
      id: crypto.randomUUID().toUpperCase(),
      createdAt: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
      title: "Written note",
      rawText: text,
      text: text,
      duration: 0,
      kind: "text"
    };

    try {
      await addCapture(newCapture);
      await onRefresh();
      setComposer("");
    } catch (error) {
      reportUiError(error);
    }
  };

  const handleTakeScreenshot = async (kind: "area" | "window" | "screen") => {
    setScreenshotDropdown(false);
    try {
      await sendIntent({ action: "screenshot", kind });
    } catch (err) {
      reportUiError(err);
    }
  };

  const handleDeleteEntry = async (captureId: string) => {
    try {
      await removeCapture(captureId, note.id);
      await onRefresh();
    } catch (error) {
      reportUiError(error);
    }
  };

  const handleTogglePin = async () => {
    const updated = { ...note, isPinned: !note.isPinned };
    try { await onUpdate(updated); } catch (error) { reportUiError(error); }
  };

  const handleCopyMarkdown = () => {
    let md = `# ${note.title || "Daily Note"}\n\n`;
    captures.forEach((c) => {
      const time = new Date(c.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      md += `### ${time} · ${c.kind.toUpperCase()}\n`;
      if (c.text) md += `${c.text}\n\n`;
      if (c.recognizedText) md += `*OCR text:* ${c.recognizedText}\n\n`;
    });
    navigator.clipboard.writeText(md).catch(console.error);
  };

  const dateObj = new Date(note.createdAt);
  const formattedDate = dateObj.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric"
  });

  const dictationCount = captures.filter((c) => c.kind === "dictation").length;
  const screenshotCount = captures.filter((c) => c.kind === "screenshot").length;
  const meetingCount = captures.filter((c) => c.kind === "meeting").length;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflowY: "auto", padding: "28px 36px" }}>
      {/* Top Toolbar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div style={{ fontSize: 12, color: "#6b7280" }}>
          {[
            dictationCount ? `${dictationCount} dictation${dictationCount > 1 ? "s" : ""}` : null,
            screenshotCount ? `${screenshotCount} screenshot${screenshotCount > 1 ? "s" : ""}` : null,
            meetingCount ? `${meetingCount} meeting${meetingCount > 1 ? "s" : ""}` : null
          ].filter(Boolean).join(" · ") || "Empty day"}
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={handleTogglePin}
            title={note.isPinned ? "Unpin day" : "Pin day"}
            style={{
              background: "transparent",
              border: "1px solid rgba(0,0,0,0.1)",
              borderRadius: 6,
              padding: "5px 8px",
              cursor: "pointer",
              color: note.isPinned ? "#2563eb" : "#4b5563",
              display: "flex",
              alignItems: "center"
            }}
          >
            <Pin size={14} fill={note.isPinned ? "#2563eb" : "none"} />
          </button>
          <button
            onClick={handleCopyMarkdown}
            title="Copy day as Markdown"
            style={{
              background: "transparent",
              border: "1px solid rgba(0,0,0,0.1)",
              borderRadius: 6,
              padding: "5px 8px",
              cursor: "pointer",
              color: "#4b5563",
              display: "flex",
              alignItems: "center",
              gap: 4,
              fontSize: 12
            }}
          >
            <Copy size={13} /> Copy
          </button>
          <button
            onClick={() => onDeleteNote(note.id)}
            title="Delete this day"
            style={{
              background: "transparent",
              border: "1px solid rgba(239, 68, 68, 0.2)",
              borderRadius: 6,
              padding: "5px 8px",
              cursor: "pointer",
              color: "#ef4444",
              display: "flex",
              alignItems: "center"
            }}
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* Date Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: "#2563eb", textTransform: "uppercase" }}>
          {isToday ? "TODAY" : dateObj.getFullYear()}
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: "4px 0 0", letterSpacing: "-0.03em" }}>
          {formattedDate}
        </h1>
      </div>

      {/* Quick Action Bar (if today) */}
      {isToday && (
        <div style={{ display: "flex", gap: 10, marginBottom: 28, position: "relative" }}>
          <button
            onClick={onStartDictation}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: "#ffffff",
              border: "1px solid rgba(0,0,0,0.12)",
              borderRadius: 8,
              padding: "6px 14px",
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
              boxShadow: "0 1px 2px rgba(0,0,0,0.04)"
            }}
          >
            <Mic size={14} color="#2563eb" /> Dictate
          </button>

          <button
            onClick={onStartMeeting}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: "#ffffff",
              border: "1px solid rgba(0,0,0,0.12)",
              borderRadius: 8,
              padding: "6px 14px",
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
              boxShadow: "0 1px 2px rgba(0,0,0,0.04)"
            }}
          >
            <Users size={14} color="#ef4444" /> Meeting
          </button>

          <div style={{ position: "relative" }}>
            <button
              onClick={() => setScreenshotDropdown((prev) => !prev)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                background: "#ffffff",
                border: "1px solid rgba(0,0,0,0.12)",
                borderRadius: 8,
                padding: "6px 14px",
                fontSize: 13,
                fontWeight: 500,
                cursor: "pointer",
                boxShadow: "0 1px 2px rgba(0,0,0,0.04)"
              }}
            >
              <Camera size={14} color="#2563eb" /> Screenshot <ChevronDown size={12} />
            </button>

            {screenshotDropdown && (
              <div
                style={{
                  position: "absolute",
                  top: 36,
                  left: 0,
                  background: "#ffffff",
                  border: "1px solid rgba(0,0,0,0.12)",
                  borderRadius: 8,
                  padding: 4,
                  display: "flex",
                  flexDirection: "column",
                  gap: 2,
                  width: 160,
                  zIndex: 50,
                  boxShadow: "0 6px 16px rgba(0,0,0,0.1)"
                }}
              >
                <button
                  onClick={() => handleTakeScreenshot("area")}
                  style={{
                    background: "transparent",
                    border: "none",
                    padding: "6px 10px",
                    textAlign: "left",
                    fontSize: 12,
                    cursor: "pointer",
                    borderRadius: 4
                  }}
                >
                  Area screenshot
                </button>
                <button
                  onClick={() => handleTakeScreenshot("window")}
                  style={{
                    background: "transparent",
                    border: "none",
                    padding: "6px 10px",
                    textAlign: "left",
                    fontSize: 12,
                    cursor: "pointer",
                    borderRadius: 4
                  }}
                >
                  Window screenshot
                </button>
                <button
                  onClick={() => handleTakeScreenshot("screen")}
                  style={{
                    background: "transparent",
                    border: "none",
                    padding: "6px 10px",
                    textAlign: "left",
                    fontSize: 12,
                    cursor: "pointer",
                    borderRadius: 4
                  }}
                >
                  Screen screenshot
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Timeline Entries */}
      <div style={{ display: "flex", flexDirection: "column", gap: 20, marginBottom: 30 }}>
        {captures.length === 0 ? (
          <div style={{ color: "#9ca3af", fontSize: 13.5, fontStyle: "italic", padding: "12px 0" }}>
            {isToday
              ? "Your day starts here. Dictations, screenshots, and meetings land here as they happen."
              : "Nothing was captured this day."}
          </div>
        ) : (
          captures.map((entry, index) => {
            const timeStr = new Date(entry.createdAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit"
            });
            const hasRawDiff = entry.rawText && entry.rawText !== entry.text;
            const showingRaw = showOriginal[entry.id];

            return (
              <div
                key={entry.id}
                style={{
                  display: "flex",
                  gap: 16,
                  alignItems: "flex-start",
                  position: "relative"
                }}
              >
                {/* Time column */}
                <div
                  style={{
                    width: 52,
                    textAlign: "right",
                    fontSize: 11,
                    fontFamily: "monospace",
                    color: "#9ca3af",
                    paddingTop: 3
                  }}
                >
                  {timeStr}
                </div>

                {/* Bullet Icon */}
                <div
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: "50%",
                    background:
                      entry.kind === "meeting"
                        ? "rgba(239, 68, 68, 0.12)"
                        : "rgba(37, 99, 235, 0.12)",
                    color: entry.kind === "meeting" ? "#ef4444" : "#2563eb",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0
                  }}
                >
                  {entry.kind === "dictation" && <Mic size={12} />}
                  {entry.kind === "screenshot" && <Camera size={12} />}
                  {entry.kind === "meeting" && <Users size={12} />}
                  {entry.kind === "text" && <FileText size={12} />}
                </div>

                {/* Entry Content */}
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                  {entry.kind === "screenshot" ? (
                    <div>
                      {entry.attachment && screenshotUrls[entry.attachment] && (
                        <img
                          src={screenshotUrls[entry.attachment]}
                          alt="Screenshot capture"
                          style={{
                            maxWidth: 360,
                            maxHeight: 220,
                            borderRadius: 8,
                            border: "1px solid rgba(0,0,0,0.1)",
                            display: "block",
                            marginBottom: 6
                          }}
                        />
                      )}
                      {entry.recognizedText && (
                        <div style={{ marginTop: 4 }}>
                          <button
                            onClick={() =>
                              setExpandedOcr((prev) => ({
                                ...prev,
                                [entry.id]: !prev[entry.id]
                              }))
                            }
                            style={{
                              background: "transparent",
                              border: "none",
                              fontSize: 11.5,
                              color: "#2563eb",
                              cursor: "pointer",
                              padding: 0,
                              display: "flex",
                              alignItems: "center",
                              gap: 3
                            }}
                          >
                            <ChevronRight
                              size={12}
                              style={{
                                transform: expandedOcr[entry.id] ? "rotate(90deg)" : "none"
                              }}
                            />
                            {expandedOcr[entry.id] ? "Hide image text" : "Searchable text in image"}
                          </button>
                          {expandedOcr[entry.id] && (
                            <p
                              style={{
                                fontSize: 12.5,
                                background: "rgba(0,0,0,0.03)",
                                padding: "8px 10px",
                                borderRadius: 6,
                                marginTop: 4,
                                color: "#4b5563"
                              }}
                            >
                              {entry.recognizedText}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  ) : entry.kind === "meeting" ? (
                    <div
                      style={{
                        background: "#ffffff",
                        border: "1px solid rgba(0,0,0,0.1)",
                        borderRadius: 10,
                        padding: "10px 14px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        maxWidth: 420
                      }}
                    >
                      <div>
                        <strong style={{ fontSize: 13, display: "block" }}>
                          {entry.title || "Meeting"}
                        </strong>
                        <span style={{ fontSize: 11.5, color: "#6b7280" }}>
                          {entry.duration > 0 ? formatDuration(entry.duration) : "Meeting record"}
                        </span>
                      </div>
                      {entry.meetingID && onOpenMeeting && (
                        <button
                          onClick={() => onOpenMeeting(entry.meetingID!)}
                          style={{
                            background: "transparent",
                            border: "1px solid rgba(0,0,0,0.1)",
                            borderRadius: 6,
                            padding: "4px 8px",
                            fontSize: 11,
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            gap: 4
                          }}
                        >
                          Open <ExternalLink size={11} />
                        </button>
                      )}
                    </div>
                  ) : (
                    <div style={{ fontSize: 14.5, lineHeight: 1.6, color: "#181a1f" }}>
                      {showingRaw ? entry.rawText : entry.text}
                    </div>
                  )}

                  {/* Metadata & Actions */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      fontSize: 11,
                      color: "#9ca3af"
                    }}
                  >
                    <span>
                      {entry.sourceApplication
                        ? `${entry.sourceApplication} · `
                        : ""}
                      {entry.kind === "dictation" && entry.duration > 0
                        ? formatDuration(entry.duration)
                        : entry.kind}
                    </span>

                    {hasRawDiff && (
                      <button
                        onClick={() =>
                          setShowOriginal((prev) => ({
                            ...prev,
                            [entry.id]: !prev[entry.id]
                          }))
                        }
                        style={{
                          background: "transparent",
                          border: "none",
                          color: "#2563eb",
                          cursor: "pointer",
                          padding: 0,
                          fontSize: 11
                        }}
                      >
                        {showingRaw ? "Show edited" : "Show original"}
                      </button>
                    )}

                    <button
                      onClick={() => navigator.clipboard.writeText(entry.text || entry.rawText)}
                      title="Copy text"
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "#9ca3af",
                        cursor: "pointer",
                        padding: 0
                      }}
                    >
                      <Copy size={11} />
                    </button>

                    <button
                      onClick={() => handleDeleteEntry(entry.id)}
                      title="Delete entry"
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "#ef4444",
                        cursor: "pointer",
                        padding: 0
                      }}
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Composer at Bottom */}
      <form onSubmit={handleAddThought} style={{ display: "flex", gap: 10, marginTop: "auto" }}>
        <input
          type="text"
          value={composer}
          onChange={(e) => setComposer(e.target.value)}
          placeholder={isToday ? "Write a thought… (Press Enter to add)" : "Add to this day…"}
          style={{
            flex: 1,
            padding: "10px 14px",
            borderRadius: 8,
            border: "1px solid rgba(0,0,0,0.15)",
            background: "#ffffff",
            fontSize: 14,
            outline: "none"
          }}
        />
        <button
          type="submit"
          disabled={!composer.trim()}
          style={{
            background: "#2563eb",
            color: "#ffffff",
            border: "none",
            borderRadius: 8,
            padding: "0 16px",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            opacity: composer.trim() ? 1 : 0.5
          }}
        >
          Add
        </button>
      </form>
    </div>
  );
};
