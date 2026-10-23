import { useEffect, useState } from "react";
import { parityEvents } from "../api/parity";
import type { MeetingRecord } from "../api/parityTypes";
import type { DictationPhase } from "../dictation";
import { FlowbarSquiggle } from "../flowbar/FlowbarSquiggle";
import { mainController } from "../mainController";
import { ListenerScope } from "../listeners";

export function CaptureDock({ phase, meeting, hint }: { phase: DictationPhase; meeting: MeetingRecord | null; hint: string | null }) {
  const [level, setLevel] = useState(0), [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const scope = new ListenerScope();
    scope.add(parityEvents.onDictationLevel(({ level }) => setLevel(level)), mainController.error);
    scope.add(parityEvents.onMeetingLevel(({ level }) => setLevel(level)), mainController.error);
    return () => scope.dispose();
  }, []);
  useEffect(() => {
    if (phase !== "recording") { setSeconds(0); return; }
    const start = Date.now(); const timer = window.setInterval(() => setSeconds(Math.floor((Date.now() - start) / 1000)), 250);
    return () => clearInterval(timer);
  }, [phase]);
  const busy = phase !== "idle";
  return <section aria-label="Capture" style={{ padding: 12, border: "1px solid var(--os-line)", borderRadius: 10, background: "var(--os-surface)", display: "grid", gap: 9 }}>
    <strong>{meeting ? meeting.status === "paused" ? "Meeting paused" : "Meeting recording" : phase === "recording" ? `Listening ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}` : phase === "transcribing" ? "Transcribing…" : phase === "cleaning" ? "Cleaning up…" : phase === "starting" ? "Starting…" : "Ready to capture"}</strong>
    {(phase === "recording" || meeting?.status === "recording") && <FlowbarSquiggle width={154} height={26} level={level} motion="live" />}
    {meeting ? <><button onClick={() => { void mainController.intent({ action: "open", section: "meetings", meetingId: meeting.id }); }}>Meeting notes</button><div style={{ display: "flex", gap: 8 }}><button onClick={() => { void mainController.intent({ action: "pauseMeeting" }); }}>{meeting.status === "paused" ? "Resume" : "Pause"}</button><button onClick={() => { void mainController.intent({ action: "meeting" }); }}>Finish</button></div></>
      : <><button disabled={busy && phase !== "recording"} onClick={() => { void mainController.intent({ action: "dictate" }); }}>{phase === "recording" ? "Stop & save" : busy ? "Processing…" : "Record note"}</button>{busy && <button onClick={() => { void mainController.dictation.finish(true); }}>Cancel</button>}{!busy && <div style={{ display: "flex", gap: 8 }}><button onClick={() => { void mainController.intent({ action: "meeting" }); }}>Meeting</button><button onClick={() => { void mainController.intent({ action: "screenshot", kind: "area" }); }}>Screenshot</button></div>}</>}
    {hint && <small style={{ color: "var(--os-ink-muted)" }}>{hint} to dictate</small>}
  </section>;
}
