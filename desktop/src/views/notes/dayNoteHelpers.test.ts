import { describe, expect, it } from "vitest";
import { captureDateForDay } from "./dayNoteHelpers";

describe("captureDateForDay", () => {
  it("adds a thought to the selected local day rather than today", () => {
    const day = new Date(2024, 1, 29, 8);
    const now = new Date(2026, 9, 20, 15, 42, 3, 500);
    const result = new Date(captureDateForDay(day.toISOString(), now));
    expect([result.getFullYear(), result.getMonth(), result.getDate()]).toEqual([2024, 1, 29]);
    expect([result.getHours(), result.getMinutes(), result.getSeconds(), result.getMilliseconds()]).toEqual([15, 42, 3, 0]);
    expect(now.getFullYear()).toBe(2026);
  });

  it("keeps today's local day across UTC date boundaries", () => {
    const now = new Date(2026, 9, 20, 0, 5);
    const result = new Date(captureDateForDay(now.toISOString(), now));
    expect(result.toDateString()).toBe(now.toDateString());
  });
});
