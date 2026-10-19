import React, { useEffect, useMemo, useRef, useState } from "react";
import { Window } from "@tauri-apps/api/window";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import {
  AlertTriangle,
  AudioLines,
  CalendarDays,
  Check,
  ChevronRight,
  CircleStop,
  Clipboard,
  FileAudio,
  KeyRound,
  Library,
  Mic,
  Moon,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Sparkles,
  Sun,
  Trash2,
  Users,
  X
} from "lucide-react";
import {
  calendarDecision,
  calendarRefresh,
  finishMeeting,
  listMeetings,
  loadProfile,
  parityEvents,
  saveSettings,
  startMeeting,
  type CalendarPromptEndEvent,
  type CalendarPromptStartEvent
} from "./api/parity";
import type {
  CalendarEvent,
  MeetingRecord,
  ParitySettings,
  VoiceNote
} from "./api/parityTypes";
import { friendlyError, native, speechAccount, writingAccount } from "./native";
import { cleanupInstructions, providerDefaults, providers } from "./defaults";
import { MeetingsView } from "./views/meetings/MeetingsView";
import { NotesView } from "./views/notes/NotesView";
import { SettingsView } from "./views/settings/SettingsView";
import type { AudioInput, CapturePhase, RecoveryJob } from "./types";

export const defaultParitySettings: ParitySettings = {
  speechProvider: "groq",
  speechBaseURL: "https://api.groq.com/openai/v1",
  speechModel: "whisper-large-v3-turbo",
  languageModelProvider: "groq",
  languageModelBaseURL: "https://api.groq.com/openai/v1",
  languageModel: "llama-3.3-70b-versatile",
  writingTone: "natural",
  customVocabulary: [],
  correctionRules: [],
  cleanupStrength: "clear",
  speechHints: true,
  spokenCorrections: true,
  learnSpelledWords: true,
  correctionModel: "llama-3.1-8b-instant",
  dictationLiveTranscription: true,
  meetingLiveTranscription: true,
  calendarEnabled: true,
  calendarExcludedTitles: ["personal", "1:1"],
  calendarAutoStart: false,
  calendarMeetingsOnly: true,
  calendarSummarize: true,
  microphoneDeviceUID: "",
  interactionSounds: true,
  snippets: [],
  appWritingTones: {},
  cleanupEnabled: true,
  pasteIntoFocusedApp: false,
  saveRawAudio: false,
  showOverlayWhenIdle: true,
  theme: "light",
  overlayPosition: "bottom-center",
  flowbarPlacement: null,
  meetingMicrophone: true,
  meetingSystemAudio: true,
  meetingSummarize: true,
  shortcuts: {
    dictate: { accelerator: "Alt+Space", display: "Alt Space" },
    holdToTalk: { accelerator: "Alt+H", display: "Alt H" },
    meeting: { accelerator: "Alt+M", display: "Alt M" },
    screenshotArea: { accelerator: "Alt+1", display: "Alt 1" },
    screenshotWindow: { accelerator: "Alt+2", display: "Alt 2" },
    screenshotScreen: { accelerator: "Alt+3", display: "Alt 3" },
    pasteLast: { accelerator: "Alt+V", display: "Alt V" }
  },
  systemAudioDeviceId: "",
  calendarSources: []
};

