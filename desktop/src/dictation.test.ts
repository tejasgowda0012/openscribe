import { describe, expect, it, vi } from "vitest";
import { DictationController, type DictationDependencies } from "./dictation";
import type { ParitySettings } from "./api/parityTypes";
import { defaultParitySettings } from "./settings";

function fixture(patch: Partial<DictationDependencies> = {}) {
  const events: string[] = [];
  const deps: DictationDependencies = {
    settings: () => ({ microphoneDeviceUID: "", saveRawAudio: false, pasteIntoFocusedApp: true } as ParitySettings),
    start: vi.fn(async () => { events.push("start"); }),
    stop: vi.fn(async () => { events.push("stop"); return { path: "test.wav", duration: 3 }; }),
    transcribe: vi.fn(async () => { events.push("transcribe"); return "Original"; }),
    transform: vi.fn(async () => "Edited"),
    save: vi.fn(async () => { events.push("save"); }),
    persist: vi.fn(async () => { events.push("persist"); }),
    removeAudio: vi.fn(async () => { events.push("delete"); }),
    paste: vi.fn(async () => { events.push("paste"); }),
    changed: vi.fn(), error: vi.fn(), ...patch
  };
  return { controller: new DictationController(deps), deps, events };
}
describe("authoritative dictation lifecycle", () => {
  it("plays the start cue once recording and the stop cue only for a kept recording", async () => {
    const cues: string[] = [];
    const f = fixture({ cue: cue => { cues.push(cue); f.events.push(`cue:${cue}`); } });
    await f.controller.start(); await f.controller.finish();
    expect(f.events.slice(0, 4)).toEqual(["start", "cue:start", "stop", "cue:stop"]);
    cues.length = 0;
    await f.controller.start(); await f.controller.finish(true);
    expect(cues).toEqual(["start"]);
  });
  it("cancels processing without saving a late response or deleting an older recovery", async () => {
    let resolve!: (text: string) => void;
    const pending = new Promise<string>(r => { resolve = r; });
    const f = fixture({ transcribe: vi.fn(() => pending), cancelProcessing: vi.fn(async () => undefined) });
    f.controller.jobs = [{ id: "older", path: "older.wav", duration: 1, createdAt: "2026-01-01T00:00:00Z" }];
    await f.controller.start();
    const processing = f.controller.finish();
    await vi.waitFor(() => expect(f.deps.transcribe).toHaveBeenCalled());
    await f.controller.finish(true); resolve("Late response"); await processing;
    expect(f.deps.cancelProcessing).toHaveBeenCalledOnce();
    expect(f.deps.save).not.toHaveBeenCalled(); expect(f.deps.paste).not.toHaveBeenCalled();
    expect(f.controller.jobs.map(job => job.id)).toEqual(["older"]);
    expect(f.deps.removeAudio).toHaveBeenCalledWith("test.wav");
    expect(f.deps.error).not.toHaveBeenCalled();
  });
  it("uses the source app writing style and saves its identity", async () => {
    const settings: ParitySettings = { ...defaultParitySettings, saveRawAudio: false, pasteIntoFocusedApp: false, writingTone: "natural", appWritingTones: { "c:\\chat.exe": "casual" } };
    const f = fixture({ settings: () => settings, sourceApp: async () => ({ name: "Chat", id: "C:\\Chat.exe" }) });
    await f.controller.start(); await f.controller.finish();
    expect(f.deps.transform).toHaveBeenCalledWith("Original", expect.objectContaining({ writingTone: "casual" }));
    expect(f.deps.save).toHaveBeenCalledWith(expect.objectContaining({ sourceApplication: "Chat", sourceBundleIdentifier: "C:\\Chat.exe" }));
  });
  it("finishes a hold released while microphone startup is pending", async () => {
    let ready!: () => void;
    const f = fixture({ start: () => new Promise<void>(r => { ready = r; }) });
    const starting = f.controller.start();
    expect(f.controller.phase).toBe("starting");
    await f.controller.finish(); ready(); await starting;
    expect(f.deps.stop).toHaveBeenCalledTimes(1);
    expect(f.deps.save).toHaveBeenCalledWith(expect.objectContaining({ rawText: "Original", text: "Edited", kind: "dictation" }));
    expect(f.controller.phase).toBe("idle");
  });
  it("persists a recovery before upload and saves the note before deleting audio", async () => {
    const f = fixture(); await f.controller.start(); await f.controller.finish();
    expect(f.events.indexOf("persist")).toBeLessThan(f.events.indexOf("transcribe"));
    expect(f.events.indexOf("save")).toBeLessThan(f.events.indexOf("delete"));
    expect(f.events.indexOf("delete")).toBeLessThan(f.events.indexOf("paste"));
    expect(f.controller.jobs).toEqual([]);
  });
  it("retains audio and checkpoint on a failed save, then retries without a second provider call", async () => {
    const f = fixture({ save: vi.fn().mockRejectedValueOnce(new Error("Disk full")).mockResolvedValue(undefined) });
    await f.controller.start(); await f.controller.finish();
    expect(f.controller.jobs).toHaveLength(1);
    const id = f.controller.jobs[0].id;
    expect(f.deps.removeAudio).not.toHaveBeenCalled(); expect(f.deps.paste).not.toHaveBeenCalled();
    await f.controller.retry();
    expect(f.deps.transcribe).toHaveBeenCalledTimes(1);
    expect(f.deps.save).toHaveBeenLastCalledWith(expect.objectContaining({ id }));
    expect(f.controller.jobs).toEqual([]);
  });
  it("never uploads when saving the recovery fails", async () => {
    const f = fixture({ persist: vi.fn().mockRejectedValue(new Error("Disk full")) });
    await f.controller.start(); await f.controller.finish();
    expect(f.controller.jobs).toHaveLength(1);
    expect(f.deps.transcribe).not.toHaveBeenCalled(); expect(f.deps.removeAudio).not.toHaveBeenCalled();
  });
  it("cancels a pending capture without creating a note or uploading", async () => {
    let ready!: () => void;
    const f = fixture({ start: () => new Promise<void>(r => { ready = r; }) });
    const starting = f.controller.start(); await f.controller.finish(true); ready(); await starting;
    expect(f.deps.removeAudio).toHaveBeenCalledWith("test.wav");
    expect(f.deps.transcribe).not.toHaveBeenCalled(); expect(f.deps.save).not.toHaveBeenCalled();
  });
});
