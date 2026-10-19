import React, { useEffect, useRef, useState } from "react";
import { getCurrentWindow, Window } from "@tauri-apps/api/window";
import { convertFileSrc } from "@tauri-apps/api/core";
import {
  Camera,
  Check,
  ExternalLink,
  FileText,
  Mic,
  Volume2
} from "lucide-react";
import {
  attachmentPath,
  listMeetings,
  parityEvents,
  takeScreenshot,
  updateMeeting
} from "../api/parity";
import type { MeetingRecord, NoteCapture } from "../api/parityTypes";
import {
  formatDuration,
  formatTimestamp,
  groupTranscriptPassages
} from "../views/meetings/transcriptHelpers";

export const MeetingNotesApp: React.FC = () => {
  const [record, setRecord] = useState<MeetingRecord | null>(null);
  const [tab, setTab] = useState<"notes" | "transcript">("notes");
  const [notes, setNotes] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [screenshotPaths, setScreenshotPaths] = useState<Record<string, string>>({});
  const saveTimeoutRef = useRef<number | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Find active meeting or most recent
    listMeetings().then((all) => {
      const active = all.find((m) => m.status === "recording" || m.status === "paused");
      const target = active ?? all[0] ?? null;
      if (target) {
        setRecord(target);
        setNotes(target.userNotes ?? "");
        setElapsed(target.duration);
      }
    }).catch(console.error);

    const unlistens: Array<() => void> = [];

    parityEvents.onMeetingChanged((updated) => {
      setRecord((curr) => {
        if (!curr || curr.id === updated.id) {
          if (!saveTimeoutRef.current) {
            setNotes(updated.userNotes ?? "");
          }
          setElapsed(updated.duration);
          return updated;
        }
        return curr;
      });
    }).then((u) => unlistens.push(u));

    const interval = window.setInterval(() => {
      setRecord((curr) => {
        if (curr && curr.status === "recording") {
          setElapsed((prev) => prev + 1);
        }
        return curr;
      });
    }, 1000);

    return () => {
      unlistens.forEach((u) => u());
      window.clearInterval(interval);
    };
  }, []);

  // Debounced notes persistence
  const handleNotesChange = (text: string) => {
    setNotes(text);
    if (saveTimeoutRef.current) {
      window.clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = window.setTimeout(() => {
      saveTimeoutRef.current = null;
      if (record) {
        updateMeeting({ ...record, userNotes: text }).catch(console.error);
      }
    }, 400);
  };

  const handleTakeScreenshot = async () => {
    try {
      const cap = await takeScreenshot("area");
      if (cap?.attachment) {
        try {
          const path = await attachmentPath(cap.attachment);
          setScreenshotPaths((prev) => ({ ...prev, [cap.attachment!]: convertFileSrc(path) }));
        } catch {
          // Fallback
        }
      }
    } catch (err) {
      console.warn("Screenshot error:", err);
    }
  };

  const openFullMeeting = async () => {
    try {
      const main = await Window.getByLabel("main");
      if (main) {
        await main.show();
        await main.setFocus();
      }
      // Hide this notes window
      const win = getCurrentWindow();
      await win.hide();
    } catch (err) {
      console.warn(err);
    }
  };

  const handleDone = async () => {
    // Flush notes
    if (saveTimeoutRef.current) {
      window.clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    if (record) {
      await updateMeeting({ ...record, userNotes: notes }).catch(console.error);
    }
    // Closing keeps recording alive! Only hides this floating panel.
    const win = getCurrentWindow();
    await win.hide();
  };

  const passages = record ? groupTranscriptPassages(record.segments) : [];

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100vh",
        background: "#fbf9f4",
        color: "#181a1f",
        fontFamily: "inherit"
      }}
    >
      {/* Header */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 18px",
          borderBottom: "1px solid rgba(0,0,0,0.08)"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: record?.status === "paused" ? "#9ca3af" : "#ff4d4f"
            }}
          />
          <h2
            style={{
              fontSize: 13,
              fontWeight: 600,
              margin: 0,
              maxWidth: 180,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap"
            }}
          >
            {record?.title || "Meeting"}
          </h2>
          <span
            style={{
              fontSize: 12,
              fontFamily: "monospace",
              color: "#6b7280"
            }}
          >
            {record?.status === "paused" ? "Paused · " : ""}
            {formatDuration(elapsed)}
          </span>
        </div>

        <button
          onClick={openFullMeeting}
          title="Open the full meeting in workspace"
          style={{
            background: "transparent",
            border: "none",
            color: "#6b7280",
            cursor: "pointer",
            padding: 4,
            display: "flex",
            alignItems: "center"
          }}
        >
          <ExternalLink size={14} />
        </button>
      </header>

      {/* Tabs */}
      <div
        style={{
          display: "flex",
          gap: 16,
          padding: "8px 18px",
          borderBottom: "1px solid rgba(0,0,0,0.06)",
          fontSize: 12.5,
          fontWeight: 500
        }}
      >
        <button
          onClick={() => setTab("notes")}
          style={{
            background: "transparent",
            border: "none",
            borderBottom: tab === "notes" ? "2px solid #2563eb" : "2px solid transparent",
            color: tab === "notes" ? "#2563eb" : "#6b7280",
            padding: "4px 2px",
            cursor: "pointer",
            fontWeight: tab === "notes" ? 600 : 500
          }}
        >
          My notes
        </button>
        <button
          onClick={() => setTab("transcript")}
          style={{
            background: "transparent",
            border: "none",
            borderBottom: tab === "transcript" ? "2px solid #2563eb" : "2px solid transparent",
            color: tab === "transcript" ? "#2563eb" : "#6b7280",
            padding: "4px 2px",
            cursor: "pointer",
            fontWeight: tab === "transcript" ? 600 : 500
          }}
        >
          Transcript
        </button>
      </div>

      {/* Content Area */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "14px 18px",
          display: "flex",
          flexDirection: "column"
        }}
      >
        {tab === "notes" ? (
          <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
            <textarea
              value={notes}
              onChange={(e) => handleNotesChange(e.target.value)}
              placeholder="Jot down what matters. Your notes guide the summary."
              style={{
                width: "100%",
                flex: 1,
                border: "none",
                outline: "none",
                background: "transparent",
                resize: "none",
                fontSize: 14,
                lineHeight: 1.6,
                color: "#181a1f",
                fontFamily: "inherit"
              }}
            />

            {/* Screenshots Strip */}
            {Object.keys(screenshotPaths).length > 0 && (
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  overflowX: "auto",
                  paddingTop: 8,
                  borderTop: "1px solid rgba(0,0,0,0.06)"
                }}
              >
                {Object.entries(screenshotPaths).map(([name, src]) => (
                  <img
                    key={name}
                    src={src}
                    alt="Meeting screenshot"
                    style={{
                      height: 54,
                      borderRadius: 6,
                      border: "1px solid rgba(0,0,0,0.1)",
                      objectFit: "cover"
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {passages.length === 0 ? (
              <p style={{ color: "#9ca3af", fontSize: 13, margin: 0 }}>
                {record?.liveTranscription
                  ? "Listening… text appears here as you talk."
                  : "Live transcription is off. The transcript is created when you stop."}
              </p>
            ) : (
              passages.map((passage) => {
                const isMic = passage.track === "microphone";
                return (
                  <div key={passage.id} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          color: isMic ? "#2563eb" : "#16a34a"
                        }}
                      >
                        {isMic
                          ? record?.microphoneLabel ?? "Microphone"
                          : record?.systemLabel ?? "System audio"}
                      </span>
                      <span
                        style={{
                          fontSize: 11,
                          fontFamily: "monospace",
                          color: "#9ca3af"
                        }}
                      >
                        {formatTimestamp(passage.start)}
                      </span>
                    </div>
                    <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5 }}>
                      {passage.text}
                    </p>
                  </div>
                );
              })
            )}
            <div ref={transcriptEndRef} />
          </div>
        )}
      </div>

      {/* Footer */}
      <footer
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 18px",
          borderTop: "1px solid rgba(0,0,0,0.08)",
          background: "#f4f1ea"
        }}
      >
        <button
          onClick={handleTakeScreenshot}
          title="Add a screenshot to this meeting"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            background: "transparent",
            border: "1px solid rgba(0,0,0,0.12)",
            borderRadius: 6,
            padding: "5px 10px",
            fontSize: 12,
            fontWeight: 500,
            cursor: "pointer",
            color: "#374151"
          }}
        >
          <Camera size={13} />
          Screenshot
        </button>

        <button
          onClick={handleDone}
          title="Close notes. The meeting keeps recording."
          style={{
            background: "#2563eb",
            color: "#ffffff",
            border: "none",
            borderRadius: 6,
            padding: "5px 16px",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer"
          }}
        >
          Done
        </button>
      </footer>
    </div>
  );
};
