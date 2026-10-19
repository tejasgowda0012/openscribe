import React, { useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { meetingAudioPath } from "../../api/parity";
import type { MeetingRecord } from "../../api/parityTypes";
import { formatTimestamp } from "./transcriptHelpers";

export function MeetingRecordings({ record }: { record: MeetingRecord }) {
  const [sources, setSources] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const open = async (id: string) => {
    try { const path = await meetingAudioPath(record.id, id); setSources(current => ({ ...current, [`${record.id}/${id}`]: convertFileSrc(path) })); }
    catch (error) { setError(String(error)); }
  };
  return <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
    {error && <p role="alert">{error}</p>}
    {!record.segments.length && <p>Audio chunks appear here after transcription. Recording files stay on this device.</p>}
    {record.segments.filter(segment => segment.duration > 0 && segment.id.endsWith(".wav")).map(segment => <div key={segment.id}>
      <span>{segment.track === "microphone" ? record.microphoneLabel : record.systemLabel} · {formatTimestamp(segment.start)} </span>
      {sources[`${record.id}/${segment.id}`] ? <audio controls src={sources[`${record.id}/${segment.id}`]} onError={() => setError("This audio chunk could not be played.")} /> : <button onClick={() => { void open(segment.id); }}>Load audio</button>}
    </div>)}
  </div>;
}
