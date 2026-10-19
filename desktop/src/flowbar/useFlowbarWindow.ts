import { useEffect, useRef, useState } from "react";
import { LogicalSize, PhysicalPosition } from "@tauri-apps/api/dpi";
import { availableMonitors, currentMonitor, getCurrentWindow, type Monitor } from "@tauri-apps/api/window";
import type { ParitySettings } from "../api/parityTypes";
import { reportUiError, sendIntent } from "../workspaceEvents";
import { detectDock, restoreAnchor, snapPoint, type Point, type ScreenRect, type FlowbarDock } from "./placement";

const visibleArea = (monitor: Monitor): ScreenRect => ({
  x: monitor.workArea.position.x / monitor.scaleFactor, y: monitor.workArea.position.y / monitor.scaleFactor,
  width: monitor.workArea.size.width / monitor.scaleFactor, height: monitor.workArea.size.height / monitor.scaleFactor
});

/** Keep a stable pill anchor while the native window grows to fit its menus/notices. */
export function useFlowbarWindow(settings: ParitySettings | null, width: number, height: number, rotateWithDock = true) {
  const [dock, setDock] = useState<FlowbarDock>("none");
  const actualWidth = rotateWithDock && dock !== "none" ? height : width;
  const actualHeight = rotateWithDock && dock !== "none" ? width : height;
  const [pillCenter, setPillCenter] = useState<Point>({ x: width / 2, y: height / 2 });
  const anchor = useRef<Point | null>(null);
  const monitorRef = useRef<Monitor | null>(null);
  const dimensions = useRef({ width: actualWidth, height: actualHeight }); dimensions.current = { width: actualWidth, height: actualHeight };
  const placementKey = JSON.stringify([settings?.flowbarPlacement, settings?.overlayPosition]);
  const cleanupDrag = useRef<() => void>(() => undefined);
  const generation = useRef(0);

  const position = async (monitor: Monitor, point: Point) => {
    const scale = monitor.scaleFactor, visible = visibleArea(monitor);
    const { width: w, height: h } = dimensions.current;
    const x = Math.max(visible.x, Math.min(point.x - w / 2, visible.x + visible.width - w));
    const y = Math.max(visible.y, Math.min(point.y - h / 2, visible.y + visible.height - h));
    await getCurrentWindow().setSize(new LogicalSize(w, h));
    await getCurrentWindow().setPosition(new PhysicalPosition(Math.round(x * scale), Math.round(y * scale)));
    setPillCenter({ x: point.x - x, y: point.y - y });
  };

  useEffect(() => {
    if (!settings) return;
    const request = ++generation.current;
    void (async () => {
      const monitors = await availableMonitors();
      const monitor = monitors.find(m => m.name === settings.flowbarPlacement?.screen) ?? await currentMonitor() ?? monitors[0];
      if (!monitor || request !== generation.current) return;
      monitorRef.current = monitor;
      const restored = restoreAnchor(settings.flowbarPlacement, settings.overlayPosition, visibleArea(monitor));
      anchor.current = restored.anchor; setDock(restored.dock);
      await position(monitor, restored.anchor);
    })().catch(reportUiError);
    return () => { generation.current++; };
  }, [placementKey, !!settings]);

  useEffect(() => {
    if (anchor.current && monitorRef.current) void position(monitorRef.current, anchor.current).catch(reportUiError);
  }, [actualWidth, actualHeight]);
  useEffect(() => () => cleanupDrag.current(), []);

  const onMouseDown = (event: React.MouseEvent) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest("button, input, a")) return;
    cleanupDrag.current();
    const start = { x: event.screenX, y: event.screenY };
    const cleanup = () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", cleanup); };
    const move = (e: MouseEvent) => {
      if (Math.hypot(e.screenX - start.x, e.screenY - start.y) < 4) return;
      cleanup();
      void (async () => {
        await getCurrentWindow().startDragging();
        const monitor = await currentMonitor();
        if (!monitor) throw new Error("Could not find the Flowbar display.");
        const topLeft = await getCurrentWindow().outerPosition();
        const scale = monitor.scaleFactor;
        const point = { x: topLeft.x / scale + pillCenter.x, y: topLeft.y / scale + pillCenter.y };
        const visible = visibleArea(monitor), nextDock = detectDock(point, visible);
        const snapped = snapPoint(point, visible, nextDock);
        anchor.current = snapped; monitorRef.current = monitor; setDock(nextDock);
        await position(monitor, snapped);
        await sendIntent({ action: "placement", placement: { screen: monitor.name ?? undefined,
          x: (snapped.x - visible.x) / visible.width, y: (snapped.y - visible.y) / visible.height, edge: nextDock === "none" ? null : nextDock } });
      })().catch(reportUiError);
    };
    window.addEventListener("mousemove", move); window.addEventListener("mouseup", cleanup);
    cleanupDrag.current = cleanup;
  };
  return { dock, pillCenter, onMouseDown, width: actualWidth, height: actualHeight };
}
