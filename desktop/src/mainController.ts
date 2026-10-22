import { emit, listen } from "@tauri-apps/api/event";
import { Window } from "@tauri-apps/api/window";
import * as api from "./api/parity";
import type { CalendarEvent, MeetingRecord, ParitySettings, VoiceNote } from "./api/parityTypes";
import type { CalendarPrompt } from "./core/calendarPolicy";
import { pasteLastText } from "./core/dailyNotes";
import { shortcutActions, ShortcutInterpreter, type ShortcutAction, validateBindings } from "./core/shortcuts";
import { DictationController, type DictationJob, type DictationPhase } from "./dictation";
import { cleanupInstructions } from "./defaults";
import { ListenerScope } from "./listeners";
import { native } from "./native";
import { DictationRecovery } from "./recovery";
import { defaultParitySettings, normalizeSettings } from "./settings";
import { expandSnippet } from "./text";
import type { AudioInput } from "./types";
import type { WorkspaceIntent, WorkspaceStatus } from "./workspaceEvents";

export interface MainState {
  settings: ParitySettings; notes: VoiceNote[]; meetings: MeetingRecord[]; recoveries: DictationJob[];
  calendarEvents: CalendarEvent[]; inputs: AudioInput[]; phase: DictationPhase; loaded: boolean;
  storageError: string | null; notice: string | null; startPrompt: CalendarPrompt | null; endPrompt: CalendarPrompt | null;
  navigation?: { section: "notes" | "meetings" | "settings"; meetingId?: string };
}

