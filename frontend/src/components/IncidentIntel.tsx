import React, { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight, Check, Clock, CopyCheck, Crosshair, FileText, Info, MapPin, Save, ShieldAlert, Siren, Undo2, UserRound, X,
} from "lucide-react";
import { describeError, fetchResources } from "../api";
import type { Incident } from "../api";
import { useApp } from "../state/AppState";
import { useUpdateIncident } from "../lib/hooks";
import { STATUS_ORDER, cap, fmtDateTime, hasCoords, statusHex, statusLabel, timeAgo } from "../lib/format";
import { PriorityGauge } from "./PriorityGauge";
import { ResourceIcon } from "./ResourceIcon";
import { ConfidenceBar, DupBadge, EmptyState, SimBadge, Spinner, StatusBadge, cx } from "./ui";

const Block: React.FC<{ icon: React.ReactNode; title: string; children: React.ReactNode; className?: string }> = ({ icon, title, children, className }) => (
  <section className={cx("rounded-xl border bg-white/[0.02] p-4", className)}>
    <h4 className="label mb-2 flex items-center gap-1.5 !text-tx2"><span className="text-accent">{icon}</span>{title}</h4>
    {children}
  </section>
);

const Chips: React.FC<{ items: string[] | null | undefined; tone?: string; empty: string }> = ({ items, tone = "#00D9FF", empty }) =>
  items && items.length ? (
    <ul className="flex flex-wrap gap-1.5">
      {items.map((t, i) => (
        <li key={`${t}-${i}`} className="rounded-md border px-2 py-1 text-xs" style={{ borderColor: `${tone}55`, background: `${tone}12`, color: "#EAF3FF" }}>
          {cap(t)}
        </li>
      ))}
    </ul>
  ) : (
    <p className="text-xs text-tx2">{empty}</p>
  );

const Field: React.FC<{ k: string; children: React.ReactNode; mono?: boolean }> = ({ k, children, mono }) => (
  <div>
    <dt className="label">{k}</dt>
    <dd className={cx("mt-0.5 text-sm", mono && "font-mono")}>{children}</dd>
  </div>
);

