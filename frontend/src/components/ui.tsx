import React, { useEffect, useRef, useState } from "react";
import { FlaskConical, CopyCheck, Radar } from "lucide-react";
import {
  PRIORITY_HEX, cap, priorityKey, statusHex, statusLabel,
} from "../lib/format";

export const cx = (...a: Array<string | false | null | undefined>) => a.filter(Boolean).join(" ");

export const PriorityBadge: React.FC<{ label?: string | null; score?: number | null; className?: string }> = ({
  label, score, className,
}) => {
  const c = PRIORITY_HEX[priorityKey(label)];
  return (
    <span
      className={cx("inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[11px] font-semibold uppercase", className)}
      style={{ color: c, borderColor: `${c}66`, background: `${c}1A` }}
    >
      {label ?? "Unscored"}
      {typeof score === "number" && <span className="opacity-80">{score}</span>}
    </span>
  );
};

export const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const c = statusHex(status);
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium"
      style={{ color: c, borderColor: `${c}55`, background: `${c}14` }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: c }} />
      {statusLabel(status)}
    </span>
  );
};

export const SimBadge: React.FC<{ className?: string }> = ({ className }) => (
  <span
    title="Simulation record — not a real-world report"
    className={cx(
      "inline-flex items-center gap-1 rounded border border-dashed border-accent2/70 bg-accent2/15 px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-wider text-[#9fb0ff]",
      className
    )}
  >
    <FlaskConical size={10} /> SIMULATION
  </span>
);

export const DupBadge: React.FC<{ of?: number | null }> = ({ of }) => (
  <span className="inline-flex items-center gap-1 rounded border border-med/40 bg-med/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-med">
    <CopyCheck size={10} /> DUPLICATE{of != null ? ` OF #${of}` : ""}
  </span>
);

export const CategoryChip: React.FC<{ category?: string | null }> = ({ category }) => (
  <span className="rounded border bg-white/[0.03] px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-tx2">
    {cap(category)}
  </span>
);

export const SectionTitle: React.FC<{
  icon?: React.ReactNode; title: string; right?: React.ReactNode; sub?: string;
}> = ({ icon, title, right, sub }) => (
  <div className="mb-3 flex items-start justify-between gap-2">
    <div>
      <div className="flex items-center gap-2">
        {icon && <span className="text-accent">{icon}</span>}
        <h3 className="heading text-sm uppercase tracking-wider">{title}</h3>
      </div>
      {sub && <p className="mt-0.5 text-[11px] text-tx2">{sub}</p>}
    </div>
    {right}
  </div>
);

export const Skeleton: React.FC<{ className?: string }> = ({ className }) => (
  <div className={cx("skeleton", className)} aria-hidden />
);

export const EmptyState: React.FC<{ title: string; hint?: string; action?: React.ReactNode }> = ({ title, hint, action }) => (
  <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
    <svg width="112" height="112" viewBox="0 0 112 112" fill="none" aria-hidden>
      <circle cx="56" cy="56" r="50" stroke="rgba(125,160,190,.25)" />
      <circle cx="56" cy="56" r="34" stroke="rgba(125,160,190,.25)" strokeDasharray="3 5" />
      <circle cx="56" cy="56" r="18" stroke="rgba(0,217,255,.35)" />
      <path d="M56 6v100M6 56h100" stroke="rgba(125,160,190,.15)" />
      <path d="M56 56 L96 30" stroke="#00D9FF" strokeWidth="1.5" opacity=".7" />
      <circle cx="56" cy="56" r="3" fill="#00D9FF" />
    </svg>
    <p className="heading text-sm">{title}</p>
    {hint && <p className="max-w-xs text-xs text-tx2">{hint}</p>}
    {action}
  </div>
);

export const Spinner: React.FC<{ size?: number }> = ({ size = 14 }) => (
  <span
    className="inline-block animate-spin rounded-full border-2 border-accent/30 border-t-accent"
    style={{ width: size, height: size }}
    role="status"
    aria-label="Loading"
  />
);

export const LiveDot: React.FC<{ color?: string; pulse?: boolean }> = ({ color = "#27D99A", pulse = true }) => (
  <span className="relative inline-flex h-2 w-2">
    {pulse && <span className="absolute inline-flex h-full w-full animate-ping2 rounded-full" style={{ background: color }} />}
    <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: color }} />
  </span>
);

export const AnimatedNumber: React.FC<{ value: number }> = ({ value }) => {
  const [v, setV] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = from.current;
    if (start === value) return;
    const t0 = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const p = Math.min((t - t0) / 600, 1);
      const cur = Math.round(start + (value - start) * (1 - Math.pow(1 - p, 3)));
      from.current = cur;
      setV(cur);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{v.toLocaleString()}</>;
};

export const ConfidenceBar: React.FC<{ value: number | null | undefined }> = ({ value }) => {
  if (typeof value !== "number") return <span className="text-xs text-tx2">Not reported</span>;
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
      </div>
      <span className="font-mono text-xs text-tx">{pct}%</span>
    </div>
  );
};

export const BackendDown: React.FC<{ onRetry: () => void; url: string }> = ({ onRetry, url }) => (
  <div role="alert" className="flex flex-wrap items-center gap-3 border-b border-crit/40 bg-crit/10 px-4 py-2 text-xs text-crit">
    <Radar size={14} />
    <span>
      Backend not reachable at <span className="font-mono">{url}</span>. Start it from <span className="font-mono">backend/</span> with{" "}
      <span className="font-mono">uvicorn app.main:app --reload --port 8000</span>.
    </span>
    <button className="btn ml-auto !py-1" onClick={onRetry}>Retry now</button>
  </div>
);
