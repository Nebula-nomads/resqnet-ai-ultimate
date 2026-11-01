import React from "react";
import { Activity, AlertOctagon, CheckCircle2, Hourglass, Layers } from "lucide-react";
import type { Stats } from "../lib/format";
import { AnimatedNumber, Skeleton } from "./ui";

export const KpiCards: React.FC<{ stats: Stats; loading?: boolean }> = ({ stats, loading }) => {
  const items = [
    { label: "Total incidents", value: stats.total, sub: `${stats.sim} simulation · ${stats.total - stats.sim} real`, icon: Layers, color: "#00D9FF" },
    { label: "Awaiting response", value: stats.awaiting, sub: "status = awaiting", icon: Hourglass, color: "#FFC247" },
    { label: "Critical incidents", value: stats.criticalOpen, sub: "critical priority · not resolved", icon: AlertOctagon, color: "#FF354B" },
    { label: "Active operations", value: stats.inProgress, sub: "status = in progress", icon: Activity, color: "#536DFF" },
    { label: "Resolved", value: stats.resolved, sub: "status = resolved", icon: CheckCircle2, color: "#27D99A" },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      {items.map((k) => (
        <div key={k.label} className="panel group relative overflow-hidden p-4 animate-fadeUp">
          <div className="absolute inset-x-0 top-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${k.color}, transparent)` }} />
          <div className="flex items-start justify-between">
            <p className="label">{k.label}</p>
            <k.icon size={16} style={{ color: k.color }} />
          </div>
          {loading ? (
            <Skeleton className="mt-3 h-9 w-16" />
          ) : (
            <p className="mt-2 font-mono text-3xl font-semibold leading-none" style={{ color: k.color, textShadow: `0 0 18px ${k.color}55` }}>
              <AnimatedNumber value={k.value} />
            </p>
          )}
          <p className="mt-2 truncate text-[11px] text-tx2">{k.sub}</p>
        </div>
      ))}
    </div>
  );
};
