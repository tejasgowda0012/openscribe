import React, { useState } from "react";
import {
  Calendar as CalendarIcon,
  Check,
  ExternalLink,
  Plus,
  RefreshCw,
  Trash2,
  X
} from "lucide-react";
import { calendarRefresh } from "../../api/parity";
import type { CalendarEvent, CalendarSource, ParitySettings } from "../../api/parityTypes";

interface CalendarSettingsProps {
  settings: ParitySettings;
  events?: CalendarEvent[];
  onUpdateSettings: (settings: ParitySettings) => void;
  onRefreshCalendar?: () => void;
}

export const CalendarSettings: React.FC<CalendarSettingsProps> = ({
  settings,
  events = [],
  onUpdateSettings,
  onRefreshCalendar
}) => {
  const [sourceName, setSourceName] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [excludedTitleInput, setExcludedTitleInput] = useState("");

  const handleToggle = (key: keyof ParitySettings, val: boolean) => {
    onUpdateSettings({ ...settings, [key]: val });
  };

  const handleAddSource = () => {
    if (!sourceName.trim() || !sourceUrl.trim()) return;
    const newSource: CalendarSource = {
      id: crypto.randomUUID().toUpperCase(),
      name: sourceName.trim(),
      url: sourceUrl.trim()
    };
    onUpdateSettings({
      ...settings,
      calendarSources: [...settings.calendarSources, newSource]
    });
    setSourceName("");
    setSourceUrl("");
  };

  const handleRemoveSource = (id: string) => {
    onUpdateSettings({
      ...settings,
      calendarSources: settings.calendarSources.filter((s) => s.id !== id)
    });
  };

  const handleAddExcludedTitle = () => {
    const title = excludedTitleInput.trim();
    if (!title || settings.calendarExcludedTitles.includes(title)) return;
    onUpdateSettings({
      ...settings,
      calendarExcludedTitles: [...settings.calendarExcludedTitles, title]
    });
    setExcludedTitleInput("");
  };

  const handleRemoveExcludedTitle = (title: string) => {
    onUpdateSettings({
      ...settings,
      calendarExcludedTitles: settings.calendarExcludedTitles.filter((t) => t !== title)
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 600, margin: "0 0 4px" }}>
            Calendar Recording & Sources
          </h3>
          <p style={{ fontSize: 13, color: "#6b7280", margin: 0 }}>
            Subscribe to iCal/ICS feeds from Google Calendar, Outlook, or Apple Calendar.
          </p>
        </div>
        {onRefreshCalendar && (
          <button
            onClick={onRefreshCalendar}
            style={{
              background: "transparent",
              border: "1px solid rgba(0,0,0,0.12)",
              borderRadius: 6,
              padding: "5px 10px",
              fontSize: 12,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 5
            }}
          >
            <RefreshCw size={12} /> Refresh
          </button>
        )}
      </div>

      {/* Recording Preferences Group */}
      <div
        style={{
          background: "#ffffff",
          border: "1px solid rgba(0,0,0,0.1)",
          borderRadius: 10,
          padding: "16px 20px",
          display: "flex",
          flexDirection: "column",
          gap: 16
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <strong style={{ fontSize: 13.5, display: "block" }}>
              Ask to record calendar meetings
            </strong>
            <span style={{ fontSize: 12, color: "#6b7280" }}>
              Prompts before upcoming scheduled meetings start.
            </span>
          </div>
          <input
            type="checkbox"
            checked={settings.calendarEnabled}
            onChange={(e) => handleToggle("calendarEnabled", e.target.checked)}
          />
        </div>

        <div style={{ height: 1, background: "rgba(0,0,0,0.06)" }} />

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <strong style={{ fontSize: 13.5, display: "block" }}>
              Only events with meeting links
            </strong>
            <span style={{ fontSize: 12, color: "#6b7280" }}>
              Filters out appointments that do not have Google Meet, Zoom, Teams, or Webex links.
            </span>
          </div>
          <input
            type="checkbox"
            checked={settings.calendarMeetingsOnly}
            onChange={(e) => handleToggle("calendarMeetingsOnly", e.target.checked)}
          />
        </div>

        <div style={{ height: 1, background: "rgba(0,0,0,0.06)" }} />

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <strong style={{ fontSize: 13.5, display: "block" }}>
              Auto-start after 60 seconds
            </strong>
            <span style={{ fontSize: 12, color: "#6b7280" }}>
              If unanswered, starts local recording so nothing is lost.
            </span>
          </div>
          <input
            type="checkbox"
            checked={settings.calendarAutoStart}
            onChange={(e) => handleToggle("calendarAutoStart", e.target.checked)}
          />
        </div>

        <div style={{ height: 1, background: "rgba(0,0,0,0.06)" }} />

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <strong style={{ fontSize: 13.5, display: "block" }}>
              Summarize when meeting ends
            </strong>
            <span style={{ fontSize: 12, color: "#6b7280" }}>
              Automatically runs transcription and summary when the scheduled end time is reached.
            </span>
          </div>
          <input
            type="checkbox"
            checked={settings.calendarSummarize}
            onChange={(e) => handleToggle("calendarSummarize", e.target.checked)}
          />
        </div>
      </div>

      {/* Excluded Titles */}
      <div
        style={{
          background: "#ffffff",
          border: "1px solid rgba(0,0,0,0.1)",
          borderRadius: 10,
          padding: "16px 20px"
        }}
      >
        <h4 style={{ fontSize: 13.5, fontWeight: 600, margin: "0 0 6px" }}>
          Always skip matching titles
        </h4>
        <p style={{ fontSize: 12, color: "#6b7280", margin: "0 0 12px" }}>
          Never prompt to record meetings whose title contains these words (e.g. personal, 1:1).
        </p>
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <input
            type="text"
            value={excludedTitleInput}
            onChange={(e) => setExcludedTitleInput(e.target.value)}
            placeholder="e.g. 1:1, Lunch, Doctor"
            style={{ flex: 1, padding: "6px 10px", borderRadius: 6, border: "1px solid rgba(0,0,0,0.12)", fontSize: 13 }}
          />
          <button
            onClick={handleAddExcludedTitle}
            style={{
              background: "#2563eb",
              color: "#ffffff",
              border: "none",
              borderRadius: 6,
              padding: "0 14px",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer"
            }}
          >
            Add
          </button>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {settings.calendarExcludedTitles.map((phrase) => (
            <span
              key={phrase}
              style={{
                background: "#f3f4f6",
                borderRadius: 4,
                padding: "2px 8px",
                fontSize: 12,
                display: "flex",
                alignItems: "center",
                gap: 6
              }}
            >
              {phrase}
              <button
                onClick={() => handleRemoveExcludedTitle(phrase)}
                style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0 }}
              >
                <X size={12} color="#6b7280" />
              </button>
            </span>
          ))}
        </div>
      </div>

      {/* Calendar Sources */}
      <div
        style={{
          background: "#ffffff",
          border: "1px solid rgba(0,0,0,0.1)",
          borderRadius: 10,
          padding: "16px 20px"
        }}
      >
        <h4 style={{ fontSize: 13.5, fontWeight: 600, margin: "0 0 6px" }}>
          Calendar Sources (ICS / iCal Feeds)
        </h4>
        <p style={{ fontSize: 12, color: "#6b7280", margin: "0 0 12px" }}>
          Add your Google Calendar secret iCal URL or Outlook published calendar URL.
        </p>

        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <input
            type="text"
            placeholder="Calendar Name (e.g. Work)"
            value={sourceName}
            onChange={(e) => setSourceName(e.target.value)}
            style={{ width: 140, padding: "6px 10px", borderRadius: 6, border: "1px solid rgba(0,0,0,0.12)", fontSize: 13 }}
          />
          <input
            type="text"
            placeholder="https://calendar.google.com/.../basic.ics"
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            style={{ flex: 1, padding: "6px 10px", borderRadius: 6, border: "1px solid rgba(0,0,0,0.12)", fontSize: 13 }}
          />
          <button
            onClick={handleAddSource}
            style={{
              background: "#2563eb",
              color: "#ffffff",
              border: "none",
              borderRadius: 6,
              padding: "0 14px",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer"
            }}
          >
            Add source
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {settings.calendarSources.map((source) => (
            <div
              key={source.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "8px 12px",
                background: "#f9fafb",
                borderRadius: 6
              }}
            >
              <div>
                <strong style={{ fontSize: 13, display: "block" }}>{source.name}</strong>
                <span style={{ fontSize: 11.5, color: "#6b7280" }}>{source.url}</span>
              </div>
              <button
                onClick={() => handleRemoveSource(source.id)}
                style={{ background: "transparent", border: "none", color: "#ef4444", cursor: "pointer" }}
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
