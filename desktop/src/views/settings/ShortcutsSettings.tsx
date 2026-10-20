import React, { useEffect, useState } from "react";
import { AlertTriangle, Command, RotateCcw } from "lucide-react";
import { suspendShortcuts } from "../../api/parity";
import type {
  ParitySettings,
  ShortcutAction,
  ShortcutBinding
} from "../../api/parityTypes";

import { defaultBindings, parseAccelerator, validateBindings } from "../../core/shortcuts";
import { reportUiError } from "../../workspaceEvents";

interface ShortcutsSettingsProps {
  settings: ParitySettings;
  onUpdateSettings: (settings: ParitySettings) => void | Promise<void>;
}

const DEFAULT_SHORTCUTS = defaultBindings;

const ACTION_DESCRIPTIONS: Record<
  ShortcutAction,
  { title: string; detail: string }
> = {
  dictate: {
    title: "Dictate",
    detail: "Tap to dictate, and tap again when done"
  },
  holdToTalk: {
    title: "Hold to talk",
    detail: "Hold to dictate, release to finish"
  },
  meeting: {
    title: "Start or stop meeting",
    detail: "Records your microphone and system audio"
  },
  screenshotArea: {
    title: "Area screenshot",
    detail: "Drag to capture a region and add it to today’s note"
  },
  screenshotWindow: {
    title: "Window screenshot",
    detail: "Click a window to capture it"
  },
  screenshotScreen: {
    title: "Screen screenshot",
    detail: "Capture the active monitor"
  },
  pasteLast: {
    title: "Paste last note",
    detail: "Paste the most recent dictation or note into the active app"
  }
};