export default function App() {
  const [settings, setSettings] = useState<ParitySettings>(defaultParitySettings);
  const [notes, setNotes] = useState<VoiceNote[]>([]);
  const [meetings, setMeetings] = useState<MeetingRecord[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [recoveries, setRecoveries] = useState<RecoveryJob[]>([]);
  const [inputs, setInputs] = useState<AudioInput[]>([]);

  const [loaded, setLoaded] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [section, setSection] = useState<"notes" | "meetings" | "calendar" | "settings">("notes");
  const [selectedNoteId, setSelectedNoteId] = useState<string>("today-placeholder");
  const [selectedMeetingId, setSelectedMeetingId] = useState<string>();
  const [activeMeetingId, setActiveMeetingId] = useState<string | null>(null);
  const [phase, setPhase] = useState<CapturePhase>("idle");
  const [onboarding, setOnboarding] = useState(false);
  const [confirmDiscardAll, setConfirmDiscardAll] = useState(false);

  // Calendar Prompts
  const [startPrompt, setStartPrompt] = useState<CalendarPromptStartEvent | null>(null);
  const [autoStartCountdown, setAutoStartCountdown] = useState<number | null>(null);
  const [endPrompt, setEndPrompt] = useState<CalendarPromptEndEvent | null>(null);

  useEffect(() => {
    // Load profile
    loadProfile()
      .then((res) => {
        if (res.settings) {
          setSettings({ ...defaultParitySettings, ...res.settings });
        }
        if (res.notes) {
          setNotes(res.notes);
        }
        if (res.storageError) {
          setStorageError(res.storageError);
        }
        setLoaded(true);
      })
      .catch((err) => {
        console.error("Failed to load profile:", err);
        setLoaded(true);
      });

    // Load meetings
    listMeetings()
      .then((all) => {
        setMeetings(all);
        const active = all.find((m) => m.status === "recording" || m.status === "paused");
        if (active) setActiveMeetingId(active.id);
      })
      .catch(console.error);

    // Load calendar events
    calendarRefresh()
      .then(setCalendarEvents)
      .catch(() => undefined);

    // Audio inputs
    native
      .listInputs()
      .then(setInputs)
      .catch(() => undefined);

    // Subscriptions
    const unlistens: Array<() => void> = [];

    parityEvents.onMeetingChanged((record) => {
      setMeetings((curr) => {
        const idx = curr.findIndex((m) => m.id === record.id);
        if (idx >= 0) {
          const next = [...curr];
          next[idx] = record;
          return next;
        }
        return [record, ...curr];
      });
      if (record.status === "recording" || record.status === "paused") {
        setActiveMeetingId(record.id);
      } else if (activeMeetingId === record.id) {
        setActiveMeetingId(null);
      }
    }).then((u) => unlistens.push(u));

    parityEvents.onCalendarPromptStart((prompt) => {
      setStartPrompt(prompt);
      if (prompt.autoStartInSeconds) {
        setAutoStartCountdown(prompt.autoStartInSeconds);
      }
    }).then((u) => unlistens.push(u));

    parityEvents.onCalendarPromptEnd((prompt) => {
      setEndPrompt(prompt);
    }).then((u) => unlistens.push(u));

    parityEvents.onCaptureOcr(({ captureId, noteId, recognizedText }) => {
      setNotes((curr) =>
        curr.map((n) => {
          if (n.id === noteId && n.captures) {
            return {
              ...n,
              captures: n.captures.map((c) =>
                c.id === captureId ? { ...c, recognizedText } : c
              )
            };
          }
          return n;
        })
      );
    }).then((u) => unlistens.push(u));

    return () => {
      unlistens.forEach((u) => u());
    };
  }, []);

  // Theme application
  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
  }, [settings.theme]);

  // Auto-start countdown timer
  useEffect(() => {
    if (autoStartCountdown == null || autoStartCountdown <= 0) return;
    const t = window.setInterval(() => {
      setAutoStartCountdown((prev) => {
        if (prev != null && prev <= 1) {
          window.clearInterval(t);
          handleCalendarStartDecision("record");
          return null;
        }
        return prev != null ? prev - 1 : null;
      });
    }, 1000);
    return () => window.clearInterval(t);
  }, [autoStartCountdown]);

  const handleUpdateSettings = (updated: ParitySettings) => {
    setSettings(updated);
    saveSettings(updated).catch(console.error);
  };

  const handleCalendarStartDecision = async (decision: "record" | "skip") => {
    if (startPrompt?.occurrenceId) {
      await calendarDecision(startPrompt.occurrenceId, decision).catch(console.error);
    }
    if (decision === "record") {
      const rec = await startMeeting({
        title: startPrompt?.title ?? startPrompt?.event?.title ?? "Calendar Meeting",
        microphone: settings.meetingMicrophone,
        systemAudio: settings.meetingSystemAudio,
        summarizeOnStop: settings.calendarSummarize,
        liveTranscription: settings.meetingLiveTranscription
      }).catch(console.error);
      if (rec) {
        setActiveMeetingId(rec.id);
        setSelectedMeetingId(rec.id);
        setSection("meetings");
      }
    }
    setStartPrompt(null);
    setAutoStartCountdown(null);
  };

  const handleCalendarEndDecision = async (decision: "finish" | "extend15") => {
    if (endPrompt?.occurrenceId) {
      await calendarDecision(endPrompt.occurrenceId, decision).catch(console.error);
    }
    if (decision === "finish" && activeMeetingId) {
      await finishMeeting({ summarize: settings.calendarSummarize }).catch(console.error);
      setActiveMeetingId(null);
    }
    setEndPrompt(null);
  };

  const handleStartDictation = async () => {
    if (phase === "recording") {
      setPhase("transcribing");
      try {
        const recording = await native.stopRecording();
        setPhase("idle");
      } catch {
        setPhase("idle");
      }
      return;
    }
    try {
      await native.startRecording(settings.microphoneDeviceUID || undefined);
      setPhase("recording");
    } catch {
      setPhase("idle");
    }
  };

  const handleStartMeetingFromDock = async () => {
    if (activeMeetingId) {
      setSection("meetings");
      setSelectedMeetingId(activeMeetingId);
      return;
    }
    try {
      const rec = await startMeeting({
        title: "Meeting " + new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        microphone: settings.meetingMicrophone,
        systemAudio: settings.meetingSystemAudio,
        summarizeOnStop: settings.meetingSummarize,
        liveTranscription: settings.meetingLiveTranscription
      });
      setMeetings((curr) => [rec, ...curr]);
      setActiveMeetingId(rec.id);
      setSelectedMeetingId(rec.id);
      setSection("meetings");
    } catch (err) {
      console.error(err);
    }
  };

  const handleRevealFlowbar = async () => {
    try {
      const flowbar = await Window.getByLabel("flowbar");
      if (flowbar) {
        await flowbar.show();
        await flowbar.setFocus();
      }
    } catch (err) {
      console.warn("Could not reveal flowbar:", err);
    }
  };

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
            ) : activeMeetingId ? (
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
            {settings.shortcuts?.dictate?.display ?? "Alt Space"} to dictate
          </small>
        </div>
      </aside>

      {/* Main Workspace Column */}
      <main style={{ flex: 1, display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
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
              onClick={() => setStorageError(null)}
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
                onClick={() => {
                  // Retry oldest recovery
                  const oldest = recoveries[0];
                  if (oldest) {
                    setRecoveries((r) => r.slice(1));
                  }
                }}
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
                    setRecoveries([]);
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
                Do you want to record: {startPrompt.title ?? startPrompt.event?.title ?? "Upcoming Meeting"}?
              </strong>
              {autoStartCountdown != null && (
                <span style={{ fontSize: 12, color: "#3b82f6", display: "block" }}>
                  Auto-starting in {autoStartCountdown}s…
                </span>
              )}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => handleCalendarStartDecision("record")}
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
              Meeting scheduled to end: {endPrompt.title ?? endPrompt.event?.title ?? "Meeting"}
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
                Finish & summarize
              </button>
              <button
                onClick={() => handleCalendarEndDecision("extend15")}
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
              settings={settings}
              calendarEvents={calendarEvents}
              onUpdateSettings={handleUpdateSettings}
              onRefreshCalendar={() => calendarRefresh().then(setCalendarEvents)}
              onRevealFlowbar={handleRevealFlowbar}
            />
          )}

          {section === "settings" && (
            <SettingsView
              settings={settings}
              calendarEvents={calendarEvents}
              onUpdateSettings={handleUpdateSettings}
              onRefreshCalendar={() => calendarRefresh().then(setCalendarEvents)}
              onClearNotesHistory={() => setNotes([])}
              onRevealFlowbar={handleRevealFlowbar}
            />
          )}
        </div>
      </main>
    </div>
  );
}