export const IncidentIntel: React.FC<{ incident: Incident }> = ({ incident: i }) => {
  const { openIncident, incidents } = useApp();
  const upd = useUpdateIncident();
  const [notes, setNotes] = useState(i.notes ?? "");
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);

  // Follow server value unless the operator is mid-edit; reset when switching incident.
  useEffect(() => { setDirty(false); setSaved(false); setNotes(i.notes ?? ""); }, [i.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!dirty) setNotes(i.notes ?? ""); }, [i.notes, dirty]);

  const rec = useQuery(["resources", (i.category ?? "").toLowerCase()], () => fetchResources(i.category as string), {
    enabled: !!i.category, staleTime: 60_000,
  });

  const idx = STATUS_ORDER.indexOf(i.status as (typeof STATUS_ORDER)[number]);
  const next = idx >= 0 && idx < STATUS_ORDER.length - 1 ? STATUS_ORDER[idx + 1] : null;
  const prev = idx > 0 ? STATUS_ORDER[idx - 1] : null;
  const dupTarget = i.duplicate_of != null ? incidents.find((x) => x.id === i.duplicate_of) : undefined;

  const setStatus = (status: string) => upd.mutate({ id: i.id, patch: { status } });
  const saveNotes = () =>
    upd.mutate({ id: i.id, patch: { notes } }, { onSuccess: () => { setDirty(false); setSaved(true); } });

  return (
    <div className="space-y-4">
      {/* headline */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs text-tx2">INCIDENT</span>
        <span className="font-mono text-sm font-semibold text-accent">#{i.id}</span>
        <StatusBadge status={i.status} />
        {i.is_simulation && <SimBadge />}
        {i.is_duplicate && <DupBadge of={i.duplicate_of} />}
      </div>

      {/* score + AI summary */}
      <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
        <div className="flex flex-col items-center gap-2 rounded-xl border bg-white/[0.02] p-4">
          <PriorityGauge score={i.priority_score} label={i.priority_label} />
          <p className="label">Priority score</p>
        </div>
        <Block icon={<Info size={13} />} title="Priority explanation" className="flex flex-col justify-center">
          <p className="font-mono text-xs leading-relaxed text-tx">{i.priority_explanation ?? "No explanation recorded."}</p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Field k="Recommended urgency">{i.recommended_urgency ? cap(i.recommended_urgency) : <span className="text-tx2">Not provided</span>}</Field>
            <div>
              <p className="label">AI confidence</p>
              <div className="mt-1.5"><ConfidenceBar value={i.confidence} /></div>
            </div>
          </div>
        </Block>
      </div>

      {/* status management */}
      <Block icon={<Siren size={13} />} title="Status management">
        <ol className="flex items-center gap-1.5" aria-label="Incident lifecycle">
          {STATUS_ORDER.map((s, n) => {
            const done = idx >= n;
            const c = statusHex(s);
            return (
              <React.Fragment key={s}>
                <li className="flex flex-1 flex-col items-center gap-1">
                  <span className="h-1.5 w-full rounded-full" style={{ background: done ? c : "rgba(125,160,190,.18)" }} />
                  <span className={cx("text-[11px]", s === i.status ? "font-semibold text-tx" : "text-tx2")}>{statusLabel(s)}</span>
                </li>
              </React.Fragment>
            );
          })}
        </ol>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {next && (
            <button className="btn btn-primary" disabled={upd.isLoading} onClick={() => setStatus(next)}>
              {upd.isLoading ? <Spinner /> : <ArrowRight size={14} />} Move to {statusLabel(next)}
            </button>
          )}
          {prev && (
            <button className="btn" disabled={upd.isLoading} onClick={() => setStatus(prev)}>
              <Undo2 size={14} /> Revert to {statusLabel(prev)}
            </button>
          )}
          {!next && <span className="flex items-center gap-1 text-xs text-low"><Check size={14} /> Incident resolved</span>}
        </div>
        {upd.isError && <p role="alert" className="mt-2 text-xs text-crit">Update failed: {describeError(upd.error)}</p>}
      </Block>

      {/* narrative */}
      <Block icon={<FileText size={13} />} title="Raw report">
        <p className="whitespace-pre-wrap rounded-lg border bg-base/60 p-3 font-mono text-xs leading-relaxed">{i.raw_report}</p>
      </Block>
      <Block icon={<Crosshair size={13} />} title="AI-generated description">
        <p className="text-sm leading-relaxed">{i.description ?? <span className="text-tx2">No description generated.</span>}</p>
        <dl className="mt-3 grid grid-cols-2 gap-3">
          <Field k="Category">{cap(i.category)}</Field>
          <Field k="People affected" mono>{i.people_affected ?? <span className="font-sans text-tx2">Not reported</span>}</Field>
        </dl>
      </Block>

      {/* location */}
      <Block icon={<MapPin size={13} />} title="Location">
        <dl className="grid grid-cols-2 gap-3">
          <Field k="Location name">{i.location_name ?? <span className="text-tx2">Not provided</span>}</Field>
          <Field k="Coordinates" mono>
            {hasCoords(i) ? `${i.latitude.toFixed(5)}, ${i.longitude.toFixed(5)}` : <span className="font-sans text-med">No valid coordinates — not plotted on map</span>}
          </Field>
        </dl>
      </Block>

      {/* people + threats + resources */}
      <div className="grid gap-4 md:grid-cols-2">
        <Block icon={<UserRound size={13} />} title="Vulnerable people">
          <Chips items={i.vulnerable_people} tone="#FF8A32" empty="None identified." />
        </Block>
        <Block icon={<ShieldAlert size={13} />} title="Immediate threats">
          <Chips items={i.immediate_threats} tone="#FF354B" empty="None identified." />
        </Block>
      </div>
      <Block icon={<Siren size={13} />} title="Required resources (from analysis)">
        {i.required_resources && i.required_resources.length ? (
          <ul className="grid grid-cols-2 gap-2">
            {i.required_resources.map((r, n) => (
              <li key={`${r}-${n}`} className="flex items-center gap-2 rounded-lg border bg-white/[0.02] px-3 py-2 text-xs">
                <ResourceIcon name={r} className="text-accent" /> {r}
              </li>
            ))}
          </ul>
        ) : <p className="text-xs text-tx2">No resources listed by the analysis.</p>}
        <div className="mt-3 border-t pt-3">
          <p className="label mb-1.5">Category recommendation · GET /resources/{i.category ?? "—"}</p>
          {!i.category ? <p className="text-xs text-tx2">No category — no recommendation available.</p>
            : rec.isLoading ? <Spinner />
            : rec.isError ? <p className="text-xs text-crit">{describeError(rec.error)}</p>
            : rec.data && rec.data.resources.length ? (
              <div className="flex flex-wrap gap-1.5">
                {rec.data.resources.map((r) => <span key={r} className="rounded-md border border-accent/30 bg-accent/10 px-2 py-1 text-xs">{r}</span>)}
              </div>
            ) : <p className="text-xs text-tx2">Backend has no recommendation for “{i.category}”.</p>}
          <p className="mt-2 text-[10px] text-tx2">Recommendations only — availability and deployment are not tracked by the backend.</p>
        </div>
      </Block>

      {/* duplicates */}
      <Block icon={<CopyCheck size={13} />} title="Duplicate detection">
        {i.is_duplicate ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <DupBadge of={i.duplicate_of} />
            {i.duplicate_of != null && (
              <button className="btn !py-1" onClick={() => openIncident(i.duplicate_of!)}>
                View original #{i.duplicate_of}{dupTarget ? ` · ${cap(dupTarget.category)}` : ""}
              </button>
            )}
          </div>
        ) : <p className="text-xs text-tx2">Not flagged as a duplicate of any existing incident.</p>}
      </Block>

      {/* notes */}
      <Block icon={<FileText size={13} />} title="Operational notes">
        <textarea
          className="input min-h-[96px] font-mono text-xs" value={notes} placeholder="Add operational notes…"
          aria-label="Operational notes"
          onChange={(e) => { setNotes(e.target.value); setDirty(true); setSaved(false); }}
        />
        <div className="mt-2 flex items-center gap-2">
          <button className="btn btn-primary" disabled={!dirty || upd.isLoading} onClick={saveNotes}>
            {upd.isLoading ? <Spinner /> : <Save size={14} />} Save notes
          </button>
          {saved && !dirty && <span className="flex items-center gap-1 text-xs text-low"><Check size={13} /> Saved</span>}
          {dirty && <span className="text-xs text-med">Unsaved changes</span>}
        </div>
        <p className="mt-2 text-[10px] text-tx2">The backend has no authentication yet, so any operator with network access can edit notes and status.</p>
      </Block>

      {/* timestamps */}
      <Block icon={<Clock size={13} />} title="Timeline">
        <dl className="grid grid-cols-2 gap-3">
          <Field k="Created">{fmtDateTime(i.created_at)}<span className="ml-1 text-tx2">({timeAgo(i.created_at)})</span></Field>
          <Field k="Last updated">{fmtDateTime(i.updated_at)}<span className="ml-1 text-tx2">({timeAgo(i.updated_at)})</span></Field>
          <Field k="Record type">{i.is_simulation ? "Simulation" : "Real report"}</Field>
        </dl>
      </Block>
    </div>
  );
};