export const ShortcutsSettings: React.FC<ShortcutsSettingsProps> = ({
  settings,
  onUpdateSettings
}) => {
  const [recordingAction, setRecordingAction] = useState<ShortcutAction | null>(null);

  const shortcuts = settings.shortcuts ?? {};

  // Detect conflicts: duplicate accelerators across actions
  const conflicts = React.useMemo(() => {
    const map = new Map<string, ShortcutAction[]>();
    (Object.keys(ACTION_DESCRIPTIONS) as ShortcutAction[]).forEach((action) => {
      const binding = shortcuts[action];
      if (binding?.accelerator) {
        const acc = binding.accelerator.toLowerCase();
        if (!map.has(acc)) map.set(acc, []);
        map.get(acc)!.push(action);
      }
    });

    const conflictingActions = new Set<ShortcutAction>();
    for (const [_, actions] of map.entries()) {
      if (actions.length > 1) {
        actions.forEach((a) => conflictingActions.add(a));
      }
    }
    return conflictingActions;
  }, [shortcuts]);

  useEffect(() => {
    if (!recordingAction) return;
    let active = true;
    const handleKeyDown = (event: KeyboardEvent) => {
      event.preventDefault(); event.stopPropagation();
      if (event.key === "Escape") { setRecordingAction(null); return; }
      if (["Control", "Alt", "Shift", "Meta"].includes(event.key)) return;
      try {
        const key = event.key === " " ? "Space" : event.code.startsWith("Key") ? event.code.slice(3) : event.code.startsWith("Digit") ? event.code.slice(5) : event.key;
        const binding = parseAccelerator([event.ctrlKey && "Ctrl", event.altKey && "Alt", event.shiftKey && "Shift", event.metaKey && "Super", key].filter(Boolean).join("+"));
        const next = { ...shortcuts, [recordingAction]: binding }; validateBindings(next);
        void Promise.resolve(onUpdateSettings({ ...settings, shortcuts: next })).catch(reportUiError).finally(() => { if (active) setRecordingAction(null); });
      } catch (error) { reportUiError(error); }
    };
    void suspendShortcuts(true).then(() => {
      if (active) window.addEventListener("keydown", handleKeyDown);
      else return suspendShortcuts(false);
    }).catch(error => { reportUiError(error); setRecordingAction(null); });
    return () => {
      active = false; window.removeEventListener("keydown", handleKeyDown);
      void suspendShortcuts(false).catch(reportUiError);
    };
  }, [recordingAction, shortcuts, settings, onUpdateSettings]);

  const handleRestoreDefaults = () => { void Promise.resolve(onUpdateSettings({ ...settings, shortcuts: DEFAULT_SHORTCUTS })).catch(reportUiError); };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header */}
      <div className="ui-toolbar" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 600, margin: "0 0 4px" }}>
            Keyboard Shortcuts
          </h3>
          <p style={{ fontSize: 13, color: "var(--os-ink-muted)", margin: 0 }}>
            Global hotkeys that work from any application on your PC.
          </p>
        </div>
        <button
          onClick={handleRestoreDefaults}
          style={{
            background: "transparent",
            border: "1px solid var(--os-line)",
            borderRadius: 6,
            padding: "5px 10px",
            fontSize: 12,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 5
          }}
        >
          <RotateCcw size={12} /> Restore defaults
        </button>
      </div>

      {/* Conflict Warning */}
      {conflicts.size > 0 && (
        <div
          style={{
            background: "var(--os-warning-soft)",
            border: "1px solid var(--os-line)",
            borderRadius: 8,
            padding: "10px 14px",
            display: "flex",
            alignItems: "center",
            gap: 10
          }}
        >
          <AlertTriangle size={18} color="var(--os-warning)" />
          <span style={{ fontSize: 12.5, color: "var(--os-ink)" }}>
            Some shortcuts have conflicting key combinations. Please assign distinct hotkeys.
          </span>
        </div>
      )}

      {/* Actions List */}
      <div
        style={{
          background: "var(--os-surface)",
          border: "1px solid var(--os-line)",
          borderRadius: 10,
          overflow: "hidden"
        }}
      >
        {(Object.keys(ACTION_DESCRIPTIONS) as ShortcutAction[]).map((action, idx) => {
          const info = ACTION_DESCRIPTIONS[action];
          const binding = shortcuts[action] ?? DEFAULT_SHORTCUTS[action];
          const isRecording = recordingAction === action;
          const hasConflict = conflicts.has(action);

          return (
            <div
              key={action}
              style={{
                display: "flex",
                flexWrap: "wrap", gap: 12,
                alignItems: "center",
                justifyContent: "space-between",
                padding: "12px 16px",
                borderBottom:
                  idx === Object.keys(ACTION_DESCRIPTIONS).length - 1
                    ? "none"
                    : "1px solid var(--os-line)",
                background: isRecording ? "var(--os-accent-soft)" : "transparent"
              }}
            >
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <strong style={{ fontSize: 13.5 }}>{info.title}</strong>
                  {hasConflict && (
                    <span style={{ fontSize: 11, color: "var(--os-ink)", fontWeight: 600 }}>
                      (Conflict)
                    </span>
                  )}
                </div>
                <span style={{ fontSize: 12, color: "var(--os-ink-muted)" }}>
                  {isRecording ? "Press the new keys on your keyboard. Esc cancels." : info.detail}
                </span>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span
                  style={{
                    background: hasConflict ? "var(--os-recording-soft)" : "var(--os-surface-muted)",
                    border: hasConflict ? "1px solid var(--os-line)" : "1px solid var(--os-line)",
                    borderRadius: 6,
                    padding: "3px 8px",
                    fontFamily: "monospace",
                    fontSize: 12,
                    fontWeight: 600,
                    color: isRecording ? "color-mix(in srgb, var(--os-accent) 90%, var(--os-ink))" : "var(--os-ink)"
                  }}
                >
                  {isRecording ? "Listening…" : binding?.display ?? "Not set"}
                </span>

                <button
                  onClick={() => setRecordingAction(isRecording ? null : action)}
                  style={{
                    background: isRecording ? "var(--os-accent)" : "var(--os-surface)",
                    color: isRecording ? "var(--os-surface)" : "var(--os-ink)",
                    border: "1px solid var(--os-line)",
                    borderRadius: 6,
                    padding: "4px 10px",
                    fontSize: 12,
                    fontWeight: 500,
                    cursor: "pointer"
                  }}
                >
                  {isRecording ? "Cancel" : "Change"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
