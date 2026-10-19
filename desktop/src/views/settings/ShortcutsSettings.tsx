import React, { useEffect, useState } from "react";
import { AlertTriangle, Command, RotateCcw } from "lucide-react";
import { registerShortcuts, suspendShortcuts } from "../../api/parity";
import type {
  ParitySettings,
  ShortcutAction,
  ShortcutBinding
} from "../../api/parityTypes";

interface ShortcutsSettingsProps {
  settings: ParitySettings;
  onUpdateSettings: (settings: ParitySettings) => void;
}

const DEFAULT_SHORTCUTS: Record<ShortcutAction, ShortcutBinding> = {
  dictate: { accelerator: "Alt+Space", display: "Alt Space" },
  holdToTalk: { accelerator: "Alt+H", display: "Alt H" },
  meeting: { accelerator: "Alt+M", display: "Alt M" },
  screenshotArea: { accelerator: "Alt+1", display: "Alt 1" },
  screenshotWindow: { accelerator: "Alt+2", display: "Alt 2" },
  screenshotScreen: { accelerator: "Alt+3", display: "Alt 3" },
  pasteLast: { accelerator: "Alt+V", display: "Alt V" }
};

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

    // Suspend global shortcuts while recording to avoid triggering them
    suspendShortcuts(true).catch(() => undefined);

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.key === "Escape") {
        setRecordingAction(null);
        suspendShortcuts(false).catch(() => undefined);
        return;
      }

      // Modifier-only press: wait for letter / key
      if (["Control", "Alt", "Shift", "Meta"].includes(e.key)) {
        return;
      }

      const parts: string[] = [];
      if (e.ctrlKey) parts.push("Ctrl");
      if (e.altKey) parts.push("Alt");
      if (e.shiftKey) parts.push("Shift");
      if (e.metaKey) parts.push("Super");

      let keyName = e.key.toUpperCase();
      if (e.code.startsWith("Digit")) keyName = e.code.replace("Digit", "");
      if (e.code.startsWith("Key")) keyName = e.code.replace("Key", "");
      if (e.key === " ") keyName = "Space";

      parts.push(keyName);

      const accelerator = parts.join("+");
      const display = parts.join(" ");

      const nextShortcuts = {
        ...shortcuts,
        [recordingAction]: { accelerator, display }
      };

      const updatedSettings = {
        ...settings,
        shortcuts: nextShortcuts
      };

      onUpdateSettings(updatedSettings);
      registerShortcuts(nextShortcuts as Record<string, ShortcutBinding>).catch(console.error);

      setRecordingAction(null);
      suspendShortcuts(false).catch(() => undefined);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      suspendShortcuts(false).catch(() => undefined);
    };
  }, [recordingAction, shortcuts, settings, onUpdateSettings]);

  const handleRestoreDefaults = () => {
    const updated = {
      ...settings,
      shortcuts: DEFAULT_SHORTCUTS
    };
    onUpdateSettings(updated);
    registerShortcuts(DEFAULT_SHORTCUTS).catch(console.error);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 600, margin: "0 0 4px" }}>
            Keyboard Shortcuts
          </h3>
          <p style={{ fontSize: 13, color: "#6b7280", margin: 0 }}>
            Global hotkeys that work from any application on your PC.
          </p>
        </div>
        <button
          onClick={handleRestoreDefaults}
          style={{
            background: "transparent",
            border: "1px solid rgba(0,0,0,0.12)",
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
            background: "#fef3c7",
            border: "1px solid #fde68a",
            borderRadius: 8,
            padding: "10px 14px",
            display: "flex",
            alignItems: "center",
            gap: 10
          }}
        >
          <AlertTriangle size={18} color="#d97706" />
          <span style={{ fontSize: 12.5, color: "#92400e" }}>
            Some shortcuts have conflicting key combinations. Please assign distinct hotkeys.
          </span>
        </div>
      )}

      {/* Actions List */}
      <div
        style={{
          background: "#ffffff",
          border: "1px solid rgba(0,0,0,0.1)",
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
                alignItems: "center",
                justifyContent: "space-between",
                padding: "12px 16px",
                borderBottom:
                  idx === Object.keys(ACTION_DESCRIPTIONS).length - 1
                    ? "none"
                    : "1px solid rgba(0,0,0,0.06)",
                background: isRecording ? "#f0f7ff" : "transparent"
              }}
            >
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <strong style={{ fontSize: 13.5 }}>{info.title}</strong>
                  {hasConflict && (
                    <span style={{ fontSize: 11, color: "#d97706", fontWeight: 600 }}>
                      (Conflict)
                    </span>
                  )}
                </div>
                <span style={{ fontSize: 12, color: "#6b7280" }}>
                  {isRecording ? "Press the new keys on your keyboard. Esc cancels." : info.detail}
                </span>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span
                  style={{
                    background: hasConflict ? "#fee2e2" : "#f3f4f6",
                    border: hasConflict ? "1px solid #fca5a5" : "1px solid rgba(0,0,0,0.1)",
                    borderRadius: 6,
                    padding: "3px 8px",
                    fontFamily: "monospace",
                    fontSize: 12,
                    fontWeight: 600,
                    color: isRecording ? "#2563eb" : "#374151"
                  }}
                >
                  {isRecording ? "Listening…" : binding?.display ?? "Not set"}
                </span>

                <button
                  onClick={() => setRecordingAction(isRecording ? null : action)}
                  style={{
                    background: isRecording ? "#2563eb" : "#ffffff",
                    color: isRecording ? "#ffffff" : "#374151",
                    border: "1px solid rgba(0,0,0,0.15)",
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
