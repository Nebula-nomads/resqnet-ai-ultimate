/**
 * RESQNET AI — Latency Badge
 * Displays the actual report delay with color-coded indicators.
 * Thresholds per specification:
 *   0–30s: Very recent  → green
 *   31–60s: Recent      → cyan
 *   1–5m: Slight delay  → yellow
 *   5–15m: Delayed      → orange
 *   15–60m: Significantly delayed → red
 *   >60m: Stale         → red (darker)
 */

import React from "react";
import type { LatencyInfo } from "../api";

export type LatencyBadgeSize = "sm" | "md";

function latencyColor(seconds: number | null | undefined): string {
  if (seconds == null) return "#8294AA";
  if (seconds <= 30) return "#27D99A";    // green
  if (seconds <= 60) return "#00D9FF";    // cyan
  if (seconds <= 300) return "#FFC247";   // yellow
  if (seconds <= 900) return "#FF8A32";   // orange
  return "#FF354B";                        // red
}

function latencyLabel(seconds: number | null | undefined): string {
  if (seconds == null) return "SOURCE PUBLICATION TIME UNAVAILABLE";
  if (seconds <= 30) return "Very recent";
  if (seconds <= 60) return "Recent";
  if (seconds <= 300) return "Slight delay";
  if (seconds <= 900) return "Delayed";
  if (seconds <= 3600) return "Significantly delayed";
  return "Stale";
}

function formatDelay(seconds: number | null | undefined): string {
  if (seconds == null) return "—";
  if (seconds < 60) return `${Math.round(seconds)} sec`;
  if (seconds < 3600) {
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return s > 0 ? `${m}m ${s}s` : `${m} min`;
  }
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

interface LatencyBadgeProps {
  latency: LatencyInfo | null | undefined;
  size?: LatencyBadgeSize;
  showLabel?: boolean;
  /** When true, use event_detection_delay (received_at - event_time). Otherwise use source_publication_delay. */
  useDetectionDelay?: boolean;
}

export const LatencyBadge: React.FC<LatencyBadgeProps> = ({
  latency,
  size = "sm",
  showLabel = false,
  useDetectionDelay = true,
}) => {
  if (!latency) {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded font-mono ${size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-1 text-xs"}`}
        style={{ background: "#8294AA20", color: "#8294AA", border: "1px solid #8294AA40" }}
        title="Latency data unavailable"
      >
        —
      </span>
    );
  }

  const delay = useDetectionDelay
    ? latency.event_detection_delay_s
    : latency.source_publication_delay_s;

  const noSourceTime =
    !useDetectionDelay && latency.source_published_at_utc == null;

  const color = noSourceTime ? "#8294AA" : latencyColor(delay);
  const label = noSourceTime
    ? "SOURCE PUBLICATION TIME UNAVAILABLE"
    : latencyLabel(delay);
  const formatted = noSourceTime ? "—" : formatDelay(delay);

  return (
    <span className="inline-flex flex-col">
      <span
        className={`inline-flex items-center gap-1.5 rounded font-mono ${size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-1 text-xs"}`}
        style={{
          background: `${color}18`,
          color,
          border: `1px solid ${color}40`,
        }}
        title={label}
      >
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{ background: color, boxShadow: `0 0 4px ${color}` }}
        />
        {formatted}
      </span>
      {showLabel && (
        <span className="mt-0.5 font-mono text-[9px] uppercase tracking-wider" style={{ color: `${color}bb` }}>
          {noSourceTime ? "PUB TIME UNAVAILABLE" : label}
        </span>
      )}
    </span>
  );
};

/** Inline latency row for detail panels */
export const LatencyRow: React.FC<{
  label: string;
  seconds: number | null | undefined;
  missingReason?: string;
}> = ({ label, seconds, missingReason }) => {
  const color = latencyColor(seconds);
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-tx2">{label}</span>
      {seconds == null ? (
        <span className="font-mono text-[10px] text-tx2">
          {missingReason ?? "—"}
        </span>
      ) : (
        <span
          className="font-mono text-xs font-semibold"
          style={{ color }}
          title={`${latencyLabel(seconds)} — ${formatDelay(seconds)}`}
        >
          {formatDelay(seconds)}
          <span className="ml-1 font-normal text-[10px]" style={{ color: `${color}99` }}>
            · {latencyLabel(seconds)}
          </span>
        </span>
      )}
    </div>
  );
};
