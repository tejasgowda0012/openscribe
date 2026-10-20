import React, { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { Window } from "@tauri-apps/api/window";
import { AlertTriangle, CalendarDays, CircleStop, FileAudio, Library, Mic, Settings, Users, X } from "lucide-react";
import { mainController } from "./mainController";
import { MeetingsView } from "./views/meetings/MeetingsView";
import { NotesView } from "./views/notes/NotesView";
import { SettingsView } from "./views/settings/SettingsView";
import type { ParitySettings } from "./api/parityTypes";
import { useAppliedTheme } from "./theme";
export { defaultParitySettings } from "./settings";

export default function App() {
  const { settings, notes, meetings, calendarEvents, recoveries, inputs, loaded, storageError, notice, phase, startPrompt, endPrompt, navigation } = useSyncExternalStore(mainController.subscribe, mainController.snapshot);
  const activeMeetingId = mainController.activeMeeting?.id ?? null;
  const [section, setSection] = useState<"notes" | "meetings" | "calendar" | "settings">("notes");
  const [selectedNoteId, setSelectedNoteId] = useState("today-placeholder");
  const [selectedMeetingId, setSelectedMeetingId] = useState<string>();
  const [confirmDiscardAll, setConfirmDiscardAll] = useState(false);
  const [now, setNow] = useState(Date.now());
  const autoStartCountdown = startPrompt?.automatic ? Math.max(0, Math.ceil((Date.parse(startPrompt.deadline) - now) / 1000)) : null;
  const endCountdown = endPrompt?.automatic ? Math.max(0, Math.ceil((Date.parse(endPrompt.deadline) - now) / 1000)) : null;
  useEffect(() => { void mainController.initialize(); }, []);
  useEffect(() => {
    if (navigation) { setSection(navigation.section); if (navigation.meetingId) setSelectedMeetingId(navigation.meetingId); }
  }, [navigation]);
  useAppliedTheme(settings.theme);
  useEffect(() => {
    if (!startPrompt && !endPrompt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [startPrompt, endPrompt]);
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => { if (event.key === "Escape") void mainController.dictation.finish(true); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);
  const handleUpdateSettings = useCallback((updated: ParitySettings) => mainController.updateSettings(updated).catch(mainController.error), []);
  const handleCalendarStartDecision = (decision: "start" | "skip") => { if (startPrompt) void mainController.decide(startPrompt, decision).catch(mainController.error); };
  const handleCalendarEndDecision = (decision: "finish" | "extend") => { if (endPrompt) void mainController.decide(endPrompt, decision).catch(mainController.error); };
  const handleStartDictation = () => { void mainController.intent({ action: "dictate" }); };
  const handleStartMeetingFromDock = () => {
    if (activeMeetingId) { setSection("meetings"); setSelectedMeetingId(activeMeetingId); }
    else void mainController.intent({ action: "meeting" });
  };
  const handleRevealFlowbar = async () => {
    try { const flowbar = await Window.getByLabel("flowbar"); await flowbar?.show(); }
    catch (error) { mainController.error(error); }
  };
  const setNotes = mainController.setNotes;
  const setMeetings = mainController.setMeetings;

  if (!loaded) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          background: "#faf8f4",
          color: "#4b5563",
          fontFamily: "inherit"
        }}
      >
        <span>Opening your workspace…</span>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        width: "100vw",
        height: "100vh",
        background: settings.theme === "dark" ? "#14171f" : "#faf8f4",
        color: settings.theme === "dark" ? "#f3f4f6" : "#181a1f",
        overflow: "hidden"
      }}
    >
      {/* Main Sidebar */}
      <aside
        style={{
          width: 210,
          borderRight: "1px solid rgba(0,0,0,0.08)",
          display: "flex",
          flexDirection: "column",
          padding: "24px 14px 16px",
          background: settings.theme === "dark" ? "#10121a" : "#f5f3ed"
        }}
      >
        {/* Brand */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 26, paddingLeft: 6 }}>
          <div
            style={{
              width: 26,
              height: 26,
              borderRadius: 7,
              background: "#2563eb",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              fontWeight: 700,
              fontSize: 14
            }}
          >
            OS
          </div>
          <div>
            <strong style={{ fontSize: 14, display: "block", letterSpacing: "-0.02em" }}>
              OpenScribe
            </strong>
            <span style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: "0.06em", color: "#9ca3af" }}>
              VOICE WORKSPACE
            </span>
          </div>
        </div>

        {/* Section Links */}
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: "#9ca3af", marginBottom: 8, paddingLeft: 6 }}>
          LIBRARY
        </div>
        <nav style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <button
            onClick={() => setSection("notes")}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "7px 10px",
              borderRadius: 7,
              border: "none",
              background: section === "notes" ? (settings.theme === "dark" ? "#1e2433" : "#e0e7ff") : "transparent",
              color: section === "notes" ? "#2563eb" : "inherit",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: section === "notes" ? 600 : 500
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Library size={16} />
              <span>Notes</span>
            </div>
            <span style={{ fontSize: 11, color: "#9ca3af" }}>{notes.length}</span>
          </button>

          <button
            onClick={() => setSection("meetings")}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "7px 10px",
              borderRadius: 7,
              border: "none",
              background: section === "meetings" ? (settings.theme === "dark" ? "#1e2433" : "#e0e7ff") : "transparent",
              color: section === "meetings" ? "#2563eb" : "inherit",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: section === "meetings" ? 600 : 500
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Users size={16} />
              <span>Meetings</span>
            </div>
            <span style={{ fontSize: 11, color: "#9ca3af" }}>{meetings.length}</span>
          </button>

          <button
            onClick={() => setSection("calendar")}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "7px 10px",
              borderRadius: 7,
              border: "none",
              background: section === "calendar" ? (settings.theme === "dark" ? "#1e2433" : "#e0e7ff") : "transparent",
              color: section === "calendar" ? "#2563eb" : "inherit",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: section === "calendar" ? 600 : 500
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <CalendarDays size={16} />
              <span>Calendar</span>
            </div>
            <span style={{ fontSize: 11, color: "#9ca3af" }}>{calendarEvents.length}</span>
          </button>
        </nav>

        <div style={{ flex: 1 }} />

        {/* Settings button */}
        <button
          onClick={() => setSection("settings")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 10px",
            borderRadius: 7,
            border: "none",
            background: section === "settings" ? (settings.theme === "dark" ? "#1e2433" : "#e0e7ff") : "transparent",
            color: section === "settings" ? "#2563eb" : "inherit",
            cursor: "pointer",
            fontSize: 13,
            fontWeight: section === "settings" ? 600 : 500,
            marginBottom: 16
          }}
        >
          <Settings size={16} />
          <span>Settings</span>
        </button>

        {/* Capture Dock at foot of sidebar */}
        <div
          style={{
            background: settings.theme === "dark" ? "#171a24" : "#ffffff",
            border: "1px solid rgba(0,0,0,0.08)",
            borderRadius: 10,
            padding: "12px",
            display: "flex",
            flexDirection: "column",
            gap: 8
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: phase === "recording" || activeMeetingId ? "#ef4444" : "#2563eb"
              }}
            />
            <strong style={{ fontSize: 12 }}>
              {activeMeetingId
                ? "Meeting Active"
                : phase === "recording"
                ? "Listening"
                : "Dictation"}
            </strong>
          </div>

          <button
            disabled={phase === "transcribing" || phase === "cleaning"}
            onClick={activeMeetingId ? handleStartMeetingFromDock : handleStartDictation}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              background: phase === "recording" ? "#ef4444" : "#2563eb",
              color: "#ffffff",
              border: "none",
              borderRadius: 6,
              padding: "7px",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer"
            }}
          >
            {phase === "recording" ? (
              <>
                <CircleStop size={14} /> Stop & save
              </>
            ) : phase === "starting" ? "Starting?" : phase === "transcribing" || phase === "cleaning" ? "Processing?" : activeMeetingId ? (
              <>
                <Users size={14} /> View meeting
              </>
            ) : (
              <>
                <Mic size={14} /> Record note
              </>
            )}
          </button>
          <small style={{ fontSize: 10.5, color: "#9ca3af", textAlign: "center" }}>
            {settings.shortcuts?.dictate?.display ?? "Ctrl Alt Space"} to dictate
          </small>
        </div>
      </aside>

      {/* Main Workspace Column */}
      <main style={{ flex: 1, display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
        {notice && <div role="alert" style={{ padding: "10px 24px", background: "#fee2e2", color: "#991b1b", display: "flex", gap: 12 }}><span style={{ flex: 1 }}>{notice}</span><button onClick={mainController.clearNotice} aria-label="Dismiss notice"><X size={14} /></button></div>}
        {/* Global Storage Error Banner */}
        {storageError && (
          <div
            style={{
              background: "#fee2e2",
              borderBottom: "1px solid #fecaca",
              padding: "10px 24px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <AlertTriangle size={16} color="#dc2626" />
              <strong style={{ fontSize: 12.5, color: "#991b1b" }}>
                Check your local history: {storageError}
              </strong>
            </div>
            <button
              onClick={mainController.clearStorageError}
              style={{ background: "transparent", border: "none", cursor: "pointer", color: "#991b1b" }}
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* Failed-Recording Banner with Discard All and Retry */}
        {recoveries.length > 0 && (
          <div
            style={{
              background: "#fef3c7",
              borderBottom: "1px solid #fde68a",
              padding: "10px 24px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <FileAudio size={16} color="#d97706" />
              <strong style={{ fontSize: 12.5, color: "#92400e" }}>
                {recoveries.length > 1
                  ? `${recoveries.length} recordings weren’t transcribed`
                  : "A recording wasn’t transcribed"}
              </strong>
              <span style={{ fontSize: 12, color: "#b45309" }}>
                Audio is saved on this device.
              </span>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => setConfirmDiscardAll(true)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#b45309",
                  fontSize: 12,
                  cursor: "pointer"
                }}
              >
                {recoveries.length > 1 ? "Discard all" : "Discard"}
              </button>
              <button
                disabled={phase !== "idle"}
                onClick={() => { void mainController.dictation.retry(); }}
                style={{
                  background: "#d97706",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: 6,
                  padding: "4px 10px",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer"
                }}
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {/* Confirmation modal for Discard All */}
        {confirmDiscardAll && (
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: "rgba(0,0,0,0.4)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 9999
            }}
          >
            <div
              style={{
                background: "#ffffff",
                borderRadius: 12,
                padding: "20px 24px",
                maxWidth: 380,
                boxShadow: "0 10px 25px rgba(0,0,0,0.2)"
              }}
            >
              <h3 style={{ fontSize: 16, margin: "0 0 8px" }}>
                Discard {recoveries.length} recordings?
              </h3>
              <p style={{ fontSize: 13, color: "#6b7280", margin: "0 0 18px", lineHeight: 1.5 }}>
                Their audio is deleted from this device. Notes and meetings you already have are not affected.
              </p>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                <button
                  onClick={() => setConfirmDiscardAll(false)}
                  style={{
                    background: "transparent",
                    border: "1px solid rgba(0,0,0,0.15)",
                    borderRadius: 6,
                    padding: "6px 14px",
                    fontSize: 13,
                    cursor: "pointer"
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    void mainController.dictation.discard();
                    setConfirmDiscardAll(false);
                  }}
                  style={{
                    background: "#ef4444",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: 6,
                    padding: "6px 14px",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer"
                  }}
                >
                  Discard all
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Calendar Start Prompt Dialog */}
        {startPrompt && (
          <div
            style={{
              background: "#eff6ff",
              borderBottom: "1px solid #bfdbfe",
              padding: "12px 24px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between"
            }}
          >
            <div>
              <strong style={{ fontSize: 13, color: "#1e40af" }}>
                Do you want to record: {startPrompt.event.title ?? "Upcoming Meeting"}?
              </strong>
              {autoStartCountdown != null && (
                <span style={{ fontSize: 12, color: "#3b82f6", display: "block" }}>
                  Auto-starting in {autoStartCountdown}s…
                </span>
              )}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => handleCalendarStartDecision("start")}
                style={{
                  background: "#2563eb",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: 6,
                  padding: "5px 12px",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer"
                }}
              >
                Record meeting
              </button>
              <button
                onClick={() => handleCalendarStartDecision("skip")}
                style={{
                  background: "#ffffff",
                  border: "1px solid #bfdbfe",
                  color: "#1e40af",
                  borderRadius: 6,
                  padding: "5px 12px",
                  fontSize: 12,
                  cursor: "pointer"
                }}
              >
                Skip
              </button>
            </div>
          </div>
        )}

        {/* Calendar End Prompt Dialog */}
        {endPrompt && (
          <div
            style={{
              background: "#eff6ff",
              borderBottom: "1px solid #bfdbfe",
              padding: "12px 24px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between"
            }}
          >
            <strong style={{ fontSize: 13, color: "#1e40af" }}>
              Meeting scheduled to end: {endPrompt.event.title ?? "Meeting"}
            </strong>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => handleCalendarEndDecision("finish")}
                style={{
                  background: "#2563eb",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: 6,
                  padding: "5px 12px",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer"
                }}
              >
                Finish meeting{endCountdown != null ? ` (${endCountdown}s)` : ""}
              </button>
              <button
                onClick={() => handleCalendarEndDecision("extend")}
                style={{
                  background: "#ffffff",
                  border: "1px solid #bfdbfe",
                  color: "#1e40af",
                  borderRadius: 6,
                  padding: "5px 12px",
                  fontSize: 12,
                  cursor: "pointer"
                }}
              >
                Extend 15 min
              </button>
            </div>
          </div>
        )}

        {/* Active Section View */}
        <div style={{ flex: 1, height: "100%", overflow: "hidden" }}>
          {section === "notes" && (
            <NotesView
              notes={notes}
              selectedId={selectedNoteId}
              onSelectNote={setSelectedNoteId}
              onUpdateNotes={setNotes}
              onRefreshNotes={() => mainController.refreshNotes()}
              onOpenMeeting={(meetingId) => {
                setSection("meetings");
                setSelectedMeetingId(meetingId);
              }}
              onStartDictation={handleStartDictation}
              onStartMeeting={handleStartMeetingFromDock}
            />
          )}

          {section === "meetings" && (
            <MeetingsView
              meetings={meetings}
              activeMeetingId={activeMeetingId}
              selectedId={selectedMeetingId}
              settings={settings}
              onSelectMeeting={setSelectedMeetingId}
              onUpdateMeetings={setMeetings}
              onUpdateSettings={handleUpdateSettings}
            />
          )}

          {section === "calendar" && (
            <SettingsView
              key="calendar"
              initialSection="calendar"
              inputs={inputs}
              settings={settings}
              calendarEvents={calendarEvents}
              onUpdateSettings={handleUpdateSettings}
              onRefreshCalendar={() => { void mainController.refreshCalendar().catch(mainController.error); }}
              onRevealFlowbar={handleRevealFlowbar}
            />
          )}

          {section === "settings" && (
            <SettingsView
              key="settings"
              inputs={inputs}
              settings={settings}
              calendarEvents={calendarEvents}
              onUpdateSettings={handleUpdateSettings}
              onRefreshCalendar={() => { void mainController.refreshCalendar().catch(mainController.error); }}
              onClearNotesHistory={() => { void mainController.clearNotes().catch(mainController.error); }}
              onRevealFlowbar={handleRevealFlowbar}
            />
          )}
        </div>
      </main>
    </div>
  );
}
