import { describe, expect, it } from "vitest";
import {
  FlowbarLayout,
  companionOrigin,
  detectDock,
  restoreAnchor,
  snapPoint,
  type ScreenRect
} from "./placement";

describe("Flowbar placement and snap math", () => {
  const visible: ScreenRect = {
    x: 0,
    y: 0,
    width: 1920,
    height: 1080
  };

  it("detects left and right docking within reach", () => {
    expect(detectDock({ x: 30, y: 500 }, visible)).toBe("left");
    expect(detectDock({ x: 69, y: 500 }, visible)).toBe("left");
    expect(detectDock({ x: 1900, y: 500 }, visible)).toBe("right");
    expect(detectDock({ x: 1855, y: 500 }, visible)).toBe("right");
    expect(detectDock({ x: 500, y: 500 }, visible)).toBe("none");
  });

  it("snaps point when docked left or right", () => {
    // Docked left: x = visible.x + dockGap(3) + pillHeight/2(16) = 19
    const left = snapPoint({ x: 10, y: 500 }, visible, "left");
    expect(left.x).toBe(19);
    expect(left.y).toBe(500);

    // Docked right: x = visible.x + 1920 - 19 = 1901
    const right = snapPoint({ x: 1910, y: 500 }, visible, "right");
    expect(right.x).toBe(1901);
    expect(right.y).toBe(500);

    // Clamps within vertical halfLength
    const clampedTop = snapPoint({ x: 10, y: 10 }, visible, "left");
    expect(clampedTop.y).toBe(FlowbarLayout.maxWidth / 2 + FlowbarLayout.edgeMargin); // 75 + 14 = 89
  });

  it("snaps to center line and edges when undocked", () => {
    // Near center (1920 / 2 = 960)
    const center = snapPoint({ x: 970, y: 500 }, visible, "none");
    expect(center.x).toBe(960);

    // Near bottom edge: snaps to 1080 - edgeGap(22) - pillHeight/2(16) = 1042
    const bottom = snapPoint({ x: 960, y: 1055 }, visible, "none");
    expect(bottom.y).toBe(1042);

    // Near top edge: snaps to 0 + edgeGap(22) + pillHeight/2(16) = 38
    const top = snapPoint({ x: 960, y: 25 }, visible, "none");
    expect(top.y).toBe(38);
  });

  it("places companion notice bubble beside or above/below pill", () => {
    const bubbleSize = { width: 200, height: 40 };

    // Docked left: bubble is to the right of anchor
    const besideLeft = companionOrigin({ x: 19, y: 500 }, "left", bubbleSize, 4, visible);
    expect(besideLeft.x).toBe(19 + 16 + 4); // 39
    expect(besideLeft.y).toBe(500 - 20); // 480

    // Docked right: bubble is to the left of anchor
    const besideRight = companionOrigin({ x: 1901, y: 500 }, "right", bubbleSize, 4, visible);
    expect(besideRight.x).toBe(1901 - 16 - 4 - 200); // 1681
    expect(besideRight.y).toBe(500 - 20); // 480

    // Undocked near bottom: bubble is placed above anchor
    const above = companionOrigin({ x: 960, y: 1042 }, "none", bubbleSize, 4, visible);
    expect(above.x).toBe(960 - 100);
    expect(above.y).toBe(1042 - 16 - 4 - 40); // 982
  });

  it("restores anchor from persisted placement or default position", () => {
    const fromPlacement = restoreAnchor(
      { screen: "Main", x: 0.5, y: 0.5, edge: null },
      undefined,
      visible
    );
    expect(fromPlacement.anchor.x).toBe(960);
    expect(fromPlacement.dock).toBe("none");

    const fromDefault = restoreAnchor(null, "bottom-center", visible);
    expect(fromDefault.anchor.x).toBe(960);
    expect(fromDefault.anchor.y).toBe(1042);
  });
});
