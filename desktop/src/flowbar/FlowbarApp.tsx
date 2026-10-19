import React, { useEffect, useRef, useState } from "react";
import { emitTo, listen } from "@tauri-apps/api/event";
import { getCurrentWindow, Window } from "@tauri-apps/api/window";
import { Camera, FileText, Mic, Pause, Play, Square, Users } from "lucide-react";
import { deleteMeeting, parityEvents, skipSummary, summarizeShortMeeting } from "../api/parity";
import type { MeetingRecord, ParitySettings } from "../api/parityTypes";
import { ListenerScope } from "../listeners";
import { reportUiError, sendIntent, type WorkspaceStatus } from "../workspaceEvents";
import type { DictationPhase } from "../dictation";
import { useFlowbarWindow } from "./useFlowbarWindow";
import { FlowbarSquiggle } from "./FlowbarSquiggle";
import { NoticeBubble } from "./NoticeBubble";

export type FlowbarMode = "idle" | "idleExpanded" | "dictating" | "processing" | "meeting" | "meetingSaving";
const buttonStyle: React.CSSProperties = { background: "transparent", border: 0, color: "inherit", padding: 3, display: "flex", alignItems: "center", gap: 6, cursor: "pointer", font: "inherit" };
const menuStyle: React.CSSProperties = { position: "absolute", background: "#14171f", color: "#fffaf0", border: "1px solid #454851", borderRadius: 10, padding: 8, display: "flex", flexDirection: "column", gap: 4, fontSize: 12, zIndex: 20, boxShadow: "0 4px 12px #0005" };

