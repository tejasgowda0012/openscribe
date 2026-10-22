export const shortcutActions = ["dictate", "holdToTalk", "meeting", "screenshotArea", "screenshotWindow", "screenshotScreen", "pasteLast"] as const;
export type ShortcutAction = typeof shortcutActions[number];
export interface ShortcutBinding { accelerator: string; display: string }
export type ShortcutBindings = Partial<Record<ShortcutAction, ShortcutBinding>>;
const aliases: Record<string,string> = { ctrl: "Ctrl", control: "Ctrl", commandorcontrol: "Ctrl", cmdorctrl: "Ctrl", alt: "Alt", option: "Alt", shift: "Shift", super: "Super", win: "Super", meta: "Super", space: "Space", spacebar: "Space", esc: "Escape", escape: "Escape", return: "Enter", enter: "Enter", tab: "Tab", backspace: "Backspace", delete: "Delete", insert: "Insert", home: "Home", end: "End", pageup: "PageUp", pagedown: "PageDown", up: "ArrowUp", down: "ArrowDown", left: "ArrowLeft", right: "ArrowRight", arrowup: "ArrowUp", arrowdown: "ArrowDown", arrowleft: "ArrowLeft", arrowright: "ArrowRight", minus: "Minus", equal: "Equal", comma: "Comma", period: "Period", slash: "Slash", backslash: "Backslash", semicolon: "Semicolon", quote: "Quote", backquote: "Backquote", bracketleft: "BracketLeft", bracketright: "BracketRight" };
export function parseAccelerator(value: string): ShortcutBinding {
  const tokens = value.split("+").map(s => s.trim());
  if (tokens.some(s => !s)) throw new Error("Choose modifiers and one key.");
  const normalized = tokens.map(s => aliases[s.toLowerCase()] ?? (/^[a-z0-9]$/i.test(s) ? s.toUpperCase() : /^f([1-9]|1[0-9]|2[0-4])$/i.test(s) ? s.toUpperCase() : ""));
  if (normalized.some(s => !s)) throw new Error("Unsupported shortcut key.");
  const modifiers = normalized.filter(s => ["Ctrl","Alt","Shift","Super"].includes(s));
  const keys = normalized.filter(s => !modifiers.includes(s));
  if (modifiers.includes("Super")) throw new Error("Windows-key shortcuts are reserved for Windows.");
  if (new Set(modifiers).size !== modifiers.length || keys.length !== 1 || !modifiers.length) throw new Error("Choose modifiers and one key.");
  const ordered = ["Ctrl","Alt","Shift"].filter(s => modifiers.includes(s));
  const accelerator = [...ordered, keys[0]].join("+");
  if (["Alt+F4","Ctrl+Alt+Delete","Alt+Tab","Ctrl+Escape","Ctrl+Shift+Escape","Alt+Space"].includes(accelerator)) throw new Error("This shortcut is reserved by Windows.");
  return { accelerator, display: [...ordered, keys[0]].join(" ") };
}
export function validateBindings(bindings: ShortcutBindings): void {
  const seen = new Set<string>();
  for (const [action,binding] of Object.entries(bindings)) {
    if (!shortcutActions.includes(action as ShortcutAction)) throw new Error("Unknown shortcut action.");
    const { accelerator } = parseAccelerator(binding.accelerator);
    if (seen.has(accelerator)) throw new Error("Two actions use the same shortcut.");
    seen.add(accelerator);
  }
}
export const defaultBindings: ShortcutBindings = Object.fromEntries(Object.entries({ dictate: "Ctrl+Alt+Space", holdToTalk: "Ctrl+Alt+H", meeting: "Ctrl+Alt+M", screenshotArea: "Ctrl+Alt+4", screenshotWindow: "Ctrl+Alt+5", screenshotScreen: "Ctrl+Alt+3", pasteLast: "Ctrl+Alt+V" }).map(([action,key]) => [action, parseAccelerator(key)]));
export type ShortcutIntent = "startDictation" | "finishDictation" | Exclude<ShortcutAction,"dictate" | "holdToTalk">;
/** Mirrors AppController's 350 ms tap/hold threshold. The caller includes pending startup in recording. */
export class ShortcutInterpreter {
  private down = new Set<ShortcutAction>();
  private dictatePressedAt?: number;
  handle(action: ShortcutAction, state: "pressed" | "released", now: number, recording: boolean, busy = false): ShortcutIntent[] {
    if (state === "pressed") {
      if (this.down.has(action)) return [];
      this.down.add(action);
      if (action === "dictate") {
        if (recording) { this.dictatePressedAt = undefined; return ["finishDictation"]; }
        if (busy) return [];
        this.dictatePressedAt = now; return ["startDictation"];
      }
      return action === "holdToTalk" ? (busy || recording ? [] : ["startDictation"]) : [action];
    }
    if (!this.down.delete(action)) return [];
    if (action === "holdToTalk") return ["finishDictation"];
    if (action !== "dictate") return [];
    const pressed = this.dictatePressedAt; this.dictatePressedAt = undefined;
    return pressed != null && now-pressed >= 350 ? ["finishDictation"] : [];
  }
  reset() { this.down.clear(); this.dictatePressedAt = undefined; }
}
export const shortcutTitles: Record<ShortcutAction, string> = { dictate: "Dictate", holdToTalk: "Push to talk", meeting: "Start or stop a meeting", screenshotArea: "Screenshot an area", screenshotWindow: "Screenshot a window", screenshotScreen: "Screenshot the screen", pasteLast: "Paste last dictation" };
/** As on macOS, assigning a shortcut takes it from any other action so one press never does two things. */
export function assignShortcut(bindings: ShortcutBindings, action: ShortcutAction, binding: ShortcutBinding | null): { bindings: ShortcutBindings; displaced?: ShortcutAction } {
  const next: ShortcutBindings = { ...bindings };
  let displaced: ShortcutAction | undefined;
  if (binding) {
    for (const other of shortcutActions) {
      if (other !== action && next[other]?.accelerator.toLowerCase() === binding.accelerator.toLowerCase()) { delete next[other]; displaced = other; }
    }
    next[action] = binding;
  } else delete next[action];
  return { bindings: next, displaced };
}
/** The shortcut shown in hints: Dictate, or Push to talk when Dictate has none. */
export function dictationHint(bindings: ShortcutBindings, failures: readonly string[] = []): string | null {
  if (bindings.dictate) return failures.includes("dictate") ? null : bindings.dictate.display;
  if (bindings.holdToTalk) return failures.includes("holdToTalk") ? null : bindings.holdToTalk.display;
  return null;
}
