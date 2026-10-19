import React, { useMemo, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Copy,
  ExternalLink,
  FileAudio,
  FileDown,
  FileText,
  Mic,
  MoreVertical,
  Pause,
  Play,
  Plus,
  RotateCw,
  Search,
  Sparkles,
  Speaker,
  Square,
  Trash2,
  Users,
  Volume2
} from "lucide-react";
import {
  cancelProcessing,
  deleteMeeting,
  exportMeetingMarkdown,
  finishMeeting,
  meetingAudioPath,
  pauseMeeting,
  processMeeting,
  resumeMeeting,
  retryLiveTranscription,
  skipSummary,
  startMeeting,
  summarizeShortMeeting,
  updateMeeting
} from "../../api/parity";
import type {
  MeetingRecord,
  MeetingSegment,
  ParitySettings,
  SummaryPoint
} from "../../api/parityTypes";
import {
  formatDuration,
  formatTimestamp,
  groupTranscriptPassages,
  mapCitations
} from "./transcriptHelpers";

interface MeetingsViewProps {
  meetings: MeetingRecord[];
  activeMeetingId?: string | null;
  selectedId?: string;
  settings: ParitySettings;
  onSelectMeeting: (id: string) => void;
  onUpdateMeetings: (meetings: MeetingRecord[]) => void;
  onUpdateSettings?: (settings: ParitySettings) => void;
}

