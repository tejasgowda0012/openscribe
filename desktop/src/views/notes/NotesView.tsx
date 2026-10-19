import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Calendar as CalendarIcon,
  ChevronRight,
  FileText,
  Pin,
  Plus,
  Search,
  Trash2
} from "lucide-react";
import { deleteNote, saveNote } from "../../api/parity";
import type { VoiceNote } from "../../api/parityTypes";
import { DayNoteView } from "./DayNoteView";
import { localDay } from "../../core/dailyNotes";
import { reportUiError } from "../../workspaceEvents";

interface NotesViewProps {
  notes: VoiceNote[];
  selectedId?: string;
  onSelectNote: (id: string) => void;
  onUpdateNotes: (notes: VoiceNote[]) => void;
  onRefreshNotes: () => Promise<void>;
  onOpenMeeting?: (meetingId: string) => void;
  onStartDictation?: () => void;
  onStartMeeting?: () => void;
}

export const NotesView: React.FC<NotesViewProps> = ({
  notes,
  selectedId,
  onSelectNote,
  onUpdateNotes,
  onRefreshNotes,
  onOpenMeeting,
  onStartDictation,
  onStartMeeting
}) => {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "daily" | "written">("all");
  const [drafts, setDrafts] = useState<Record<string, VoiceNote>>({});
  const [saveStatus, setSaveStatus] = useState("");
  const pending = useRef(new Map<string, VoiceNote>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const writes = useRef<Promise<unknown>>(Promise.resolve());
  const refresh = useRef(onRefreshNotes); refresh.current = onRefreshNotes;
  const allNotes = [...notes.map(note => drafts[note.id] ?? note), ...Object.values(drafts).filter(note => !notes.some(existing => existing.id === note.id))];
  const flush = () => {
    const edits = [...pending.current.values()]; pending.current.clear();
    for (const note of edits) {
      writes.current = writes.current.catch(() => undefined).then(async () => {
        await saveNote(note);
        await refresh.current();
        setSaveStatus("Saved");
        setDrafts(current => {
          if (current[note.id] !== note) return current;
          const next = { ...current }; delete next[note.id]; return next;
        });
      }).catch(error => { setSaveStatus("Could not save. Your draft is still here; edit to retry."); reportUiError(error); });
    }
  };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); flush(); }, []);

  const todayStr = localDay(new Date());

  // Find or craft today's note
  const todayNote = useMemo(() => {
    return (
      notes.find((n) => localDay(n.createdAt) === todayStr && n.captures != null) ?? {
        id: "today-placeholder",
        createdAt: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
        title: "Today",
        rawText: "",
        cleanedText: "",
        duration: 0,
        isPinned: false,
        tags: [],
        source: "Dictation",
        captures: []
      }
    );
  }, [notes, todayStr]);

  // Filter notes
  const filteredNotes = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allNotes.filter((n) => {
      if (filter === "daily" && !n.captures) return false;
      if (filter === "written" && n.captures) return false;
      if (!q) return true;

      const titleMatch = n.title.toLowerCase().includes(q);
      const textMatch = (n.cleanedText || n.rawText).toLowerCase().includes(q);
      const captureMatch = n.captures?.some(
        (c) =>
          c.text.toLowerCase().includes(q) ||
          c.rawText.toLowerCase().includes(q) ||
          (c.recognizedText ?? "").toLowerCase().includes(q)
      );
      return titleMatch || textMatch || captureMatch;
    });
  }, [notes, drafts, search, filter]);

  const selectedNote = useMemo(() => {
    if (!selectedId || selectedId === "today-placeholder" || selectedId === todayNote.id) {
      return todayNote;
    }
    return allNotes.find((n) => n.id === selectedId) ?? todayNote;
  }, [notes, drafts, selectedId, todayNote]);

  const handleUpdateNote = async (updated: VoiceNote) => {
    await saveNote(updated);
    await onRefreshNotes();
  };
  const handleEdit = (updated: VoiceNote) => {
    setDrafts(current => ({ ...current, [updated.id]: updated }));
    if (!notes.some(note => note.id === updated.id) && !updated.cleanedText.trim() && !updated.rawText.trim() && (!updated.title.trim() || updated.title === "Untitled note")) {
      pending.current.delete(updated.id); setSaveStatus("Draft · type to save"); return;
    }
    setSaveStatus("Unsaved changes");
    pending.current.set(updated.id, updated);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 400);
  };

  const handleDelete = async (id: string) => {
    if (id === "today-placeholder") return;
    try {
      pending.current.delete(id);
      await writes.current;
      await deleteNote(id);
      pending.current.delete(id);
      setDrafts(current => { const next = { ...current }; delete next[id]; return next; });
      await onRefreshNotes();
      onSelectNote("today-placeholder");
    } catch (error) {
      reportUiError(error);
    }
  };

  const handleCreateWrittenNote = () => {
    const newNote: VoiceNote = {
      id: crypto.randomUUID().toUpperCase(),
      createdAt: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
      title: "Untitled note",
      rawText: "",
      cleanedText: "",
      duration: 0,
      isPinned: false,
      tags: [],
      source: "Note"
    };
    setDrafts(current => ({ ...current, [newNote.id]: newNote }));
    onSelectNote(newNote.id);
    setSaveStatus("Draft · type to save");
  };

  const isSelectedToday =
    selectedNote.id === "today-placeholder" ||
    (selectedNote.captures != null && localDay(selectedNote.createdAt) === todayStr);

  return (
    <div style={{ display: "flex", width: "100%", height: "100%", overflow: "hidden" }}>
      {/* Sidebar Library */}
      <div
        style={{
          width: 280,
          borderRight: "1px solid rgba(0,0,0,0.08)",
          display: "flex",
          flexDirection: "column",
          background: "#faf8f4"
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "20px 16px 12px"
          }}
        >
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0, letterSpacing: "-0.03em" }}>
            Notes
          </h2>
          <button
            onClick={handleCreateWrittenNote}
            title="New note"
            style={{
              background: "#ffffff",
              border: "1px solid rgba(0,0,0,0.12)",
              borderRadius: 6,
              padding: "4px 8px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 4,
              fontSize: 12,
              fontWeight: 500
            }}
          >
            <Plus size={13} /> New note
          </button>
        </div>

        {/* Search */}
        <div style={{ padding: "0 16px 10px" }}>
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
              placeholder="Search notes and screenshots"
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

        {/* Filter Tabs */}
        <div
          style={{
            display: "flex",
            gap: 6,
            padding: "0 16px 12px",
            borderBottom: "1px solid rgba(0,0,0,0.06)"
          }}
        >
          {(["all", "daily", "written"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setFilter(t)}
              style={{
                background: filter === t ? "#2563eb" : "transparent",
                color: filter === t ? "#ffffff" : "#6b7280",
                border: "none",
                borderRadius: 999,
                padding: "3px 10px",
                fontSize: 11.5,
                fontWeight: 500,
                cursor: "pointer",
                textTransform: "capitalize"
              }}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Notes List */}
        <div style={{ flex: 1, overflowY: "auto", padding: "8px" }}>
          {/* Always show Today at top when appropriate */}
          {filter !== "written" && !search && (
            <button
              onClick={() => onSelectNote(todayNote.id)}
              style={{
                width: "100%",
                display: "flex",
                flexDirection: "column",
                gap: 3,
                padding: "10px 12px",
                borderRadius: 8,
                background: isSelectedToday ? "#e0e7ff" : "transparent",
                border: "none",
                textAlign: "left",
                cursor: "pointer",
                marginBottom: 4
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#181a1f" }}>
                  Today
                </span>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    background: "#2563eb",
                    color: "#ffffff",
                    borderRadius: 4,
                    padding: "1px 5px"
                  }}
                >
                  TODAY
                </span>
              </div>
              <span style={{ fontSize: 11.5, color: "#6b7280" }}>
                {todayNote.captures?.length ?? 0} entries
              </span>
            </button>
          )}

          {filteredNotes.map((n) => {
            if (n.id === todayNote.id && filter !== "written" && !search) return null;
            const isSelected = selectedNote.id === n.id;
            const isDaily = n.captures != null;
            const dateStr = new Date(n.createdAt).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric"
            });

            return (
              <button
                key={n.id}
                onClick={() => onSelectNote(n.id)}
                style={{
                  width: "100%",
                  display: "flex",
                  flexDirection: "column",
                  gap: 3,
                  padding: "10px 12px",
                  borderRadius: 8,
                  background: isSelected ? "#e0e7ff" : "transparent",
                  border: "none",
                  textAlign: "left",
                  cursor: "pointer",
                  marginBottom: 4
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: "#181a1f",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap"
                    }}
                  >
                    {n.title || (isDaily ? dateStr : "Untitled Note")}
                  </span>
                  {n.isPinned && <Pin size={11} color="#2563eb" fill="#2563eb" />}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "#6b7280" }}>
                  <span>{dateStr}</span>
                  <span>·</span>
                  <span>{isDaily ? `${n.captures?.length ?? 0} entries` : "Written"}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Note Pane */}
      <div style={{ flex: 1, height: "100%", overflow: "hidden" }}>
        {selectedNote.captures != null ? (
          <DayNoteView
            note={selectedNote}
            isToday={isSelectedToday}
            onUpdate={handleUpdateNote}
            onRefresh={onRefreshNotes}
            onDeleteNote={handleDelete}
            onOpenMeeting={onOpenMeeting}
            onStartDictation={onStartDictation}
            onStartMeeting={onStartMeeting}
          />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", height: "100%", padding: "28px 36px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
              <input
                type="text"
                value={selectedNote.title}
                onChange={(e) =>
                  handleEdit({ ...selectedNote, title: e.target.value })
                }
                placeholder="Note title"
                style={{
                  fontSize: 24,
                  fontWeight: 700,
                  border: "none",
                  outline: "none",
                  background: "transparent",
                  color: "#181a1f"
                }}
              />
              <button
                onClick={() => handleDelete(selectedNote.id)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#ef4444",
                  cursor: "pointer"
                }}
              >
                <Trash2 size={16} />
              </button>
            </div>
            <textarea
              value={selectedNote.cleanedText || selectedNote.rawText}
              onChange={(e) =>
                handleEdit({
                  ...selectedNote,
                  cleanedText: e.target.value,
                  rawText: e.target.value
                })
              }
              placeholder="Write your note here…"
              style={{
                flex: 1,
                border: "none",
                outline: "none",
                background: "transparent",
                resize: "none",
                fontSize: 15,
                lineHeight: 1.6,
                color: "#181a1f",
                fontFamily: "inherit"
              }}
            />
            <small role="status">{saveStatus}</small>
          </div>
        )}
      </div>
    </div>
  );
};
