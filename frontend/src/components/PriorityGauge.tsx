import React from "react";
import { motion } from "framer-motion";
import { PRIORITY_HEX, priorityKey } from "../lib/format";

export const PriorityGauge: React.FC<{
  score: number | null | undefined; label?: string | null; size?: number;
}> = ({ score, label, size = 132 }) => {
  const r = 52;
  const circ = 2 * Math.PI * r;
  const has = typeof score === "number";
  const pct = has ? Math.max(0, Math.min(100, score as number)) : 0;
  const color = PRIORITY_HEX[priorityKey(label)];
  return (
    <div
      className="relative"
      style={{ width: size, height: size }}
      role="img"
      aria-label={has ? `Priority score ${pct} out of 100, ${label ?? "unlabelled"}` : "Priority score unavailable"}
    >
      <svg viewBox="0 0 128 128" className="h-full w-full -rotate-90">
        <circle cx="64" cy="64" r={r} fill="none" stroke="rgba(125,160,190,.14)" strokeWidth="9" />
        {[...Array(40)].map((_, i) => {
          const a = (i / 40) * Math.PI * 2;
          return (
            <line key={i}
              x1={64 + Math.cos(a) * 60} y1={64 + Math.sin(a) * 60}
              x2={64 + Math.cos(a) * 62.5} y2={64 + Math.sin(a) * 62.5}
              stroke="rgba(125,160,190,.3)" strokeWidth="1" />
          );
        })}
        <motion.circle
          cx="64" cy="64" r={r} fill="none" stroke={color} strokeWidth="9" strokeLinecap="round"
          strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: circ * (1 - pct / 100) }}
          transition={{ duration: 0.9, ease: "easeOut" }}
          style={{ filter: `drop-shadow(0 0 6px ${color}99)` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono text-3xl font-semibold leading-none" style={{ color }}>
          {has ? pct : "—"}
        </span>
        <span className="label mt-1">{label ?? "Unscored"}</span>
      </div>
    </div>
  );
};
