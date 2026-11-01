import React, { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useApp } from "../state/AppState";
import { computeStats, incidentTitle, sortByPriority } from "../lib/format";
import { IncidentIntel } from "../components/IncidentIntel";
import { PeopleAffected, PriorityDonut, VulnerablePanel } from "../components/Charts";
import { CategoryChip, EmptyState, PriorityBadge, SectionTitle, SimBadge, Skeleton, cx } from "../components/ui";

export const Intel: React.FC = () => {
  const { visible, q } = useApp();
  const [text, setText] = useState("");
  const [id, setId] = useState<number | null>(null);
  const stats = useMemo(() => computeStats(visible), [visible]);

  const list = useMemo(() => {
    const s = text.trim().toLowerCase().replace(/^#/, "");
    return [...visible].sort(sortByPriority).filter((i) =>
      !s || String(i.id) === s || [i.description, i.location_name, i.raw_report, i.category].some((f) => f?.toLowerCase().includes(s))
    );
  }, [visible, text]);

  // default to the highest-priority incident; keep selection if still present
  useEffect(() => {
    if (id == null || !visible.some((i) => i.id === id)) setId(list[0]?.id ?? null);
  }, [list, visible, id]);

  const current = visible.find((i) => i.id === id);

  return (
    <div className="space-y-4 p-3 md:p-5">
      <div>
        <h1 className="heading text-xl md:text-2xl">Intelligence Analysis</h1>
        <p className="text-xs text-tx2">Aggregate picture across all records, plus full analysis of any selected incident.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="panel p-4"><SectionTitle title="Priority mix" />{q.isLoading ? <Skeleton className="h-40" /> : <PriorityDonut stats={stats} />}</section>
        <section className="panel p-4"><SectionTitle title="People affected" />{q.isLoading ? <Skeleton className="h-40" /> : <PeopleAffected stats={stats} />}</section>
        <section className="panel p-4"><SectionTitle title="Vulnerable populations" />{q.isLoading ? <Skeleton className="h-40" /> : <VulnerablePanel stats={stats} />}</section>
      </div>

      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        <section className="panel flex max-h-[780px] flex-col overflow-hidden">
          <div className="border-b p-3">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-tx2" />
              <input className="input !py-1.5 pl-9 text-xs" placeholder="Filter incidents…" aria-label="Filter incidents" value={text} onChange={(e) => setText(e.target.value)} />
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {q.isLoading ? <div className="space-y-2 p-3">{[...Array(5)].map((_, n) => <Skeleton key={n} className="h-16" />)}</div>
              : list.length === 0 ? <EmptyState title="No incidents" hint="Nothing to analyse yet." />
              : <ul>{list.map((i) => (
                <li key={i.id} className="border-b last:border-0">
                  <button onClick={() => setId(i.id)} aria-current={i.id === id} className={cx("w-full px-4 py-3 text-left hover:bg-white/[0.04]", i.id === id && "bg-accent/[0.08]")}>
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="font-mono text-xs text-accent">#{i.id}</span>
                      <PriorityBadge label={i.priority_label} score={i.priority_score} />
                      {i.is_simulation && <SimBadge />}
                    </span>
                    <span className="mt-1 block truncate text-sm">{incidentTitle(i)}</span>
                    <span className="mt-1 block"><CategoryChip category={i.category} /></span>
                  </button>
                </li>
              ))}</ul>}
          </div>
        </section>
        <section className="panel p-4 md:p-5">
          {current ? <IncidentIntel incident={current} /> : <EmptyState title="Select an incident" hint="Choose an incident from the list to view its full intelligence panel." />}
        </section>
      </div>
    </div>
  );
};