/** One instance lives in main, including while its window is hidden. */
export class MainController {
  state: MainState = { settings: defaultParitySettings, notes: [], meetings: [], recoveries: [], calendarEvents: [], inputs: [],
    phase: "idle", loaded: false, storageError: null, notice: null, startPrompt: null, endPrompt: null };
  private observers = new Set<() => void>();
  private initialization?: Promise<void>;
  private scope = new ListenerScope();
  private interpreter = new ShortcutInterpreter();
  private recovery = new DictationRecovery();
  private ready = false;
  private meetingTransition = false;
  private busyUpdate: Promise<unknown> = Promise.resolve();
  private settingsWrites: Promise<unknown> = Promise.resolve();
  private notesRefresh = 0;
  readonly dictation = new DictationController({
    settings: () => this.state.settings,
    start: async device => { await this.busyUpdate; return native.startRecording(device); },
    stop: native.stopRecording,
    // Native builds the complete provider hints from the persisted profile.
    transcribe: async (path, settings) => (await native.transcribe(path, settings)).text,
    transform: async (text, settings) => {
      const result = await api.applyDictionary(text, settings);
      if (result.learnedWords.length) {
        await this.updateSettings({ ...this.state.settings, customVocabulary: [...new Set([...this.state.settings.customVocabulary, ...result.learnedWords])] });
      }
      const snippet = expandSnippet(result.text, settings.snippets);
      if (snippet) return snippet;
      if (!settings.cleanupEnabled) return result.text;
      let cleaned: string;
      try {
        cleaned = (await native.clean(result.text, settings, `${cleanupInstructions[settings.cleanupStrength]}\nUse a ${settings.writingTone} tone. Return only the revised text.`)).text;
      } catch (error) {
        // As on macOS, a cleanup failure keeps the transcript instead of holding the dictation back.
        this.error(`Transcript saved; cleanup unavailable: ${String(error)}`);
        return result.text;
      }
      if (!cleaned.trim()) return result.text;
      return expandSnippet(cleaned, settings.snippets) ?? cleaned;
    },
    save: async capture => {
      const saved = await api.addCapture(capture);
      this.patch({ notes: [saved, ...this.state.notes.filter(note => note.id !== saved.id)] });
    },
    persist: jobs => this.recovery.persist(jobs), removeAudio: native.deleteRecording, paste: native.paste,
    changed: (phase, recoveries) => {
      this.patch({ phase, recoveries });
      // Serialize transitions so an older idle update cannot overtake a new start.
      this.busyUpdate = this.busyUpdate.catch(() => undefined).then(() => native.setDictationBusy(phase !== "idle"));
      void this.busyUpdate.catch(this.error);
    },
    error: error => this.error(error)
  });
  subscribe = (observer: () => void) => { this.observers.add(observer); return () => { this.observers.delete(observer); }; };
  snapshot = () => this.state;
  get activeMeeting() { return this.state.meetings.find(record => record.status === "recording" || record.status === "paused") ?? null; }
  private patch(update: Partial<MainState>) {
    this.state = { ...this.state, ...update }; this.observers.forEach(observer => observer());
    void this.publish().catch(console.error);
  }
  private publish = () => emit("workspace://status", {
    phase: this.state.phase, settings: this.state.settings, activeMeeting: this.activeMeeting,
    processingMeeting: this.meetingTransition || this.state.meetings.some(m => m.status === "transcribing" || m.status === "summarizing"), notice: this.state.notice
  } satisfies WorkspaceStatus);
  error = (error: unknown) => { this.patch({ notice: String(error) }); };
  clearNotice = () => this.patch({ notice: null });
  clearStorageError = () => this.patch({ storageError: null });
  initialize() {
    return this.initialization ??= this.initializeOnce();
  }
  private async initializeOnce() {
    const add = (promise: Promise<() => void>) => this.scope.add(promise, this.error);
    add(api.parityEvents.onMeetingChanged(record => {
      this.patch({ meetings: [record, ...this.state.meetings.filter(m => m.id !== record.id)] });
      void this.refreshNotes().catch(this.error);
    }));
    add(api.parityEvents.onCaptureOcr(() => { void this.refreshNotes().catch(this.error); }));
    add(listen("capture://added", () => { void this.refreshNotes().catch(this.error); }));
    add(api.parityEvents.onCalendarPromptStart(startPrompt => this.patch({ startPrompt })));
    add(api.parityEvents.onCalendarPromptEnd(endPrompt => this.patch({ endPrompt })));
    add(api.parityEvents.onCalendarPromptClosed(({ occurrenceId, kind }) => {
      const prompt = kind === "start" ? this.state.startPrompt : this.state.endPrompt;
      if (prompt?.event.id === occurrenceId) this.patch(kind === "start" ? { startPrompt: null } : { endPrompt: null });
    }));
    add(api.parityEvents.onCalendarError(this.error));
    add(listen<string>("app://error", event => this.error(event.payload)));
    add(listen<string>("capture://error", event => this.error(event.payload)));
    add(api.parityEvents.onShortcutAction(({ action, state }) => {
      if (!this.ready || !shortcutActions.includes(action as ShortcutAction)) return;
      const phase = this.dictation.phase;
      for (const intent of this.interpreter.handle(action as ShortcutAction, state, performance.now(), phase === "starting" || phase === "recording", phase !== "idle" || !!this.activeMeeting || this.meetingTransition)) {
        if (intent === "startDictation") void this.startDictation();
        else if (intent === "finishDictation") void this.dictation.finish();
        else if (intent.startsWith("screenshot")) void this.intent({ action: "screenshot", kind: intent.slice(10).toLowerCase() as "area" | "window" | "screen" });
        else void this.intent({ action: intent as "meeting" | "pasteLast" });
      }
    }));
    add(listen<WorkspaceIntent>("workspace://intent", event => { void this.intent(event.payload).catch(this.error); }));
    add(listen("workspace://request-state", () => { void this.publish().catch(this.error); }));
    add(listen<string>("workspace://error", event => this.error(event.payload)));
    add(listen("workspace://refresh-notes", () => { void this.refreshNotes().catch(this.error); }));
    add(listen("workspace://refresh-meetings", () => { void this.refreshMeetings().catch(this.error); }));
    // Load all durable state before capture actions become available.
    const results = await Promise.allSettled([
      api.loadProfile().then(profile => this.patch({ settings: normalizeSettings(profile.settings), notes: profile.notes, storageError: profile.storageError ?? null })),
      api.listMeetings().then(meetings => this.patch({ meetings })),
      native.listInputs().then(inputs => this.patch({ inputs })),
      this.recovery.load().then(recoveries => { this.dictation.jobs = recoveries; this.patch({ recoveries }); })
    ]);
    results.forEach(result => { if (result.status === "rejected") this.error(result.reason); });
    this.ready = results[0].status === "fulfilled" && results[3].status === "fulfilled";
    if (this.ready) {
      try { await api.registerShortcuts(this.state.settings.shortcuts); await native.setDictationBusy(false); }
      catch (error) { this.error(error); }
    }
    this.patch({ loaded: true });
    void this.refreshCalendar().catch(this.error);
  }
  async refreshNotes() {
    const request = ++this.notesRefresh;
    const profile = await api.loadProfile();
    if (request === this.notesRefresh) this.patch({ notes: profile.notes, storageError: profile.storageError ?? null });
  }
  async refreshMeetings() { this.patch({ meetings: await api.listMeetings() }); await this.refreshNotes(); }
  async refreshCalendar() { this.patch({ calendarEvents: await api.calendarRefresh() }); }
  updateSettings = (settings: ParitySettings): Promise<void> => {
    const write = this.settingsWrites.catch(() => undefined).then(async () => {
      validateBindings(settings.shortcuts);
      const previous = this.state.settings;
      const bindingsChanged = JSON.stringify(previous.shortcuts) !== JSON.stringify(settings.shortcuts);
      if (bindingsChanged) await api.registerShortcuts(settings.shortcuts);
      try { await api.saveSettings(settings); }
      catch (error) { if (bindingsChanged) await api.registerShortcuts(previous.shortcuts).catch(this.error); throw error; }
      this.patch({ settings });
      if (previous.calendarEnabled !== settings.calendarEnabled || JSON.stringify(previous.calendarSources) !== JSON.stringify(settings.calendarSources)) void this.refreshCalendar().catch(this.error);
    });
    this.settingsWrites = write;
    return write;
  };
  setNotes = (notes: VoiceNote[]) => this.patch({ notes });
  setMeetings = (_meetings: MeetingRecord[]) => { void this.refreshMeetings().catch(this.error); };
  async clearNotes() {
    try { for (const note of [...this.state.notes]) await api.deleteNote(note.id); }
    finally { await this.refreshNotes(); }
  }
  async decide(prompt: CalendarPrompt, decision: api.CalendarDecision) {
    await api.calendarDecision(prompt.event.id, decision);
    if (prompt.kind === "start" && this.state.startPrompt?.event.id === prompt.event.id) this.patch({ startPrompt: null });
    if (prompt.kind === "end" && this.state.endPrompt?.event.id === prompt.event.id) this.patch({ endPrompt: null });
  }
  async startDictation() {
    if (!this.ready) { this.error("Recording is unavailable until profile and recovery storage load successfully."); return; }
    if (this.activeMeeting || this.meetingTransition) { this.error("Finish the current meeting before starting dictation."); return; }
    await this.dictation.start();
  }
  async intent(intent: WorkspaceIntent) {
    try {
      if (intent.action === "dismissNotice") this.clearNotice();
      else if (intent.action === "dictate") {
        if (this.dictation.phase === "recording" || this.dictation.phase === "starting") await this.dictation.finish();
        else if (this.dictation.phase === "idle") await this.startDictation();
      } else if (intent.action === "cancelDictation") await this.dictation.finish(true);
      else if (intent.action === "pasteLast") {
        const text = pasteLastText(this.state.notes);
        if (!text) throw new Error("There is no saved text to paste yet.");
        await native.paste(text);
      } else if (intent.action === "meeting") {
        if (this.meetingTransition) return;
        if (this.dictation.phase !== "idle") throw new Error("Finish dictation before starting a meeting.");
        if (!this.ready) throw new Error("Recording is unavailable until your profile loads.");
        this.meetingTransition = true; void this.publish();
        try {
          if (this.activeMeeting) await api.finishMeeting();
          else {
            const settings = this.state.settings;
            const record = await api.startMeeting({ title: `Meeting ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
              microphone: settings.meetingMicrophone, systemAudio: settings.meetingSystemAudio,
              summarizeOnStop: settings.meetingSummarize, liveTranscription: settings.meetingLiveTranscription });
            this.patch({ meetings: [record, ...this.state.meetings.filter(m => m.id !== record.id)], navigation: { section: "meetings", meetingId: record.id } });
          }
          await this.refreshMeetings();
        } finally { this.meetingTransition = false; void this.publish(); }
      } else if (intent.action === "pauseMeeting") {
        if (this.activeMeeting?.status === "paused") await api.resumeMeeting();
        else if (this.activeMeeting) await api.pauseMeeting();
      } else if (intent.action === "screenshot") {
        const capture = await api.takeScreenshot(intent.kind);
        // The backend already saved it. Never call add_capture a second time.
        if (capture) { await this.refreshNotes(); await emit("workspace://screenshot", capture); }
      } else if (intent.action === "placement") await this.updateSettings({ ...this.state.settings, flowbarPlacement: intent.placement });
      else if (intent.action === "open") {
        this.patch({ navigation: { section: intent.section ?? "notes", meetingId: intent.meetingId } });
        const main = await Window.getByLabel("main"); await main?.show(); await main?.setFocus();
      }
    } catch (error) { this.error(error); }
  }
}

export const mainController = new MainController();
