import React, { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Building2, Check, Flame, FlaskConical, Play, Waves, Activity } from "lucide-react";
import { describeError, Incident, triggerSimulation } from "../api";
import { useApp } from "../state/AppState";
import { hasCoords, incidentTitle, sortByPriority } from "../lib/format";
import { IncidentRow } from "../components/IncidentRow";
import { EmptyState, SectionTitle, SimBadge, Spinner } from "../components/ui";

const SCENARIOS: Array<{ id: string; label: string; icon: React.ElementType; color: string; blurb: string }> = [
  { id: "flood", label: "Flood", icon: Waves, color: "#00D9FF", blurb: "Rising-water emergency scenario." },
  { id: "earthquake", label: "Earthquake", icon: Activity, color: "#FF8A32", blurb: "Structural collapse and rescue scenario." },
  { id: "fire", label: "Fire", icon: Flame, color: "#FF354B", blurb: "Industrial fire scenario." },
  { id: "infrastructure", label: "Infrastructure failure", icon: Building2, color: "#FFC247", blurb: "Critical utility outage scenario." },
];

export const Simulation: React.FC = () => {
  const qc = useQueryClient();
  const { incidents, setScope, scope } = useApp();
  const [last, setLast] = useState<{ scenario: string; items: Incident[] } | null>(null);
  const [running, setRunning] = useState<string | null>(null);

  const m = useMutation(triggerSimulation, {
    onMutate: (s) => setRunning(s),
    onSuccess: (items, s) => {
      setLast({ scenario: s, items });
      qc.setQueryData<Incident[]>(["incidents"], (old) => {
        if (!old) return old;
        const ids = new Set(old.map((x) => x.id));
        return [...old, ...items.filter((x) => !ids.has(x.id))];
      });
      qc.invalidateQueries(["incidents"]);
    },
    onSettled: () => setRunning(null),
  });

  const sims = useMemo(() => incidents.filter((i) => i.is_simulation).sort(sortByPriority), [incidents]);

  return (
    <div className="space-y-4 p-3 md:p-5">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-accent2/70 bg-accent2/10 p-3">
        <FlaskConical className="text-[#9fb0ff]" size={22} />
        <div className="min-w-0 flex-1">
          <p className="heading text-sm uppercase tracking-wider text-[#c3ceff]">Simulation mode</p>
          <p className="text-xs text-tx2">
            Scenarios call <span className="font-mono">POST /api/v1/simulation/trigger</span> and write real database rows flagged
            <span className="font-mono"> is_simulation=true</span>. They stay in the database until removed at the backend (no delete endpoint exists) and are always badged as simulation in this UI.
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-lg border p-0.5" role="group" aria-label="Data scope">
          {(["all", "real", "sim"] as const).map((s) => (
            <button key={s} aria-pressed={scope === s} onClick={() => setScope(s)}
              className={`rounded px-2 py-1 font-mono text-[10px] uppercase ${scope === s ? "bg-accent2/40 text-white" : "text-tx2 hover:text-tx"}`}>{s}</button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {SCENARIOS.map((s) => {
          const busy = running === s.id;
          return (
            <section key={s.id} className="panel relative overflow-hidden p-4">
              <div className="absolute inset-x-0 top-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${s.color}, transparent)` }} />
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl border" style={{ borderColor: `${s.color}66`, background: `${s.color}14`, color: s.color }}><s.icon size={22} /></span>
                <div><p className="heading text-base">{s.label}</p><p className="font-mono text-[10px] text-tx2">scenario: {s.id}</p></div>
              </div>
              <p className="mt-3 min-h-[32px] text-xs text-tx2">{s.blurb}</p>
              <button className="btn btn-primary mt-3 w-full !py-2" disabled={m.isLoading} onClick={() => m.mutate(s.id)}>
                {busy ? <Spinner /> : <Play size={14} />} {busy ? "Triggering…" : "Trigger scenario"}
              </button>
            </section>
          );
        })}
      </div>

      {m.isError && (
        <p role="alert" className="flex items-center gap-2 rounded-lg border border-crit/40 bg-crit/10 p-3 text-xs text-crit"><AlertTriangle size={14} />Simulation failed: {describeError(m.error)}</p>
      )}

      {last && (
        <section className="panel overflow-hidden">
          <div className="flex items-center gap-2 border-b p-4 text-sm"><Check size={16} className="text-low" />
            <span className="heading">“{last.scenario}” returned {last.items.length} incident{last.items.length === 1 ? "" : "s"}</span>
          </div>
          <ul>
            {last.items.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-3 border-b px-4 py-3 last:border-0">
                <span className="font-mono text-xs text-accent">#{i.id}</span>
                <SimBadge />
                <span className="min-w-0 flex-1 truncate text-sm">{incidentTitle(i)}</span>
                <span className="font-mono text-[11px] text-tx2">{hasCoords(i) ? `${i.latitude.toFixed(3)}, ${i.longitude.toFixed(3)}` : "no coordinates"}</span>
                <span className="rounded border px-2 py-0.5 font-mono text-xs">score {i.priority_score ?? "—"} · {i.priority_label ?? "—"}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="panel overflow-hidden">
        <div className="p-4 pb-2"><SectionTitle icon={<FlaskConical size={15} />} title={`All simulation incidents (${sims.length})`} /></div>
        {sims.length ? <ul>{sims.map((i) => <IncidentRow key={i.id} incident={i} />)}</ul>
          : <EmptyState title="No simulation incidents yet" hint="Trigger a scenario above to generate simulation records." />}
      </section>
    </div>
  );
};
