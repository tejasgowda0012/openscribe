import { describe, expect, it, vi } from "vitest";
import { DictationController, type DictationDependencies } from "./dictation";
import type { ParitySettings } from "./api/parityTypes";

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
