import React, { useMemo, useState } from "react";
import { ArrowDown, ArrowRight, ArrowUp, Filter, RotateCcw, Search } from "lucide-react";
import type { Incident } from "../api";
import { useApp } from "../state/AppState";
import { useUpdateIncident } from "../lib/hooks";
import {
  PRIORITY_RANK, cap, computeStats, incidentTitle, parseUtc, priorityKey, statusLabel, timeAgo,
} from "../lib/format";
import { KpiCards } from "../components/KpiCards";
import {
  CategoryChip, DupBadge, EmptyState, PriorityBadge, SimBadge, Skeleton, Spinner, StatusBadge, cx,
} from "../components/ui";

type SortKey = "priority" | "date";

export const Management: React.FC<{ mode: "active" | "resolved" }> = ({ mode }) => {
  const { visible, q, openIncident } = useApp();
  const upd = useUpdateIncident();
  const [text, setText] = useState("");
  const [category, setCategory] = useState("all");
  const [priority, setPriority] = useState("all");
  const [status, setStatus] = useState("all");
  const [simOnly, setSimOnly] = useState(false);
  const [dupOnly, setDupOnly] = useState(false);
  const [sort, setSort] = useState<SortKey>("priority");
  const [dir, setDir] = useState<"desc" | "asc">("desc");

  const base = useMemo(
    () => visible.filter((i) => (mode === "resolved" ? i.status === "resolved" : i.status !== "resolved")),
    [visible, mode]
  );
  const categories = useMemo(() => [...new Set(base.map((i) => i.category || "unclassified"))].sort(), [base]);

  const rows = useMemo(() => {
    const s = text.trim().toLowerCase().replace(/^#/, "");
    const out = base.filter((i) => {
      if (s && !(String(i.id) === s || [i.description, i.raw_report, i.location_name].some((f) => f?.toLowerCase().includes(s)))) return false;
      if (category !== "all" && (i.category || "unclassified") !== category) return false;
      if (priority !== "all" && priorityKey(i.priority_label) !== priority) return false;
      if (status !== "all" && i.status !== status) return false;
      if (simOnly && !i.is_simulation) return false;
      if (dupOnly && !i.is_duplicate) return false;
      return true;
    });
    const m = dir === "desc" ? 1 : -1;
    out.sort((a, b) =>
      sort === "priority"
        ? m * ((b.priority_score ?? -1) - (a.priority_score ?? -1)) || PRIORITY_RANK[priorityKey(b.priority_label)] - PRIORITY_RANK[priorityKey(a.priority_label)]
        : m * ((parseUtc(b.created_at)?.getTime() ?? 0) - (parseUtc(a.created_at)?.getTime() ?? 0))
    );
    return out;
  }, [base, text, category, priority, status, simOnly, dupOnly, sort, dir]);

  const stats = useMemo(() => computeStats(visible), [visible]);
  const nextOf = (i: Incident) => (i.status === "awaiting" ? "in_progress" : i.status === "in_progress" ? "resolved" : null);
  const reset = () => { setText(""); setCategory("all"); setPriority("all"); setStatus("all"); setSimOnly(false); setDupOnly(false); };
  const filtered = text || category !== "all" || priority !== "all" || status !== "all" || simOnly || dupOnly;
  const sel = "input !w-auto !py-1.5 text-xs";

  return (
    <div className="space-y-4 p-3 md:p-5">
      <div>
        <h1 className="heading text-xl md:text-2xl">{mode === "resolved" ? "Resolved Incidents" : "Live Operations"}</h1>
        <p className="text-xs text-tx2">
          {mode === "resolved" ? "Closed incidents from the backend record." : "Open incidents (awaiting or in progress), updated every 5 s."} Filters run client-side on fetched records.
        </p>
      </div>
      {mode === "active" && <KpiCards stats={stats} loading={q.isLoading} />}

      <section className="panel p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-tx2" />
            <input className="input !py-1.5 pl-9 text-xs" placeholder="Search by incident ID or description…" aria-label="Search incidents" value={text} onChange={(e) => setText(e.target.value)} />
          </div>
          <select className={sel} aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="all">All categories</option>
            {categories.map((c) => <option key={c} value={c}>{cap(c)}</option>)}
          </select>
          <select className={sel} aria-label="Priority" value={priority} onChange={(e) => setPriority(e.target.value)}>
            <option value="all">All priorities</option>
            {["critical", "high", "medium", "low"].map((p) => <option key={p} value={p}>{cap(p)}</option>)}
          </select>
          {mode === "active" && (
            <select className={sel} aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="all">All statuses</option>
              <option value="awaiting">Awaiting</option>
              <option value="in_progress">In progress</option>
            </select>
          )}
          <select className={sel} aria-label="Sort by" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            <option value="priority">Sort: priority score</option>
            <option value="date">Sort: creation date</option>
          </select>
          <button className="btn !px-2.5" onClick={() => setDir((d) => (d === "desc" ? "asc" : "desc"))} aria-label={`Sort direction: ${dir === "desc" ? "descending" : "ascending"}`}>
            {dir === "desc" ? <ArrowDown size={14} /> : <ArrowUp size={14} />}
          </button>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs">
            <input type="checkbox" checked={simOnly} onChange={(e) => setSimOnly(e.target.checked)} className="accent-[#536DFF]" /> Simulation only
          </label>
          <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs">
            <input type="checkbox" checked={dupOnly} onChange={(e) => setDupOnly(e.target.checked)} className="accent-[#FFC247]" /> Duplicates only
          </label>
          {filtered && <button className="btn !py-1" onClick={reset}><RotateCcw size={12} /> Reset</button>}
          <span className="ml-auto flex items-center gap-1 font-mono text-[11px] text-tx2"><Filter size={12} />{rows.length} / {base.length}</span>
        </div>
      </section>

      {upd.isError && <p role="alert" className="text-xs text-crit">Status update failed — check backend connection.</p>}

      <section className="panel overflow-hidden">
        {q.isLoading ? (
          <div className="space-y-2 p-4">{[...Array(5)].map((_, n) => <Skeleton key={n} className="h-12" />)}</div>
        ) : rows.length === 0 ? (
          <EmptyState
            title={base.length === 0 ? (mode === "resolved" ? "No resolved incidents yet" : "No open incidents") : "No incidents match these filters"}
            hint={base.length === 0 ? "Records appear here as soon as the backend returns them." : "Adjust or reset the filters."}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead>
                <tr className="border-b text-left">
                  {["ID", "Priority", "Incident", "People", "Status", "Created", ""].map((h) => (
                    <th key={h} scope="col" className="label px-4 py-2.5 font-normal">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((i) => {
                  const n = nextOf(i);
                  const busy = upd.isLoading && upd.variables?.id === i.id;
                  return (
                    <tr key={i.id} className="border-b last:border-0 hover:bg-white/[0.03]">
                      <td className="px-4 py-3"><button className="font-mono text-xs text-accent hover:underline" onClick={() => openIncident(i.id)}>#{i.id}</button></td>
                      <td className="px-4 py-3"><PriorityBadge label={i.priority_label} score={i.priority_score} /></td>
                      <td className="max-w-[360px] px-4 py-3">
                        <button className="block w-full text-left" onClick={() => openIncident(i.id)}>
                          <span className="block truncate font-medium">{incidentTitle(i)}</span>
                          <span className="block truncate text-xs text-tx2">{i.description ?? i.raw_report}</span>
                        </button>
                        <span className="mt-1 flex flex-wrap items-center gap-1.5">
                          <CategoryChip category={i.category} />
                          {i.is_simulation && <SimBadge />}
                          {i.is_duplicate && <DupBadge of={i.duplicate_of} />}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{i.people_affected ?? <span className="text-tx2">—</span>}</td>
                      <td className="px-4 py-3"><StatusBadge status={i.status} /></td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-tx2">{timeAgo(i.created_at)}</td>
                      <td className="px-4 py-3 text-right">
                        {n ? (
                          <button className="btn btn-primary !py-1" disabled={busy} onClick={() => upd.mutate({ id: i.id, patch: { status: n } })}>
                            {busy ? <Spinner /> : <ArrowRight size={13} />} {statusLabel(n)}
                          </button>
                        ) : (
                          <button className="btn !py-1" disabled={busy} onClick={() => upd.mutate({ id: i.id, patch: { status: "in_progress" } })}>
                            {busy ? <Spinner /> : <RotateCcw size={13} />} Reopen
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
