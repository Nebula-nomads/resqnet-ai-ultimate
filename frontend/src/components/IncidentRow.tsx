import React from "react";
import type { Incident } from "../api";
import { incidentTitle, timeAgo } from "../lib/format";
import { useApp } from "../state/AppState";
import { CategoryChip, DupBadge, PriorityBadge, SimBadge, StatusBadge } from "./ui";

export const IncidentRow: React.FC<{ incident: Incident }> = ({ incident: i }) => {
  const { openIncident } = useApp();
  return (
    <li className="border-b last:border-b-0">
      <button onClick={() => openIncident(i.id)} className="flex w-full flex-col gap-1.5 px-4 py-3 text-left transition-colors hover:bg-white/[0.04]">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="font-mono text-xs text-accent">#{i.id}</span>
          <PriorityBadge label={i.priority_label} score={i.priority_score} />
          {i.is_simulation && <SimBadge />}
          {i.is_duplicate && <DupBadge of={i.duplicate_of} />}
          <span className="ml-auto text-[11px] text-tx2">{timeAgo(i.created_at)}</span>
        </span>
        <span className="truncate text-sm font-medium">{incidentTitle(i)}</span>
        <span className="line-clamp-2 text-xs text-tx2">{i.description ?? i.raw_report}</span>
        <span className="flex items-center gap-2"><CategoryChip category={i.category} /><StatusBadge status={i.status} /></span>
      </button>
    </li>
  );
};