export const FlowbarApp: React.FC = () => {
  const [settings, setSettings] = useState<ParitySettings | null>(null);
  const [phase, setPhase] = useState<DictationPhase>("idle");
  const [hovering, setHovering] = useState(false);
  const [level, setLevel] = useState(0);
  const [activeMeeting, setActiveMeeting] = useState<MeetingRecord | null>(null);
  const [processingMeeting, setProcessingMeeting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [shortMeeting, setShortMeeting] = useState<MeetingRecord | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [screenshotMenuOpen, setScreenshotMenuOpen] = useState(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mode: FlowbarMode = activeMeeting ? "meeting" : processingMeeting ? "meetingSaving" : phase === "recording" || phase === "starting" ? "dictating" : phase !== "idle" ? "processing" : hovering ? "idleExpanded" : "idle";
  const expanded = !!notice || !!shortMeeting || menuOpen || screenshotMenuOpen;
  const length = mode === "idle" ? 34 : mode === "idleExpanded" ? 150 : mode === "meeting" ? (hovering ? 150 : 84) : 88;
  const thickness = mode === "idle" ? 6 : 32;
  const { dock, pillCenter, onMouseDown, width: windowWidth, height: windowHeight } = useFlowbarWindow(settings, expanded ? 320 : length + 20, expanded ? 300 : thickness + 20, !expanded);
  const vertical = dock !== "none";
  const pillWidth = vertical ? thickness : length, pillHeight = vertical ? length : thickness;
  const above = pillCenter.y >= windowHeight / 2;

  useEffect(() => {
    const scope = new ListenerScope();
    scope.add(listen<WorkspaceStatus>("workspace://status", event => {
      const status = event.payload;
      setSettings(status.settings); setPhase(status.phase); setActiveMeeting(status.activeMeeting);
      setProcessingMeeting(status.processingMeeting); setNotice(status.notice);
    }).then(unlisten => { void emitTo("main", "workspace://request-state").catch(reportUiError); return unlisten; }), reportUiError);
    scope.add(parityEvents.onMeetingLevel(({ level }) => setLevel(level)), reportUiError);
    scope.add(parityEvents.onDictationLevel(({ level }) => setLevel(level)), reportUiError);
    scope.add(parityEvents.onMeetingChanged(record => {
      if (record.summaryNeedsConfirmation) setShortMeeting(record);
      else setShortMeeting(previous => previous?.id === record.id ? null : previous);
    }), reportUiError);
    return () => { scope.dispose(); if (hoverTimer.current) clearTimeout(hoverTimer.current); };
  }, []);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (menuOpen || screenshotMenuOpen) { setMenuOpen(false); setScreenshotMenuOpen(false); }
      else void sendIntent({ action: "cancelDictation" }).catch(reportUiError);
    };
    window.addEventListener("keydown", handler); return () => window.removeEventListener("keydown", handler);
  }, [menuOpen, screenshotMenuOpen]);
  useEffect(() => {
    const win = getCurrentWindow();
    if (mode !== "idle" || expanded || settings?.showOverlayWhenIdle) void win.show().catch(reportUiError);
    else if (settings) void win.hide().catch(reportUiError);
  }, [mode, expanded, settings?.showOverlayWhenIdle]);
  const send = (action: "dictate" | "meeting" | "pauseMeeting" | "dismissNotice") => { void sendIntent({ action }).catch(reportUiError); };
  const openMain = (section: "notes" | "settings") => { setMenuOpen(false); void sendIntent({ action: "open", section }).catch(reportUiError); };
  const openMeetingNotes = async () => {
    try { const win = await Window.getByLabel("meeting-notes"); await win?.show(); await win?.setFocus(); }
    catch (error) { reportUiError(error); }
  };
  const screenshot = (kind: "area" | "window" | "screen") => { setScreenshotMenuOpen(false); void sendIntent({ action: "screenshot", kind }).catch(reportUiError); };
  const resolveShort = async (action: "summarize" | "keep" | "delete") => {
    if (!shortMeeting) return;
    try {
      if (action === "summarize") await summarizeShortMeeting(shortMeeting.id);
      else if (action === "keep") await skipSummary(shortMeeting.id);
      else await deleteMeeting(shortMeeting.id);
      setShortMeeting(null);
      await emitTo("main", "workspace://refresh-meetings");
    } catch (error) { reportUiError(error); }
  };
  return <div style={{ width: windowWidth, height: windowHeight, background: "transparent", fontFamily: "system-ui", position: "relative", overflow: "hidden" }}>
    <div style={{ position: "absolute", left: 10, width: 300, maxHeight: 220, overflowY: "auto", top: above ? Math.max(4, pillCenter.y - 220) : pillCenter.y + 26, zIndex: 30 }}>
      <NoticeBubble notice={notice} isError shortMeeting={shortMeeting}
        onDismissNotice={() => send("dismissNotice")} onInspectNotice={() => openMain("settings")}
        onResolveShortMeeting={action => { void resolveShort(action); }} />
    </div>
    <div onMouseDown={onMouseDown}
      onMouseEnter={() => { if (hoverTimer.current) clearTimeout(hoverTimer.current); setHovering(true); }}
      onMouseLeave={() => { hoverTimer.current = setTimeout(() => { setHovering(false); }, 350); }}
      onContextMenu={event => { event.preventDefault(); setMenuOpen(!menuOpen); }}
      style={{ position: "absolute", left: pillCenter.x - pillWidth / 2, top: pillCenter.y - pillHeight / 2,
        width: pillWidth, height: pillHeight, borderRadius: 999, color: "#fffaf0", background: mode === "idle" ? "#d2cdbc99" : "#14171f",
        boxShadow: mode === "idle" ? undefined : "0 4px 12px #0005", display: "flex", flexDirection: vertical ? "column" : "row", alignItems: "center", justifyContent: "space-evenly", cursor: "grab" }}>
      {mode === "idle" && <div onClick={() => send("dictate")} title="Dictate · drag to move" style={{ width: "100%", height: "100%" }} />}
      {mode === "idleExpanded" && <>
        <button style={buttonStyle} onClick={() => send("dictate")} title="Dictate"><Mic size={15} /></button>
        <button style={buttonStyle} onClick={() => send("meeting")} title="Start meeting"><Users size={15} /></button>
        <button style={buttonStyle} onClick={() => setScreenshotMenuOpen(!screenshotMenuOpen)} title="Screenshot"><Camera size={15} /></button>
      </>}
      {mode === "dictating" && <>
        <FlowbarSquiggle width={42} height={16} level={level} motion={phase === "starting" ? "flowing" : "live"} />
        <button style={{ ...buttonStyle, color: "#ff6366" }} onClick={() => send("dictate")} title="Stop and save"><Square size={13} fill="currentColor" /></button>
      </>}
      {(mode === "processing" || mode === "meetingSaving") && <FlowbarSquiggle width={64} height={16} motion="flowing" color="#f0b864" />}
      {mode === "meeting" && <>
        <button style={buttonStyle} onClick={() => { void openMeetingNotes(); }} title="Meeting notes"><FlowbarSquiggle width={30} height={16} level={level} motion={activeMeeting?.status === "paused" ? "still" : "live"} /></button>
        {hovering && <>
          <button style={buttonStyle} onClick={() => { void openMeetingNotes(); }} title="My notes"><FileText size={13} /></button>
          <button style={buttonStyle} onClick={() => screenshot("area")} title="Screenshot"><Camera size={13} /></button>
          <button style={buttonStyle} onClick={() => send("pauseMeeting")} title={activeMeeting?.status === "paused" ? "Resume" : "Pause"}>{activeMeeting?.status === "paused" ? <Play size={13} /> : <Pause size={13} />}</button>
        </>}
        <button style={{ ...buttonStyle, color: "#ff6366" }} onClick={() => send("meeting")} title="Stop meeting"><Square size={11} fill="currentColor" /></button>
      </>}
    </div>
    {(menuOpen || screenshotMenuOpen) && <div style={{ ...menuStyle, width: 174, left: Math.max(6, Math.min(windowWidth - 190, pillCenter.x - 87)), top: above ? undefined : pillCenter.y + pillHeight / 2 + 8, bottom: above ? windowHeight - pillCenter.y + pillHeight / 2 + 8 : undefined }}
      onMouseEnter={() => { if (hoverTimer.current) clearTimeout(hoverTimer.current); }}>
      {screenshotMenuOpen ? (["area", "window", "screen"] as const).map(kind => <button key={kind} style={buttonStyle} onClick={() => screenshot(kind)}>{kind[0].toUpperCase() + kind.slice(1)} screenshot</button>) : <>
        <button style={buttonStyle} onClick={() => openMain("notes")}>Today’s note</button>
        <button style={buttonStyle} onClick={() => openMain("settings")}>Settings and shortcuts</button>
        <button style={buttonStyle} onClick={() => { setMenuOpen(false); void getCurrentWindow().hide().catch(reportUiError); }}>Hide Flowbar</button>
      </>}
    </div>}
  </div>;
};
