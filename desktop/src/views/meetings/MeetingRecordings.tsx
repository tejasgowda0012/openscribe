import React, { useEffect, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { meetingAudioPath } from "../../api/parity";
import type { MeetingRecord } from "../../api/parityTypes";
import { formatTimestamp } from "./transcriptHelpers";

export function MeetingRecordings({ record }: { record: MeetingRecord }) {
  const [sources, setSources] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const playable = record.segments.filter(segment => segment.duration > 0 && segment.id.endsWith(".wav"));
  useEffect(() => { setError(""); }, [record.id]);
  const open = async (id: string) => {
    setError("");
    try { const path = await meetingAudioPath(record.id, id); setSources(current => ({ ...current, [`${record.id}/${id}`]: convertFileSrc(path) })); }
    catch (error) { setError(String(error)); }
  };
  return <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
    {error && <p role="alert" style={{ color: "var(--os-ink)", background: "var(--os-recording-soft)", padding: 12 }}>{error}</p>}
    {!playable.length && <p style={{ color: "var(--os-ink-muted)" }}>No playable audio chunks are available yet. Recording files stay on this device.</p>}
    {playable.map(segment => <div key={segment.id}>
      <span>{segment.track === "microphone" ? record.microphoneLabel : record.systemLabel} · {formatTimestamp(segment.start)} </span>
      {sources[`${record.id}/${segment.id}`] ? <audio controls aria-label={`Audio at ${formatTimestamp(segment.start)}`} src={sources[`${record.id}/${segment.id}`]} onError={() => setError("This audio chunk could not be played.")} /> : <button className="quiet" onClick={() => { void open(segment.id); }}>Load audio</button>}
    </div>)}
  </div>;
}
