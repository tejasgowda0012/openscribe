import React, { useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Camera, ExternalLink } from "lucide-react";
import { attachmentPath, listMeetings, loadProfile, parityEvents, updateMeeting } from "../api/parity";
import type { MeetingRecord, NoteCapture } from "../api/parityTypes";
import { ListenerScope } from "../listeners";
import { reportUiError, sendIntent } from "../workspaceEvents";
import { formatDuration, formatTimestamp, groupTranscriptPassages } from "../views/meetings/transcriptHelpers";

export const MeetingNotesApp: React.FC = () => {
  const [record, setRecord] = useState<MeetingRecord | null>(null);
  const [tab, setTab] = useState<"notes" | "transcript">("notes");
  const [notes, setNotes] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [notice, setNotice] = useState("");
  const [screenshotPaths, setScreenshotPaths] = useState<Record<string, string>>({});
  const recordRef = useRef<MeetingRecord | null>(null);
  const notesRef = useRef("");
  const dirtyRef = useRef(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const writes = useRef<Promise<unknown>>(Promise.resolve());
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const showError = (error: unknown) => { setNotice(String(error)); reportUiError(error); };
  const persistNotes = async () => {
    if (saveTimeoutRef.current) { clearTimeout(saveTimeoutRef.current); saveTimeoutRef.current = null; }
    const current = recordRef.current, text = notesRef.current;
    if (!current || !dirtyRef.current) { await writes.current; return; }
    const write = writes.current.catch(() => undefined).then(() => updateMeeting({ ...current, userNotes: text }));
    writes.current = write;
    await write;
    if (recordRef.current?.id === current.id && notesRef.current === text) dirtyRef.current = false;
    setNotice("");
  };
  const handleDone = async () => {
    try { await persistNotes(); await getCurrentWindow().hide(); }
    catch (error) { showError(error); }
  };
  const showCapture = async (capture: NoteCapture) => {
    if (!capture.attachment || capture.meetingID !== recordRef.current?.id) return;
    const path = await attachmentPath(capture.attachment);
    setScreenshotPaths(current => ({ ...current, [capture.attachment!]: convertFileSrc(path) }));
  };
  useEffect(() => {
    const scope = new ListenerScope(); let active = true;
    const accept = (updated: MeetingRecord) => {
      const current = recordRef.current;
      if (current && current.id !== updated.id && updated.status !== "recording" && updated.status !== "paused") return;
      if (current?.id !== updated.id) {
        if (dirtyRef.current) { void persistNotes().catch(showError); }
        dirtyRef.current = false; setScreenshotPaths({});
      }
      recordRef.current = updated; setRecord(updated); setElapsed(updated.duration);
      if (!dirtyRef.current) { notesRef.current = updated.userNotes ?? ""; setNotes(notesRef.current); }
    };
    scope.add(parityEvents.onMeetingChanged(accept), showError);
    void listMeetings().then(all => { if (!active || recordRef.current) return; const target = all.find(m => m.status === "recording" || m.status === "paused") ?? all[0]; if (target) accept(target); }).catch(showError);
    scope.add(listen<NoteCapture>("capture://added", event => { void showCapture(event.payload).catch(showError); }), showError);
    scope.add(listen<NoteCapture>("workspace://screenshot", event => { void showCapture(event.payload).catch(showError); }), showError);
    scope.add(getCurrentWindow().onCloseRequested(event => { event.preventDefault(); void handleDone(); }), showError);
    const interval = setInterval(() => { if (recordRef.current?.status === "recording") setElapsed(value => value + 1); }, 1000);
    return () => { active = false; scope.dispose(); clearInterval(interval); if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current); void persistNotes().catch(showError); };
  }, []);
  useEffect(() => {
    let active = true;
    void loadProfile().then(profile => {
      if (!active) return;
      for (const note of profile.notes) for (const capture of note.captures ?? []) void showCapture(capture).catch(showError);
    }).catch(showError);
    return () => { active = false; };
  }, [record?.id]);
  const handleNotesChange = (text: string) => {
    notesRef.current = text; dirtyRef.current = true; setNotes(text);
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => { void persistNotes().catch(showError); }, 400);
  };
  const handleTakeScreenshot = () => { void sendIntent({ action: "screenshot", kind: "area" }).catch(showError); };
  const openFullMeeting = async () => {
    try { await persistNotes(); await sendIntent({ action: "open", section: "meetings", meetingId: recordRef.current?.id }); await getCurrentWindow().hide(); }
    catch (error) { showError(error); }
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
      {notice && <div role="alert" style={{ padding: 12, background: "#fee2e2", color: "#991b1b" }}>{notice}</div>}
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
