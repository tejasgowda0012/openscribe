import type { NoteCapture, ParitySettings } from "./api/parityTypes";

export type DictationPhase = "idle" | "starting" | "recording" | "transcribing" | "cleaning";
export interface DictationJob { id: string; path: string; duration: number; createdAt: string; rawText?: string; text?: string }
export interface DictationDependencies {
  settings(): ParitySettings;
  start(device?: string): Promise<unknown>;
  stop(): Promise<{ path: string; duration: number }>;
  transcribe(path: string, settings: ParitySettings): Promise<string>;
  transform(text: string, settings: ParitySettings): Promise<string>;
  save(capture: NoteCapture): Promise<unknown>;
  persist(jobs: DictationJob[]): Promise<void>;
  removeAudio(path: string): Promise<unknown>;
  paste(text: string): Promise<unknown>;
  changed(phase: DictationPhase, jobs: DictationJob[]): void;
  error(error: unknown): void;
}

/** The main window owns capture; other windows send intents to this controller. */
export class DictationController {
  phase: DictationPhase = "idle";
  jobs: DictationJob[] = [];
  private pendingStop = false;
  private pendingCancel = false;
  constructor(private deps: DictationDependencies) {}
  private changed() { this.deps.changed(this.phase, [...this.jobs]); }
  private async persist() { await this.deps.persist(this.jobs); this.changed(); }
  async start() {
    if (this.phase !== "idle") return;
    this.phase = "starting"; this.pendingStop = false; this.pendingCancel = false; this.changed();
    try {
      await this.deps.start(this.deps.settings().microphoneDeviceUID || undefined);
      this.phase = "recording"; this.changed();
      if (this.pendingStop) await this.finish(this.pendingCancel);
    } catch (error) { this.phase = "idle"; this.changed(); this.deps.error(error); }
  }
  async finish(cancel = false) {
    if (this.phase === "starting") { this.pendingStop = true; this.pendingCancel = cancel; return; }
    if (this.phase !== "recording") return;
    this.phase = "transcribing"; this.changed();
    try {
      const recording = await this.deps.stop();
      if (cancel) { await this.deps.removeAudio(recording.path); return; }
      const job: DictationJob = { ...recording, id: crypto.randomUUID().toUpperCase(), createdAt: new Date().toISOString().replace(/\.\d{3}Z$/, "Z") };
      this.jobs.push(job);
      await this.persist(); // Keep the recording recoverable before any provider request.
      await this.process(job);
    } catch (error) { this.deps.error(error); }
    finally { this.phase = "idle"; this.changed(); }
  }
  async retry() {
    if (this.phase !== "idle" || !this.jobs.length) return;
    this.phase = "transcribing"; this.changed();
    try { await this.process(this.jobs[0]); }
    catch (error) { this.deps.error(error); }
    finally { this.phase = "idle"; this.changed(); }
  }
  private async process(job: DictationJob) {
    const settings = this.deps.settings();
    if (job.rawText == null) { job.rawText = await this.deps.transcribe(job.path, settings); await this.persist(); }
    if (job.text == null) {
      this.phase = "cleaning"; this.changed();
      job.text = await this.deps.transform(job.rawText, settings);
      await this.persist();
    }
    const text = job.text;
    await this.deps.save({ id: job.id, createdAt: job.createdAt, title: text.slice(0, 80), rawText: job.rawText, text, duration: job.duration, kind: "dictation" });
    const old = this.jobs; this.jobs = this.jobs.filter(j => j.id !== job.id);
    try { await this.persist(); } catch (error) { this.jobs = old; throw error; }
    if (!settings.saveRawAudio) await this.deps.removeAudio(job.path).catch(this.deps.error);
    if (settings.pasteIntoFocusedApp) await this.deps.paste(text).catch(this.deps.error);
  }
  async discard() {
    if (this.phase !== "idle") return;
    const old = this.jobs; this.jobs = [];
    try { await this.persist(); } catch (error) { this.jobs = old; this.deps.error(error); return; }
    for (const job of old) await this.deps.removeAudio(job.path).catch(this.deps.error);
  }
}