/** Slide-over drawer, controlled by global selectedId. */
export const IncidentDrawer: React.FC = () => {
  const { selectedId, openIncident, incidents, q } = useApp();
  const incident = selectedId != null ? incidents.find((x) => x.id === selectedId) : undefined;
  const closeRef = React.useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (selectedId == null) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") openIncident(null); };
    window.addEventListener("keydown", onKey);
    closeRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, openIncident]);

  return (
    <AnimatePresence>
      {selectedId != null && (
        <>
          <motion.div
            key="backdrop" className="fixed inset-0 z-[1500] bg-black/60 backdrop-blur-[2px]"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => openIncident(null)}
          />
          <motion.aside
            key="drawer" role="dialog" aria-modal="true" aria-label={`Incident ${selectedId} intelligence`}
            className="fixed right-0 top-0 z-[1600] flex h-full w-full max-w-[640px] flex-col border-l border-accent/20 bg-panel shadow-2xl"
            initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "tween", duration: 0.25 }}
          >
            <header className="flex items-center justify-between border-b px-5 py-3">
              <h2 className="heading text-base uppercase tracking-wider">Incident intelligence</h2>
              <button ref={closeRef} className="btn !px-2" onClick={() => openIncident(null)} aria-label="Close drawer"><X size={16} /></button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              {incident ? <IncidentIntel incident={incident} />
                : q.isLoading ? <div className="flex justify-center p-10"><Spinner size={22} /></div>
                : <EmptyState title={`Incident #${selectedId} not found`} hint="It may not exist in the backend." />}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
};
