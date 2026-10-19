import React, { useEffect, useRef, useState } from "react";
import { getCurrentWindow, Window } from "@tauri-apps/api/window";
import {
  Camera,
  Check,
  ChevronRight,
  FileText,
  Mic,
  MoreVertical,
  Pause,
  Play,
  Square,
  Users
} from "lucide-react";
import {
  deleteMeeting,
  finishMeeting,
  loadProfile,
  parityEvents,
  pauseMeeting,
  resumeMeeting,
  saveSettings,
  skipSummary,
  startMeeting,
  summarizeShortMeeting,
  takeScreenshot
} from "../api/parity";
import type {
  FlowbarPlacement,
  MeetingRecord,
  NoteCapture,
  ParitySettings
} from "../api/parityTypes";
import {
  FlowbarLayout,
  detectDock,
  restoreAnchor,
  snapPoint,
  type FlowbarDock,
  type Point,
  type ScreenRect
} from "./placement";
import { FlowbarSquiggle } from "./FlowbarSquiggle";
import { NoticeBubble } from "./NoticeBubble";

export type FlowbarMode =
  | "idle"
  | "idleExpanded"
  | "dictating"
  | "processing"
  | "confirmation"
  | "meeting"
  | "meetingSaving";

export const FlowbarApp: React.FC = () => {
  const [settings, setSettings] = useState<ParitySettings | null>(null);
  const [hovering, setHovering] = useState(false);
  const [dock, setDock] = useState<FlowbarDock>("none");
  const [level, setLevel] = useState(0.1);
  const [mode, setMode] = useState<FlowbarMode>("idle");
  const [activeMeeting, setActiveMeeting] = useState<MeetingRecord | null>(null);
  const [confirmationMessage, setConfirmationMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isErrorNotice, setIsErrorNotice] = useState(false);
  const [shortMeeting, setShortMeeting] = useState<MeetingRecord | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [screenshotMenuOpen, setScreenshotMenuOpen] = useState(false);

  const hoverTimerRef = useRef<number | null>(null);
  const confirmationTimerRef = useRef<number | null>(null);

  // Dragging state
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef<{ mouseX: number; mouseY: number; startX: number; startY: number } | null>(null);

  useEffect(() => {
    loadProfile().then((res) => {
      setSettings(res.settings);
      if (res.storageError) {
        setNotice("Storage issue detected: " + res.storageError);
        setIsErrorNotice(true);
      }
    }).catch(console.error);

    const unlistens: Array<() => void> = [];

    parityEvents.onMeetingChanged((record) => {
      if (record.status === "recording" || record.status === "paused") {
        setActiveMeeting(record);
      } else {
        if (record.status === "transcribing" || record.status === "summarizing") {
          setMode("meetingSaving");
        }
        if (record.summaryNeedsConfirmation) {
          setShortMeeting(record);
        }
        setActiveMeeting(null);
      }
    }).then((u) => unlistens.push(u));

    parityEvents.onMeetingLevel(({ level }) => {
      setLevel(level);
    }).then((u) => unlistens.push(u));

    parityEvents.onDictationLevel(({ level }) => {
      setLevel(level);
    }).then((u) => unlistens.push(u));

    parityEvents.onShortcutAction(({ action, state }) => {
      if (state === "pressed") {
        if (action === "dictate") {
          toggleDictation();
        } else if (action === "meeting") {
          toggleMeeting();
        } else if (action === "screenshotArea") {
          triggerScreenshot("area");
        } else if (action === "screenshotWindow") {
          triggerScreenshot("window");
        } else if (action === "screenshotScreen") {
          triggerScreenshot("screen");
        }
      }
    }).then((u) => unlistens.push(u));

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleEscape();
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      unlistens.forEach((u) => u());
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  // Update current mode
  useEffect(() => {
    if (activeMeeting) {
      setMode("meeting");
      return;
    }
    if (confirmationMessage) {
      setMode("confirmation");
      return;
    }
    if (mode === "dictating" || mode === "processing" || mode === "meetingSaving") {
      return;
    }
    if (hovering) {
      setMode("idleExpanded");
    } else {
      setMode("idle");
    }
  }, [activeMeeting, confirmationMessage, hovering, mode]);

  const handleMouseEnter = () => {
    if (hoverTimerRef.current) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setHovering(true);
  };

  const handleMouseLeave = () => {
    if (hoverTimerRef.current) {
      window.clearTimeout(hoverTimerRef.current);
    }
    // 350ms grace period matching Swift model
    hoverTimerRef.current = window.setTimeout(() => {
      setHovering(false);
      setScreenshotMenuOpen(false);
      setMenuOpen(false);
    }, 350);
  };

  const showConfirmation = (msg: string) => {
    setConfirmationMessage(msg);
    if (confirmationTimerRef.current) {
      window.clearTimeout(confirmationTimerRef.current);
    }
    confirmationTimerRef.current = window.setTimeout(() => {
      setConfirmationMessage(null);
    }, 2000);
  };

  const handleEscape = () => {
    if (menuOpen) {
      setMenuOpen(false);
      return;
    }
    if (screenshotMenuOpen) {
      setScreenshotMenuOpen(false);
      return;
    }
    if (mode === "dictating") {
      setMode("idle");
      showConfirmation("Cancelled");
    }
  };

  const toggleDictation = () => {
    if (mode === "dictating") {
      setMode("processing");
      window.setTimeout(() => {
        setMode("idle");
        showConfirmation("Saved");
      }, 1000);
    } else if (mode === "idle" || mode === "idleExpanded") {
      setMode("dictating");
    }
  };

  const toggleMeeting = async () => {
    if (activeMeeting) {
      await finishMeeting();
      setActiveMeeting(null);
      setMode("idle");
      showConfirmation("Meeting saved");
    } else {
      try {
        const m = await startMeeting({
          title: "Quick Meeting",
          microphone: settings?.meetingMicrophone ?? true,
          systemAudio: settings?.meetingSystemAudio ?? true,
          summarizeOnStop: settings?.meetingSummarize ?? true,
          liveTranscription: settings?.meetingLiveTranscription ?? true
        });
        setActiveMeeting(m);
      } catch (err) {
        setNotice(String(err));
        setIsErrorNotice(true);
      }
    }
  };

  const togglePauseMeeting = async () => {
    if (!activeMeeting) return;
    if (activeMeeting.status === "paused") {
      await resumeMeeting();
    } else {
      await pauseMeeting();
    }
  };

  const triggerScreenshot = async (kind: "area" | "window" | "screen") => {
    setScreenshotMenuOpen(false);
    try {
      const cap = await takeScreenshot(kind);
      if (cap) {
        showConfirmation("Screenshot captured");
      }
    } catch (err) {
      setNotice("Screenshot failed: " + String(err));
      setIsErrorNotice(true);
    }
  };

  const openMeetingNotesWindow = async () => {
    try {
      const win = await Window.getByLabel("meeting-notes");
      if (win) {
        await win.show();
        await win.setFocus();
      }
    } catch (e) {
      console.warn("Could not open meeting-notes window:", e);
    }
  };

  const openMainWindow = async (section?: string) => {
    try {
      const win = await Window.getByLabel("main");
      if (win) {
        await win.show();
        await win.setFocus();
      }
    } catch (e) {
      console.warn("Could not open main window:", e);
    }
  };

  // Dragging handlers
  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // Only left mouse
    isDraggingRef.current = true;
    dragStartRef.current = {
      mouseX: e.screenX,
      mouseY: e.screenY,
      startX: window.screenX,
      startY: window.screenY
    };

    const onMouseMove = (moveEvt: MouseEvent) => {
      if (!isDraggingRef.current || !dragStartRef.current) return;
      const dx = moveEvt.screenX - dragStartRef.current.mouseX;
      const dy = moveEvt.screenY - dragStartRef.current.mouseY;

      // Stand upright if reaching left/right borders
      const visible: ScreenRect = {
        x: 0,
        y: 0,
        width: window.screen.availWidth || 1920,
        height: window.screen.availHeight || 1080
      };
      const d = detectDock({ x: moveEvt.screenX, y: moveEvt.screenY }, visible);
      if (d !== dock) {
        setDock(d);
      }

      const win = getCurrentWindow();
      win.setPosition(new (window as any).LogicalPosition(
        dragStartRef.current.startX + dx,
        dragStartRef.current.startY + dy
      )).catch(() => undefined);
    };

    const onMouseUp = (upEvt: MouseEvent) => {
      isDraggingRef.current = false;
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);

      const visible: ScreenRect = {
        x: 0,
        y: 0,
        width: window.screen.availWidth || 1920,
        height: window.screen.availHeight || 1080
      };
      const targetDock = detectDock({ x: upEvt.screenX, y: upEvt.screenY }, visible);
      const snapped = snapPoint(
        { x: upEvt.screenX, y: upEvt.screenY },
        visible,
        targetDock
      );
      setDock(targetDock);

      if (settings) {
        const placement: FlowbarPlacement = {
          screen: "primary",
          x: (snapped.x - visible.x) / visible.width,
          y: (snapped.y - visible.y) / visible.height,
          edge: targetDock === "none" ? null : targetDock
        };
        const updated = { ...settings, flowbarPlacement: placement };
        setSettings(updated);
        saveSettings(updated).catch(console.error);
      }
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const isVertical = dock !== "none";

  // Width & height per mode matching OverlayPanel.swift
  const pillDimensions = (() => {
    switch (mode) {
      case "idle":
        return { width: 34, height: 6 };
      case "idleExpanded":
        return { width: 150, height: FlowbarLayout.pillHeight };
      case "dictating":
      case "processing":
      case "meetingSaving":
        return { width: 88, height: FlowbarLayout.pillHeight };
      case "confirmation":
        return { width: 52, height: FlowbarLayout.pillHeight };
      case "meeting":
        return { width: hovering ? 140 : 84, height: FlowbarLayout.pillHeight };
    }
  })();

  return (
    <div
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onContextMenu={(e) => {
        e.preventDefault();
        setMenuOpen((prev) => !prev);
      }}
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        background: "transparent",
        padding: FlowbarLayout.inset
      }}
    >
      {/* Floating Notice / Short Meeting Bubble */}
      <div
        style={{
          position: "absolute",
          top: -46,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 100
        }}
      >
        <NoticeBubble
          notice={notice}
          isError={isErrorNotice}
          shortMeeting={shortMeeting}
          onDismissNotice={() => setNotice(null)}
          onInspectNotice={() => openMainWindow("settings")}
          onResolveShortMeeting={async (action) => {
            if (!shortMeeting) return;
            if (action === "summarize") {
              await summarizeShortMeeting(shortMeeting.id);
            } else if (action === "keep") {
              await skipSummary(shortMeeting.id);
            } else if (action === "delete") {
              await deleteMeeting(shortMeeting.id);
            }
            setShortMeeting(null);
          }}
        />
      </div>

      {/* Pill Container */}
      <div
        onMouseDown={onMouseDown}
        style={{
          width: isVertical ? pillDimensions.height : pillDimensions.width,
          height: isVertical ? pillDimensions.width : pillDimensions.height,
          background:
            mode === "idle"
              ? "rgba(255, 250, 230, 0.45)"
              : "#14171f",
          border:
            mode === "idle"
              ? "0.5px solid rgba(0, 0, 0, 0.35)"
              : "1px solid rgba(255, 255, 255, 0.13)",
          borderRadius: 999,
          boxShadow:
            mode === "idle"
              ? "none"
              : "0 4px 12px rgba(0, 0, 0, 0.3)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transform: isVertical ? "rotate(90deg)" : "none",
          transition: "width 0.25s ease, height 0.25s ease, background 0.2s ease",
          cursor: "grab",
          overflow: "visible",
          position: "relative"
        }}
      >
        {/* Upright Inner Content */}
        <div
          style={{
            transform: isVertical ? "rotate(-90deg)" : "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            width: "100%",
            height: "100%",
            padding: mode === "idle" ? "0 4px" : "0 8px",
            color: "#fffaf0"
          }}
        >
          {mode === "idle" && (
            <div
              onClick={toggleDictation}
              style={{ width: "100%", height: "100%" }}
            />
          )}

          {mode === "idleExpanded" && (
            <>
              <button
                onClick={toggleDictation}
                title="Start dictation"
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#fffaf0",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  padding: 2
                }}
              >
                <FlowbarSquiggle width={30} height={14} motion="still" />
              </button>

              <button
                onClick={toggleDictation}
                title="Dictate"
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#fffaf0",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  padding: 2
                }}
              >
                <Mic size={14} />
              </button>

              <button
                onClick={toggleMeeting}
                title="Start meeting"
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#fffaf0",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  padding: 2
                }}
              >
                <Users size={14} />
              </button>

              <div style={{ position: "relative" }}>
                <button
                  onClick={() => setScreenshotMenuOpen((prev) => !prev)}
                  title="Screenshot"
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "#fffaf0",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    padding: 2
                  }}
                >
                  <Camera size={14} />
                </button>

                {screenshotMenuOpen && (
                  <div
                    style={{
                      position: "absolute",
                      bottom: 30,
                      right: 0,
                      background: "#14171f",
                      border: "1px solid rgba(255, 255, 255, 0.15)",
                      borderRadius: 8,
                      padding: 4,
                      display: "flex",
                      flexDirection: "column",
                      gap: 2,
                      width: 140,
                      zIndex: 200,
                      boxShadow: "0 4px 12px rgba(0,0,0,0.4)"
                    }}
                  >
                    <button
                      onClick={() => triggerScreenshot("area")}
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "#fffaf0",
                        fontSize: 11,
                        padding: "4px 8px",
                        textAlign: "left",
                        cursor: "pointer",
                        borderRadius: 4
                      }}
                    >
                      Area screenshot
                    </button>
                    <button
                      onClick={() => triggerScreenshot("window")}
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "#fffaf0",
                        fontSize: 11,
                        padding: "4px 8px",
                        textAlign: "left",
                        cursor: "pointer",
                        borderRadius: 4
                      }}
                    >
                      Window screenshot
                    </button>
                    <button
                      onClick={() => triggerScreenshot("screen")}
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "#fffaf0",
                        fontSize: 11,
                        padding: "4px 8px",
                        textAlign: "left",
                        cursor: "pointer",
                        borderRadius: 4
                      }}
                    >
                      Screen screenshot
                    </button>
                  </div>
                )}
              </div>
            </>
          )}

          {mode === "dictating" && (
            <div
              onClick={toggleDictation}
              title="Click to finish, Esc to cancel"
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer"
              }}
            >
              <FlowbarSquiggle
                width={70}
                height={18}
                level={level}
                motion="live"
                color="#fffaf0"
              />
            </div>
          )}

          {(mode === "processing" || mode === "meetingSaving") && (
            <div
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center"
              }}
            >
              <FlowbarSquiggle
                width={70}
                height={16}
                motion="flowing"
                color="#f0b864"
              />
            </div>
          )}

          {mode === "confirmation" && (
            <div
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 4
              }}
            >
              <Check size={14} color="#f0b864" />
            </div>
          )}

          {mode === "meeting" && (
            <div
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 4
              }}
            >
              <button
                onClick={openMeetingNotesWindow}
                title="Open meeting notes"
                style={{
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center"
                }}
              >
                <FlowbarSquiggle
                  width={34}
                  height={16}
                  level={level}
                  motion={activeMeeting?.status === "paused" ? "still" : "live"}
                  color={
                    activeMeeting?.status === "paused"
                      ? "rgba(255, 250, 240, 0.4)"
                      : "#fffaf0"
                  }
                />
              </button>

              {hovering && (
                <>
                  <button
                    onClick={openMeetingNotesWindow}
                    title="Meeting notes"
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "#fffaf0",
                      cursor: "pointer",
                      padding: 2
                    }}
                  >
                    <FileText size={13} />
                  </button>

                  <button
                    onClick={() => triggerScreenshot("area")}
                    title="Screenshot to meeting"
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "#fffaf0",
                      cursor: "pointer",
                      padding: 2
                    }}
                  >
                    <Camera size={13} />
                  </button>

                  <button
                    onClick={togglePauseMeeting}
                    title={activeMeeting?.status === "paused" ? "Resume" : "Pause"}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "#fffaf0",
                      cursor: "pointer",
                      padding: 2
                    }}
                  >
                    {activeMeeting?.status === "paused" ? (
                      <Play size={13} />
                    ) : (
                      <Pause size={13} />
                    )}
                  </button>
                </>
              )}

              <button
                onClick={toggleMeeting}
                title="Stop meeting"
                style={{
                  background: "rgba(255, 99, 102, 0.2)",
                  border: "none",
                  color: "#ff6366",
                  borderRadius: "50%",
                  width: 18,
                  height: 18,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer"
                }}
              >
                <Square size={9} fill="#ff6366" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Context Menu */}
      {menuOpen && (
        <div
          style={{
            position: "absolute",
            bottom: 45,
            left: "50%",
            transform: "translateX(-50%)",
            background: "#14171f",
            border: "1px solid rgba(255, 255, 255, 0.15)",
            borderRadius: 8,
            padding: 6,
            display: "flex",
            flexDirection: "column",
            gap: 2,
            width: 170,
            zIndex: 300,
            boxShadow: "0 8px 24px rgba(0, 0, 0, 0.5)"
          }}
        >
          <button
            onClick={() => {
              setMenuOpen(false);
              openMainWindow("notes");
            }}
            style={{
              background: "transparent",
              border: "none",
              color: "#fffaf0",
              fontSize: 12,
              padding: "5px 8px",
              textAlign: "left",
              cursor: "pointer",
              borderRadius: 4
            }}
          >
            Today’s note
          </button>
          <button
            onClick={() => {
              setMenuOpen(false);
              openMainWindow();
            }}
            style={{
              background: "transparent",
              border: "none",
              color: "#fffaf0",
              fontSize: 12,
              padding: "5px 8px",
              textAlign: "left",
              cursor: "pointer",
              borderRadius: 4
            }}
          >
            Open OpenScribe
          </button>
          <div style={{ height: 1, background: "rgba(255, 255, 255, 0.1)", margin: "3px 0" }} />
          <button
            onClick={() => {
              setMenuOpen(false);
              openMainWindow("shortcuts");
            }}
            style={{
              background: "transparent",
              border: "none",
              color: "#fffaf0",
              fontSize: 12,
              padding: "5px 8px",
              textAlign: "left",
              cursor: "pointer",
              borderRadius: 4
            }}
          >
            Shortcuts…
          </button>
          <button
            onClick={() => {
              setMenuOpen(false);
              openMainWindow("settings");
            }}
            style={{
              background: "transparent",
              border: "none",
              color: "#fffaf0",
              fontSize: 12,
              padding: "5px 8px",
              textAlign: "left",
              cursor: "pointer",
              borderRadius: 4
            }}
          >
            Settings…
          </button>
        </div>
      )}
    </div>
  );
};