export const MeetingsView: React.FC<MeetingsViewProps> = ({
  meetings,
  activeMeetingId,
  selectedId,
  settings,
  onSelectMeeting,
  onUpdateMeetings,
  onUpdateSettings
}) => {
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"summary" | "transcript" | "notes" | "recording">("summary");
  const [transcriptSearch, setTranscriptSearch] = useState("");
  const [trackFilter, setTrackFilter] = useState<"all" | "microphone" | "system">("all");
  const [startDropdown, setStartDropdown] = useState(false);
  const [showErrorDetails, setShowErrorDetails] = useState(false);
  const [highlightedSegmentId, setHighlightedSegmentId] = useState<string | null>(null);

  // Group meetings by date
  const groupedMeetings = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = meetings.filter((m) => {
      if (!q) return true;
      return (
        m.title.toLowerCase().includes(q) ||
        (m.userNotes ?? "").toLowerCase().includes(q) ||
        m.segments.some((s) => s.text.toLowerCase().includes(q))
      );
    });

    const groups: Record<string, MeetingRecord[]> = {};
    const now = new Date();
    const todayStr = now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const yesterdayStr = yesterday.toDateString();

    filtered.forEach((m) => {
      // m.createdAt is unix_seconds - 978307200 in Apple format, or normal unix epoch
      // Real timestamp: (m.createdAt > 2000000000 ? m.createdAt : (m.createdAt + 978307200) * 1000)
      const ts = m.createdAt > 10000000000 ? m.createdAt : (m.createdAt + 978307200) * 1000;
      const d = new Date(ts);
      let label: string;
      if (d.toDateString() === todayStr) {
        label = "Today";
      } else if (d.toDateString() === yesterdayStr) {
        label = "Yesterday";
      } else {
        label = d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
      }
      if (!groups[label]) groups[label] = [];
      groups[label].push(m);
    });

    return groups;
  }, [meetings, search]);

  const selectedRecord = useMemo(() => {
    if (selectedId) {
      return meetings.find((m) => m.id === selectedId) ?? meetings[0] ?? null;
    }
    return meetings[0] ?? null;
  }, [meetings, selectedId]);

  const passages = useMemo(() => {
    if (!selectedRecord) return [];
    return groupTranscriptPassages(
      selectedRecord.segments,
      trackFilter === "all" ? undefined : trackFilter
    ).filter((p) => {
      if (!transcriptSearch.trim()) return true;
      return p.text.toLowerCase().includes(transcriptSearch.toLowerCase());
    });
  }, [selectedRecord, trackFilter, transcriptSearch]);

  const handleStartMeeting = async () => {
    setStartDropdown(false);
    try {
      const rec = await startMeeting({
        title: "Meeting " + new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        microphone: settings.meetingMicrophone,
        systemAudio: settings.meetingSystemAudio,
        summarizeOnStop: settings.meetingSummarize,
        liveTranscription: settings.meetingLiveTranscription
      });
      onUpdateMeetings([rec, ...meetings]);
      onSelectMeeting(rec.id);
    } catch (err) {
      console.error(err);
    }
  };

  const handleFinish = async () => {
    if (!selectedRecord) return;
    await finishMeeting({ summarize: selectedRecord.summarizeOnStop });
  };

  const handlePauseResume = async () => {
    if (!selectedRecord) return;
    if (selectedRecord.status === "paused") {
      await resumeMeeting();
    } else {
      await pauseMeeting();
    }
  };

  const handleDelete = async (id: string) => {
    await deleteMeeting(id);
    const next = meetings.filter((m) => m.id !== id);
    onUpdateMeetings(next);
    if (selectedRecord?.id === id) {
      onSelectMeeting(next[0]?.id ?? "");
    }
  };

  const handleExportMarkdown = async () => {
    if (!selectedRecord) return;
    try {
      const md = await exportMeetingMarkdown(selectedRecord.id);
      await navigator.clipboard.writeText(md);
      alert("Meeting exported and copied to clipboard as Markdown!");
    } catch {
      // Fallback export
      let md = `# ${selectedRecord.title}\n\n`;
      if (selectedRecord.summary) {
        md += `## Key Points\n`;
        selectedRecord.summary.overview.forEach((p) => { md += `- ${p.text}\n`; });
        md += `\n## Decisions\n`;
        selectedRecord.summary.decisions.forEach((p) => { md += `- ${p.text}\n`; });
        md += `\n## Action Items\n`;
        selectedRecord.summary.actions.forEach((p) => { md += `- [ ] ${p.text}\n`; });
        md += `\n`;
      }
      if (selectedRecord.userNotes) {
        md += `## Notes\n${selectedRecord.userNotes}\n\n`;
      }
      md += `## Transcript\n`;
      passages.forEach((p) => {
        md += `**${p.track === "microphone" ? selectedRecord.microphoneLabel : selectedRecord.systemLabel} (${formatTimestamp(p.start)}):** ${p.text}\n\n`;
      });
      await navigator.clipboard.writeText(md);
      alert("Meeting copied to clipboard as Markdown!");
    }
  };

  const jumpToCitation = (sourceId: string) => {
    setTab("transcript");
    setHighlightedSegmentId(sourceId);
    window.setTimeout(() => setHighlightedSegmentId(null), 3000);
  };

  const isActive = selectedRecord?.id === activeMeetingId;

  return (
    <div style={{ display: "flex", width: "100%", height: "100%", overflow: "hidden" }}>
      {/* Left Sidebar List */}
      <div
        style={{
          width: 290,
          borderRight: "1px solid rgba(0,0,0,0.08)",
          display: "flex",
          flexDirection: "column",
          background: "#faf8f4"
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "20px 16px 12px"
          }}
        >
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0, letterSpacing: "-0.03em" }}>
            Meetings
          </h2>
          <div style={{ position: "relative" }}>
            <button
              onClick={() => setStartDropdown((p) => !p)}
              style={{
                background: "#2563eb",
                color: "#ffffff",
                border: "none",
                borderRadius: 6,
                padding: "5px 10px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 4,
                fontSize: 12,
                fontWeight: 600
              }}
            >
              <Plus size={13} /> Start <ChevronDown size={12} />
            </button>

            {startDropdown && (
              <div
                style={{
                  position: "absolute",
                  top: 32,
                  right: 0,
                  background: "#ffffff",
                  border: "1px solid rgba(0,0,0,0.12)",
                  borderRadius: 8,
                  padding: 8,
                  width: 220,
                  zIndex: 60,
                  boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 6
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", padding: "2px 4px" }}>
                  RECORDING SOURCES
                </div>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={settings.meetingMicrophone}
                    onChange={(e) =>
                      onUpdateSettings?.({ ...settings, meetingMicrophone: e.target.checked })
                    }
                  />
                  Microphone
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={settings.meetingSystemAudio}
                    onChange={(e) =>
                      onUpdateSettings?.({ ...settings, meetingSystemAudio: e.target.checked })
                    }
                  />
                  System audio
                </label>
                <div style={{ height: 1, background: "rgba(0,0,0,0.06)", margin: "4px 0" }} />
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={settings.meetingLiveTranscription}
                    onChange={(e) =>
                      onUpdateSettings?.({ ...settings, meetingLiveTranscription: e.target.checked })
                    }
                  />
                  Live transcript
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={settings.meetingSummarize}
                    onChange={(e) =>
                      onUpdateSettings?.({ ...settings, meetingSummarize: e.target.checked })
                    }
                  />
                  Transcribe & summarize on stop
                </label>
                <button
                  onClick={handleStartMeeting}
                  style={{
                    background: "#2563eb",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: 6,
                    padding: "6px",
                    fontSize: 12,
                    fontWeight: 600,
                    marginTop: 4,
                    cursor: "pointer"
                  }}
                >
                  Start now
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Search */}
        <div style={{ padding: "0 16px 12px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: "#ffffff",
              border: "1px solid rgba(0,0,0,0.1)",
              borderRadius: 8,
              padding: "6px 10px"
            }}
          >
            <Search size={14} color="#9ca3af" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search meetings"
              style={{
                border: "none",
                outline: "none",
                background: "transparent",
                fontSize: 12.5,
                width: "100%"
              }}
            />
          </div>
        </div>

        {/* Groups */}
        <div style={{ flex: 1, overflowY: "auto", padding: "0 8px 16px" }}>
          {Object.entries(groupedMeetings).map(([groupTitle, list]) => (
            <div key={groupTitle} style={{ marginBottom: 12 }}>
              <div
                style={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  color: "#9ca3af",
                  textTransform: "uppercase",
                  padding: "6px 8px 4px"
                }}
              >
                {groupTitle}
              </div>
              {list.map((m) => {
                const isSelected = selectedRecord?.id === m.id;
                const isRec = m.status === "recording" || m.status === "paused";
                return (
                  <button
                    key={m.id}
                    onClick={() => onSelectMeeting(m.id)}
                    style={{
                      width: "100%",
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                      padding: "10px 12px",
                      borderRadius: 8,
                      background: isSelected ? "#e0e7ff" : "transparent",
                      border: "none",
                      textAlign: "left",
                      cursor: "pointer",
                      marginBottom: 3
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      {isRec && (
                        <span
                          style={{
                            width: 7,
                            height: 7,
                            borderRadius: "50%",
                            background: m.status === "paused" ? "#9ca3af" : "#ef4444"
                          }}
                        />
                      )}
                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: "#181a1f",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          flex: 1
                        }}
                      >
                        {m.title || "Untitled meeting"}
                      </span>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#6b7280" }}>
                      <span>{formatDuration(m.duration)}</span>
                      <span>·</span>
                      <span
                        style={{
                          textTransform: "capitalize",
                          color: m.status === "ready" ? "#16a34a" : m.status === "failed" ? "#dc2626" : "#4b5563"
                        }}
                      >
                        {m.status}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Right Detail Pane */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
        {selectedRecord ? (
          <>
            {/* Detail Toolbar */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "14px 28px",
                borderBottom: "1px solid rgba(0,0,0,0.08)",
                background: "#fbf9f4"
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="text"
                  value={selectedRecord.title}
                  onChange={(e) => {
                    const updated = { ...selectedRecord, title: e.target.value };
                    onUpdateMeetings(meetings.map((m) => (m.id === updated.id ? updated : m)));
                    updateMeeting(updated).catch(console.error);
                  }}
                  style={{
                    fontSize: 20,
                    fontWeight: 700,
                    border: "none",
                    outline: "none",
                    background: "transparent",
                    color: "#181a1f",
                    maxWidth: 360
                  }}
                />
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button
                  onClick={handleExportMarkdown}
                  title="Copy as Markdown"
                  style={{
                    background: "#ffffff",
                    border: "1px solid rgba(0,0,0,0.1)",
                    borderRadius: 6,
                    padding: "5px 10px",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                    fontSize: 12,
                    color: "#374151"
                  }}
                >
                  <Copy size={13} /> Copy Markdown
                </button>
                <button
                  onClick={() => handleDelete(selectedRecord.id)}
                  title="Delete meeting"
                  style={{
                    background: "transparent",
                    border: "1px solid rgba(239, 68, 68, 0.2)",
                    borderRadius: 6,
                    padding: "5px 8px",
                    cursor: "pointer",
                    color: "#ef4444"
                  }}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>

            {/* State Strip / Banners */}
            <div style={{ padding: "12px 28px 0" }}>
              {isActive && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    background: "rgba(239, 68, 68, 0.08)",
                    border: "1px solid rgba(239, 68, 68, 0.2)",
                    borderRadius: 10,
                    padding: "10px 14px",
                    marginBottom: 12
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span
                      style={{
                        width: 9,
                        height: 9,
                        borderRadius: "50%",
                        background: selectedRecord.status === "paused" ? "#9ca3af" : "#ef4444"
                      }}
                    />
                    <div>
                      <strong style={{ fontSize: 13, color: "#181a1f" }}>
                        {selectedRecord.status === "paused" ? "Meeting Paused" : "Meeting Recording Active"}
                      </strong>
                      <span style={{ fontSize: 11.5, color: "#6b7280", display: "block" }}>
                        {formatDuration(selectedRecord.duration)} · {selectedRecord.liveTranscription ? "Live transcription active" : "Transcription on stop"}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={handlePauseResume}
                      style={{
                        background: "#ffffff",
                        border: "1px solid rgba(0,0,0,0.15)",
                        borderRadius: 6,
                        padding: "5px 12px",
                        fontSize: 12,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: 4
                      }}
                    >
                      {selectedRecord.status === "paused" ? <Play size={12} /> : <Pause size={12} />}
                      {selectedRecord.status === "paused" ? "Resume" : "Pause"}
                    </button>
                    <button
                      onClick={handleFinish}
                      style={{
                        background: "#ef4444",
                        color: "#ffffff",
                        border: "none",
                        borderRadius: 6,
                        padding: "5px 14px",
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: 4
                      }}
                    >
                      <Square size={10} fill="#ffffff" /> Stop & save
                    </button>
                  </div>
                </div>
              )}

              {/* Short Meeting Confirmation Prompt */}
              {selectedRecord.summaryNeedsConfirmation && (
                <div
                  style={{
                    background: "#fef3c7",
                    border: "1px solid #fde68a",
                    borderRadius: 10,
                    padding: "12px 16px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 12
                  }}
                >
                  <div>
                    <strong style={{ fontSize: 13, color: "#92400e" }}>
                      Very short meeting
                    </strong>
                    <span style={{ fontSize: 12, color: "#b45309", display: "block" }}>
                      Only a few words were transcribed. Was this meeting started by mistake?
                    </span>
                  </div>

                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={async () => {
                        await summarizeShortMeeting(selectedRecord.id);
                        onUpdateMeetings(
                          meetings.map((m) =>
                            m.id === selectedRecord.id ? { ...m, summaryNeedsConfirmation: false } : m
                          )
                        );
                      }}
                      style={{
                        background: "#d97706",
                        color: "#ffffff",
                        border: "none",
                        borderRadius: 6,
                        padding: "5px 12px",
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: "pointer"
                      }}
                    >
                      Summarize anyway
                    </button>
                    <button
                      onClick={async () => {
                        await skipSummary(selectedRecord.id);
                        onUpdateMeetings(
                          meetings.map((m) =>
                            m.id === selectedRecord.id ? { ...m, summaryNeedsConfirmation: false } : m
                          )
                        );
                      }}
                      style={{
                        background: "#ffffff",
                        border: "1px solid #d97706",
                        color: "#d97706",
                        borderRadius: 6,
                        padding: "5px 12px",
                        fontSize: 12,
                        fontWeight: 500,
                        cursor: "pointer"
                      }}
                    >
                      No summary needed
                    </button>
                    <button
                      onClick={() => handleDelete(selectedRecord.id)}
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "#dc2626",
                        fontSize: 12,
                        cursor: "pointer"
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )}

              {/* Error Banner */}
              {selectedRecord.lastError && (
                <div
                  style={{
                    background: "#fee2e2",
                    border: "1px solid #fecaca",
                    borderRadius: 10,
                    padding: "10px 14px",
                    marginBottom: 12,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between"
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <AlertCircle size={16} color="#dc2626" />
                    <span style={{ fontSize: 12.5, color: "#991b1b" }}>
                      {selectedRecord.lastError}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={() => processMeeting(selectedRecord.id)}
                      style={{
                        background: "#dc2626",
                        color: "#ffffff",
                        border: "none",
                        borderRadius: 6,
                        padding: "4px 10px",
                        fontSize: 11.5,
                        fontWeight: 500,
                        cursor: "pointer"
                      }}
                    >
                      Try again
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Tabs */}
            <div
              style={{
                display: "flex",
                gap: 20,
                padding: "8px 28px",
                borderBottom: "1px solid rgba(0,0,0,0.06)",
                fontSize: 13,
                fontWeight: 500
              }}
            >
              <button
                onClick={() => setTab("summary")}
                style={{
                  background: "transparent",
                  border: "none",
                  borderBottom: tab === "summary" ? "2px solid #2563eb" : "2px solid transparent",
                  color: tab === "summary" ? "#2563eb" : "#6b7280",
                  padding: "6px 2px",
                  cursor: "pointer",
                  fontWeight: tab === "summary" ? 600 : 500
                }}
              >
                Summary
              </button>
              <button
                onClick={() => setTab("transcript")}
                style={{
                  background: "transparent",
                  border: "none",
                  borderBottom: tab === "transcript" ? "2px solid #2563eb" : "2px solid transparent",
                  color: tab === "transcript" ? "#2563eb" : "#6b7280",
                  padding: "6px 2px",
                  cursor: "pointer",
                  fontWeight: tab === "transcript" ? 600 : 500
                }}
              >
                Transcript ({selectedRecord.segments.length})
              </button>
              <button
                onClick={() => setTab("notes")}
                style={{
                  background: "transparent",
                  border: "none",
                  borderBottom: tab === "notes" ? "2px solid #2563eb" : "2px solid transparent",
                  color: tab === "notes" ? "#2563eb" : "#6b7280",
                  padding: "6px 2px",
                  cursor: "pointer",
                  fontWeight: tab === "notes" ? 600 : 500
                }}
              >
                My notes
              </button>
            </div>

            {/* Tab Contents */}
            <div style={{ flex: 1, overflowY: "auto", padding: "20px 28px" }}>
              {tab === "summary" && (
                <div>
                  {selectedRecord.summary ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                      {/* Overview / Key points */}
                      <div>
                        <h3 style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: "#6b7280", textTransform: "uppercase", margin: "0 0 10px" }}>
                          Key Points
                        </h3>
                        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                          {selectedRecord.summary.overview.map((pt, i) => (
                            <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#2563eb", marginTop: 7, flexShrink: 0 }} />
                              <div style={{ flex: 1 }}>
                                <p style={{ margin: "0 0 4px", fontSize: 14, lineHeight: 1.5 }}>
                                  {pt.text}
                                </p>
                                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                                  {mapCitations(pt.sources, selectedRecord, passages).map((cite) => (
                                    <button
                                      key={cite.sourceId}
                                      onClick={() => jumpToCitation(cite.sourceId)}
                                      style={{
                                        background: "rgba(37, 99, 235, 0.08)",
                                        color: "#2563eb",
                                        border: "none",
                                        borderRadius: 4,
                                        padding: "1px 6px",
                                        fontSize: 11,
                                        fontFamily: "monospace",
                                        cursor: "pointer"
                                      }}
                                    >
                                      {cite.timestamp}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Decisions */}
                      <div>
                        <h3 style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: "#6b7280", textTransform: "uppercase", margin: "0 0 10px" }}>
                          Decisions
                        </h3>
                        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                          {selectedRecord.summary.decisions.length === 0 ? (
                            <span style={{ fontSize: 13, color: "#9ca3af", fontStyle: "italic" }}>None identified.</span>
                          ) : (
                            selectedRecord.summary.decisions.map((pt, i) => (
                              <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#16a34a", marginTop: 7, flexShrink: 0 }} />
                                <div style={{ flex: 1 }}>
                                  <p style={{ margin: "0 0 4px", fontSize: 14, lineHeight: 1.5 }}>
                                    {pt.text}
                                  </p>
                                  <div style={{ display: "flex", gap: 4 }}>
                                    {mapCitations(pt.sources, selectedRecord, passages).map((cite) => (
                                      <button
                                        key={cite.sourceId}
                                        onClick={() => jumpToCitation(cite.sourceId)}
                                        style={{
                                          background: "rgba(22, 163, 74, 0.08)",
                                          color: "#16a34a",
                                          border: "none",
                                          borderRadius: 4,
                                          padding: "1px 6px",
                                          fontSize: 11,
                                          fontFamily: "monospace",
                                          cursor: "pointer"
                                        }}
                                      >
                                        {cite.timestamp}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>

                      {/* Action items */}
                      <div>
                        <h3 style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: "#6b7280", textTransform: "uppercase", margin: "0 0 10px" }}>
                          Action Items
                        </h3>
                        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                          {selectedRecord.summary.actions.length === 0 ? (
                            <span style={{ fontSize: 13, color: "#9ca3af", fontStyle: "italic" }}>None identified.</span>
                          ) : (
                            selectedRecord.summary.actions.map((pt, i) => (
                              <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                                <input type="checkbox" style={{ marginTop: 4 }} />
                                <div style={{ flex: 1 }}>
                                  <p style={{ margin: "0 0 4px", fontSize: 14, lineHeight: 1.5 }}>
                                    {pt.text}
                                  </p>
                                  <div style={{ display: "flex", gap: 4 }}>
                                    {mapCitations(pt.sources, selectedRecord, passages).map((cite) => (
                                      <button
                                        key={cite.sourceId}
                                        onClick={() => jumpToCitation(cite.sourceId)}
                                        style={{
                                          background: "rgba(37, 99, 235, 0.08)",
                                          color: "#2563eb",
                                          border: "none",
                                          borderRadius: 4,
                                          padding: "1px 6px",
                                          fontSize: 11,
                                          fontFamily: "monospace",
                                          cursor: "pointer"
                                        }}
                                      >
                                        {cite.timestamp}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div style={{ textAlign: "center", padding: "40px 20px", color: "#6b7280" }}>
                      <Sparkles size={32} color="#2563eb" style={{ marginBottom: 12 }} />
                      <h3 style={{ fontSize: 16, margin: "0 0 6px" }}>No summary yet</h3>
                      <p style={{ fontSize: 13, maxWidth: 360, margin: "0 auto 16px" }}>
                        {selectedRecord.segments.length === 0
                          ? "This meeting has not been transcribed yet."
                          : "Transcribe and summarize to extract key points and action items."}
                      </p>
                      <button
                        onClick={() => processMeeting(selectedRecord.id)}
                        style={{
                          background: "#2563eb",
                          color: "#ffffff",
                          border: "none",
                          borderRadius: 6,
                          padding: "6px 16px",
                          fontSize: 13,
                          fontWeight: 600,
                          cursor: "pointer"
                        }}
                      >
                        Create summary
                      </button>
                    </div>
                  )}
                </div>
              )}

              {tab === "transcript" && (
                <div>
                  {/* Search and Track Filter Bar */}
                  <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
                    <input
                      type="text"
                      value={transcriptSearch}
                      onChange={(e) => setTranscriptSearch(e.target.value)}
                      placeholder="Search this transcript"
                      style={{
                        flex: 1,
                        padding: "6px 12px",
                        borderRadius: 6,
                        border: "1px solid rgba(0,0,0,0.12)",
                        fontSize: 13
                      }}
                    />
                    <select
                      value={trackFilter}
                      onChange={(e) => setTrackFilter(e.target.value as "all" | "microphone" | "system")}
                      style={{
                        padding: "6px 10px",
                        borderRadius: 6,
                        border: "1px solid rgba(0,0,0,0.12)",
                        fontSize: 12.5,
                        background: "#ffffff"
                      }}
                    >
                      <option value="all">All audio</option>
                      <option value="microphone">{selectedRecord.microphoneLabel || "Microphone"}</option>
                      <option value="system">{selectedRecord.systemLabel || "System audio"}</option>
                    </select>
                  </div>

                  {/* Passages List */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    {passages.length === 0 ? (
                      <p style={{ color: "#9ca3af", fontSize: 13.5, fontStyle: "italic" }}>
                        No transcript passages available.
                      </p>
                    ) : (
                      passages.map((p) => {
                        const isMic = p.track === "microphone";
                        const isHighlighted = p.segmentIDs.includes(highlightedSegmentId ?? "");
                        return (
                          <div
                            key={p.id}
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: 4,
                              background: isHighlighted ? "rgba(254, 240, 138, 0.3)" : "transparent",
                              padding: isHighlighted ? "6px 8px" : "0",
                              borderRadius: 6,
                              transition: "background 0.3s ease"
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span
                                style={{
                                  fontSize: 11,
                                  fontWeight: 600,
                                  color: isMic ? "#2563eb" : "#16a34a"
                                }}
                              >
                                {isMic
                                  ? selectedRecord.microphoneLabel ?? "Microphone"
                                  : selectedRecord.systemLabel ?? "System audio"}
                              </span>
                              <span style={{ fontSize: 11, fontFamily: "monospace", color: "#9ca3af" }}>
                                {formatTimestamp(p.start)}
                              </span>
                            </div>
                            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55 }}>
                              {p.text}
                            </p>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              {tab === "notes" && (
                <textarea
                  value={selectedRecord.userNotes ?? ""}
                  onChange={(e) => {
                    const updated = { ...selectedRecord, userNotes: e.target.value };
                    onUpdateMeetings(meetings.map((m) => (m.id === updated.id ? updated : m)));
                    updateMeeting(updated).catch(console.error);
                  }}
                  placeholder="Jot down notes about this meeting…"
                  style={{
                    width: "100%",
                    height: "100%",
                    minHeight: 300,
                    border: "none",
                    outline: "none",
                    background: "transparent",
                    resize: "none",
                    fontSize: 14.5,
                    lineHeight: 1.6,
                    fontFamily: "inherit"
                  }}
                />
              )}
            </div>
          </>
        ) : (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#9ca3af" }}>
            Select a meeting or start a new recording
          </div>
        )}
      </div>
    </div>
  );
};
