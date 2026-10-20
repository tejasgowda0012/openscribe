import React, { useState } from "react";
import {
  CalendarDays,
  Command,
  KeyRound,
  Lock,
  Mic,
  Moon,
  Monitor,
  Network,
  RotateCcw,
  Sliders,
  Sparkles,
  Sun,
  Trash2,
  Volume2
} from "lucide-react";
import type { CalendarEvent, ParitySettings } from "../../api/parityTypes";
import type { AudioInput } from "../../types";
import { ProvidersSettings } from "./ProvidersSettings";
import { CalendarSettings } from "./CalendarSettings";
import { PersonalizationSettings } from "./PersonalizationSettings";
import { ShortcutsSettings } from "./ShortcutsSettings";
import { ConfirmDialog } from "../ConfirmDialog";

interface SettingsViewProps {
  settings: ParitySettings;
  calendarEvents?: CalendarEvent[];
  onUpdateSettings: (settings: ParitySettings) => void;
  onRefreshCalendar?: () => void;
  onClearNotesHistory?: () => void;
  onRevealFlowbar?: () => void;
  inputs?: AudioInput[];
  initialSection?: "general" | "calendar";
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  calendarEvents = [],
  onUpdateSettings,
  onRefreshCalendar,
  onClearNotesHistory,
  onRevealFlowbar,
  inputs = [],
  initialSection = "general"
}) => {
  const [section, setSection] = useState<
    "general" | "providers" | "shortcuts" | "personalize" | "calendar" | "privacy"
  >(initialSection);

  const [confirmClear, setConfirmClear] = useState(false);

  const updateSetting = <K extends keyof ParitySettings>(
    key: K,
    val: ParitySettings[K]
  ) => {
    const next = { ...settings, [key]: val };
    onUpdateSettings(next);
  };

  return (
    <div className="settings-workspace" style={{ display: "flex", width: "100%", height: "100%", overflow: "hidden" }}>
      {/* Subnav sidebar */}
      <div
        className="settings-navigation"
        style={{
          width: 220, flexShrink: 0,
          borderRight: "1px solid var(--os-line)",
          background: "var(--os-background)",
          padding: "20px 12px",
          display: "flex",
          flexDirection: "column",
          gap: 4
        }}
      >
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 16px 8px" }}>
          Settings
        </h2>

        {[
          { id: "general", label: "General", icon: Sliders },
          { id: "providers", label: "Providers & Audio", icon: Mic },
          { id: "shortcuts", label: "Shortcuts", icon: Command },
          { id: "personalize", label: "Personalization", icon: Sparkles },
          { id: "calendar", label: "Calendar", icon: CalendarDays },
          { id: "privacy", label: "Privacy", icon: Lock }
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            aria-current={section === id ? "page" : undefined}
            onClick={() => setSection(id as any)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 12px",
              borderRadius: 6,
              background: section === id ? "var(--os-accent-soft)" : "transparent",
              color: section === id ? "color-mix(in srgb, var(--os-accent) 90%, var(--os-ink))" : "var(--os-ink)",
              border: "none",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: section === id ? 600 : 500,
              textAlign: "left"
            }}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      {confirmClear && (
        <ConfirmDialog title="Clear note history?" confirmLabel="Delete all notes" onCancel={() => setConfirmClear(false)} onConfirm={() => { onClearNotesHistory?.(); setConfirmClear(false); }}>
          All local notes will be permanently deleted.
        </ConfirmDialog>
      )}

      {/* Main content pane */}
      <div className="settings-content" style={{ flex: 1, minWidth: 0, minHeight: 0, height: "100%", overflowY: "auto", padding: "28px 36px" }}>
        {section === "general" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 650 }}>
            {/* Appearance */}
            <div
              style={{
                background: "var(--os-surface)",
                border: "1px solid var(--os-line)",
                borderRadius: 10,
                padding: "16px 20px"
              }}
            >
              <h4 style={{ fontSize: 13.5, fontWeight: 600, margin: "0 0 10px" }}>
                Appearance
              </h4>
              <div className="appearance-options" role="group" aria-label="Appearance">
                {([
                  { value: "system", label: "System", icon: Monitor },
                  { value: "light", label: "Light", icon: Sun },
                  { value: "dark", label: "Dark", icon: Moon }
                ] as const).map(({ value, label, icon: Icon }) => (
                  <button
                    key={value}
                    aria-pressed={settings.theme === value}
                    onClick={() => updateSetting("theme", value)}
                    className="appearance-option"
                  >
                    <Icon size={14} /> {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Flowbar Settings */}
            <div
              style={{
                background: "var(--os-surface)",
                border: "1px solid var(--os-line)",
                borderRadius: 10,
                padding: "16px 20px",
                display: "flex",
                flexDirection: "column",
                gap: 16
              }}
            >
              <h4 style={{ fontSize: 13.5, fontWeight: 600, margin: 0 }}>
                Flowbar Behavior
              </h4>
              <div className="settings-row" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <strong style={{ fontSize: 13, display: "block" }}>
                    Keep on screen when idle
                  </strong>
                  <span style={{ fontSize: 12, color: "var(--os-ink-muted)" }}>
                    Shows a quiet sliver when idle so it's always ready.
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={settings.showOverlayWhenIdle}
                  onChange={(e) => updateSetting("showOverlayWhenIdle", e.target.checked)}
                />
              </div>

              <div style={{ height: 1, background: "var(--os-line)" }} />

              <div className="settings-row" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <strong style={{ fontSize: 13, display: "block" }}>
                    Default Position
                  </strong>
                  <span style={{ fontSize: 12, color: "var(--os-ink-muted)" }}>
                    Where the Flowbar sits when not dragged manually.
                  </span>
                </div>
                <select
                  value={settings.overlayPosition ?? "bottom-center"}
                  onChange={(e) => {
                    const next = {
                      ...settings,
                      overlayPosition: e.target.value,
                      flowbarPlacement: null
                    };
                    onUpdateSettings(next);
                  }}
                  style={{
                    padding: "5px 10px",
                    borderRadius: 6,
                    border: "1px solid var(--os-line)",
                    fontSize: 12.5
                  }}
                >
                  <option value="bottom-center">Bottom center</option>
                  <option value="bottom-left">Bottom left</option>
                  <option value="bottom-right">Bottom right</option>
                  <option value="top-center">Top center</option>
                  <option value="top-right">Top right</option>
                </select>
              </div>

              {onRevealFlowbar && (
                <div style={{ paddingTop: 4 }}>
                  <button
                    onClick={onRevealFlowbar}
                    style={{
                      background: "var(--os-surface-muted)",
                      border: "1px solid var(--os-line)",
                      borderRadius: 6,
                      padding: "5px 12px",
                      fontSize: 12,
                      cursor: "pointer"
                    }}
                  >
                    Can’t find it? Show me the Flowbar
                  </button>
                </div>
              )}
            </div>

            {/* Dictation options */}
            <div
              style={{
                background: "var(--os-surface)",
                border: "1px solid var(--os-line)",
                borderRadius: 10,
                padding: "16px 20px",
                display: "flex",
                flexDirection: "column",
                gap: 16
              }}
            >
              <h4 style={{ fontSize: 13.5, fontWeight: 600, margin: 0 }}>
                Dictation & Audio
              </h4>
              <div className="settings-row" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <strong style={{ fontSize: 13, display: "block" }}>
                    Paste into focused app
                  </strong>
                  <span style={{ fontSize: 12, color: "var(--os-ink-muted)" }}>
                    Immediately pastes your finalized transcription into the active window.
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={settings.pasteIntoFocusedApp}
                  onChange={(e) => updateSetting("pasteIntoFocusedApp", e.target.checked)}
                />
              </div>

              <div style={{ height: 1, background: "var(--os-line)" }} />

              <div className="settings-row" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <strong style={{ fontSize: 13, display: "block" }}>
                    Interaction sounds
                  </strong>
                  <span style={{ fontSize: 12, color: "var(--os-ink-muted)" }}>
                    Plays subtle chimes on start and finish.
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={settings.interactionSounds}
                  onChange={(e) => updateSetting("interactionSounds", e.target.checked)}
                />
              </div>
            </div>
          </div>
        )}

        {section === "providers" && <ProvidersSettings settings={settings} inputs={inputs} onUpdateSettings={onUpdateSettings} />}
        {section === "shortcuts" && (
          <ShortcutsSettings settings={settings} onUpdateSettings={onUpdateSettings} />
        )}

        {section === "personalize" && (
          <PersonalizationSettings settings={settings} onUpdateSettings={onUpdateSettings} />
        )}

        {section === "calendar" && (
          <CalendarSettings
            settings={settings}
            events={calendarEvents}
            onUpdateSettings={onUpdateSettings}
            onRefreshCalendar={onRefreshCalendar}
          />
        )}

        {section === "privacy" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 650 }}>
            <div
              style={{
                background: "var(--os-surface)",
                border: "1px solid var(--os-line)",
                borderRadius: 10,
                padding: "16px 20px"
              }}
            >
              <h4 style={{ fontSize: 13.5, fontWeight: 600, margin: "0 0 6px" }}>
                Local Data & Privacy
              </h4>
              <p style={{ fontSize: 12.5, color: "var(--os-ink-muted)", margin: "0 0 16px" }}>
                Your notes, screenshots, and meeting recordings are stored on this device.
                OpenScribe never syncs your data to any cloud service.
              </p>

              {onClearNotesHistory && (
                <button
                  onClick={() => setConfirmClear(true)}
                  style={{
                    background: "var(--os-recording-soft)",
                    border: "1px solid var(--os-line)",
                    color: "color-mix(in srgb, var(--os-recording) 72%, var(--os-ink))",
                    borderRadius: 6,
                    padding: "6px 12px",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 6
                  }}
                >
                  <Trash2 size={13} /> Clear note history
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
