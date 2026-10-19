import React from "react";

export type FlowbarMotion = "still" | "live" | "flowing";

interface FlowbarSquiggleProps {
  level?: number; // 0..1
  motion?: FlowbarMotion;
  color?: string;
  width?: number;
  height?: number;
}

export const FlowbarSquiggle: React.FC<FlowbarSquiggleProps> = ({
  level = 0.15,
  motion = "still",
  color = "rgba(255, 250, 230, 0.9)",
  width = 40,
  height = 16
}) => {
  const bars = 5;
  const clampedLevel = Math.max(0.1, Math.min(1.0, level));

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: "block" }}
    >
      {Array.from({ length: bars }).map((_, i) => {
        const x = (width / (bars + 1)) * (i + 1);
        const centerOffset = 1 - Math.abs(i - (bars - 1) / 2) / ((bars - 1) / 2);
        const factor =
          motion === "live"
            ? clampedLevel * (0.4 + 0.6 * centerOffset)
            : motion === "flowing"
            ? 0.3 + 0.5 * Math.sin((i / bars) * Math.PI)
            : 0.25 + 0.3 * centerOffset;

        const barHeight = Math.max(3, height * factor);
        const y = (height - barHeight) / 2;

        return (
          <rect
            key={i}
            x={x - 1.5}
            y={y}
            width={3}
            height={barHeight}
            rx={1.5}
            fill={color}
            style={{
              transition: motion === "live" ? "height 0.05s ease, y 0.05s ease" : "none"
            }}
          />
        );
      })}
    </svg>
  );
};
