import React, { useMemo } from "react";
import { BarChart3, Flame, Inbox, PieChart as PieIcon, Radio, Timer, Users } from "lucide-react";
import { useApp } from "../state/AppState";
import { computeStats, isOpen, parseUtc, sortByPriority } from "../lib/format";
import { KpiCards } from "../components/KpiCards";
import { LiveMap } from "../components/LiveMap";
import {
  ActivityTimeline, CategoryBars, PeopleAffected, PriorityDonut, StatusDistribution, VulnerablePanel,
} from "../components/Charts";
import { IncidentRow } from "../components/IncidentRow";
import { EmptyState, SectionTitle, Skeleton } from "../components/ui";

export const Overview: React.FC = () => {
  const { visible, q, go } = useApp();
  const stats = useMemo(() => computeStats(visible), [visible]);
  const recent = useMemo(
    () => [...visible].sort((a, b) => (parseUtc(b.created_at)?.getTime() ?? 0) - (parseUtc(a.created_at)?.getTime() ?? 0)).slice(0, 6),
    [visible]
  );
  const top = useMemo(() => visible.filter(isOpen).sort(sortByPriority).slice(0, 6), [visible]);

  return (
    <div className="space-y-4 p-3 md:p-5">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="heading text-xl md:text-2xl">Command Centre</h1>
          <p className="text-xs text-tx2">Live statistics computed from backend incident records · refreshed every 5 s</p>
        </div>
      </div>

      <KpiCards stats={stats} loading={q.isLoading} />

      <LiveMap incidents={visible} className="h-[560px]" />

      <div className="grid gap-4 xl:grid-cols-3">
        <section className="panel p-4 xl:col-span-2">
          <SectionTitle icon={<Timer size={15} />} title="Incident activity timeline" sub="Reports received per period (by created_at)" />
          {q.isLoading ? <Skeleton className="h-52" /> : <ActivityTimeline incidents={visible} />}
        </section>
        <section className="panel p-4">
          <SectionTitle icon={<PieIcon size={15} />} title="Priority distribution" />
          {q.isLoading ? <Skeleton className="h-40" /> : <PriorityDonut stats={stats} />}
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        <section className="panel p-4">
          <SectionTitle icon={<BarChart3 size={15} />} title="Disaster categories" />
          {q.isLoading ? <Skeleton className="h-36" /> : <CategoryBars stats={stats} />}
        </section>
        <section className="panel p-4">
          <SectionTitle icon={<Radio size={15} />} title="Status distribution" />
          {q.isLoading ? <Skeleton className="h-24" /> : <StatusDistribution stats={stats} />}
        </section>
        <section className="panel p-4">
          <SectionTitle icon={<Users size={15} />} title="People affected" />
          {q.isLoading ? <Skeleton className="h-36" /> : <PeopleAffected stats={stats} />}
        </section>
        <section className="panel p-4">
          <SectionTitle icon={<Users size={15} />} title="Vulnerable populations" />
          {q.isLoading ? <Skeleton className="h-36" /> : <VulnerablePanel stats={stats} />}
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="panel overflow-hidden">
          <div className="p-4 pb-2"><SectionTitle icon={<Flame size={15} />} title="Highest-priority open incidents" right={<button className="btn !py-1" onClick={() => go("live")}>All operations</button>} /></div>
          {top.length ? <ul>{top.map((i) => <IncidentRow key={i.id} incident={i} />)}</ul>
            : <EmptyState title="No open incidents" hint="Nothing awaiting or in progress in the current data scope." />}
        </section>
        <section className="panel overflow-hidden">
          <div className="p-4 pb-2"><SectionTitle icon={<Inbox size={15} />} title="Recent incident reports" right={<button className="btn !py-1" onClick={() => go("reports")}>Submit report</button>} /></div>
          {recent.length ? <ul>{recent.map((i) => <IncidentRow key={i.id} incident={i} />)}</ul>
            : <EmptyState title="No reports yet" hint="Submit an incident report or run a simulation scenario." />}
        </section>
      </div>
    </div>
  );
};
