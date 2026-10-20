/** Keep the selected local calendar day when writing to an older daily note. */
export function captureDateForDay(day: string, now = new Date()): string {
  const selected = new Date(day);
  const date = new Date(now);
  date.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}
