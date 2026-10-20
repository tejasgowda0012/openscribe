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

const FlowbarIconButton: React.FC<{
  onClick: (e: React.MouseEvent) => void;
  title: string;
  color?: string;
  children: React.ReactNode;
}> = ({ onClick, title, color, children }) => {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      title={title}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: hover ? "var(--os-flowbar-hover)" : "transparent",
        border: 0,
        borderRadius: 999,
        color: color ?? "inherit",
        padding: 4,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        font: "inherit",
        transition: "background 0.12s ease"
      }}
    >
      {children}
    </button>
  );
};

const FlowbarMenuItem: React.FC<{
  onClick: () => void;
  children: React.ReactNode;
}> = ({ onClick, children }) => {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: hover ? "var(--os-flowbar-hover)" : "transparent",
        border: 0,
        borderRadius: 6,
        color: "var(--os-flowbar-ink)",
        padding: "6px 8px",
        display: "flex",
        alignItems: "center",
        gap: 6,
        cursor: "pointer",
        font: "inherit",
        fontSize: 12,
        fontWeight: 500,
        width: "100%",
        textAlign: "left",
        transition: "background 0.12s ease"
      }}
    >
      {children}
    </button>
  );
};

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
      style={{
        position: "absolute",
        left: pillCenter.x - pillWidth / 2,
        top: pillCenter.y - pillHeight / 2,
        width: pillWidth,
        height: pillHeight,
        borderRadius: 999,
        color: "var(--os-flowbar-ink)",
        background: mode === "idle" ? "var(--os-flowbar-idle-fill)" : "var(--os-flowbar)",
        border: mode === "idle" ? "0.5px solid var(--os-flowbar-idle-line)" : "1px solid var(--os-flowbar-line)",
        boxShadow: mode === "idle" ? undefined : "var(--os-flowbar-shadow)",
        display: "flex",
        flexDirection: vertical ? "column" : "row",
        alignItems: "center",
        justifyContent: "space-evenly",
        cursor: "grab",
        boxSizing: "border-box"
      }}>
      {mode === "idle" && <div onClick={() => send("dictate")} title="Dictate · drag to move" style={{ width: "100%", height: "100%" }} />}
      {mode === "idleExpanded" && <>
        <FlowbarIconButton onClick={() => send("dictate")} title="Dictate"><Mic size={15} /></FlowbarIconButton>
        <FlowbarIconButton onClick={() => send("meeting")} title="Start meeting"><Users size={15} /></FlowbarIconButton>
        <FlowbarIconButton onClick={() => setScreenshotMenuOpen(!screenshotMenuOpen)} title="Screenshot"><Camera size={15} /></FlowbarIconButton>
      </>}
      {mode === "dictating" && <>
        <FlowbarSquiggle width={42} height={16} level={level} motion={phase === "starting" ? "flowing" : "live"} />
        <FlowbarIconButton color="var(--os-flowbar-recording)" onClick={() => send("dictate")} title="Stop and save"><Square size={13} fill="currentColor" /></FlowbarIconButton>
      </>}
      {(mode === "processing" || mode === "meetingSaving") && <FlowbarSquiggle width={64} height={16} motion="flowing" color="var(--os-flowbar-accent)" />}
      {mode === "meeting" && <>
        <FlowbarIconButton onClick={() => { void openMeetingNotes(); }} title="Meeting notes">
          <FlowbarSquiggle width={30} height={16} level={level} motion={activeMeeting?.status === "paused" ? "still" : "live"} />
        </FlowbarIconButton>
        {hovering && <>
          <FlowbarIconButton onClick={() => { void openMeetingNotes(); }} title="My notes"><FileText size={13} /></FlowbarIconButton>
          <FlowbarIconButton onClick={() => screenshot("area")} title="Screenshot"><Camera size={13} /></FlowbarIconButton>
          <FlowbarIconButton onClick={() => send("pauseMeeting")} title={activeMeeting?.status === "paused" ? "Resume" : "Pause"}>
            {activeMeeting?.status === "paused" ? <Play size={13} /> : <Pause size={13} />}
          </FlowbarIconButton>
        </>}
        <FlowbarIconButton color="var(--os-flowbar-recording)" onClick={() => send("meeting")} title="Stop meeting"><Square size={11} fill="currentColor" /></FlowbarIconButton>
      </>}
    </div>
    {(menuOpen || screenshotMenuOpen) && <div style={{
      position: "absolute",
      background: "var(--os-flowbar)",
      color: "var(--os-flowbar-ink)",
      border: "1px solid var(--os-flowbar-line)",
      borderRadius: 10,
      padding: 6,
      display: "flex",
      flexDirection: "column",
      gap: 2,
      fontSize: 12,
      zIndex: 20,
      boxShadow: "var(--os-flowbar-shadow)",
      width: 174,
      left: Math.max(6, Math.min(windowWidth - 190, pillCenter.x - 87)),
      top: above ? undefined : pillCenter.y + pillHeight / 2 + 8,
      bottom: above ? windowHeight - pillCenter.y + pillHeight / 2 + 8 : undefined
    }}
      onMouseEnter={() => { if (hoverTimer.current) clearTimeout(hoverTimer.current); }}>
      {screenshotMenuOpen ? (["area", "window", "screen"] as const).map(kind => (
        <FlowbarMenuItem key={kind} onClick={() => screenshot(kind)}>
          {kind[0].toUpperCase() + kind.slice(1)} screenshot
        </FlowbarMenuItem>
      )) : <>
        <FlowbarMenuItem onClick={() => openMain("notes")}>Today’s note</FlowbarMenuItem>
        <FlowbarMenuItem onClick={() => openMain("settings")}>Settings and shortcuts</FlowbarMenuItem>
        <FlowbarMenuItem onClick={() => { setMenuOpen(false); void getCurrentWindow().hide().catch(reportUiError); }}>Hide Flowbar</FlowbarMenuItem>
      </>}
    </div>}
  </div>;
};
