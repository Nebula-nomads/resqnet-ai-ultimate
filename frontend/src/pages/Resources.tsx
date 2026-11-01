import React, { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { AlertTriangle, Info } from "lucide-react";
import { describeError, fetchResources } from "../api";
import { useApp } from "../state/AppState";
import { cap, isOpen } from "../lib/format";
import { ResourceIcon } from "../components/ResourceIcon";
import { EmptyState, SectionTitle, Skeleton } from "../components/ui";

const CATEGORIES = ["flood", "fire", "earthquake", "medical", "infrastructure"];

export const Resources: React.FC = () => {
  const { visible } = useApp();
  const results = useQueries({
    queries: CATEGORIES.map((c) => ({ queryKey: ["resources", c], queryFn: () => fetchResources(c), staleTime: 60_000 })),
  });

  const open = useMemo(() => visible.filter(isOpen), [visible]);
  const openByCat = useMemo(() => {
    const m: Record<string, number> = {};
    open.forEach((i) => { const k = (i.category ?? "").toLowerCase(); m[k] = (m[k] ?? 0) + 1; });
    return m;
  }, [open]);
  const requested = useMemo(() => {
    const m: Record<string, number> = {};
    open.forEach((i) => i.required_resources?.forEach((r) => { m[r] = (m[r] ?? 0) + 1; }));
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [open]);

  return (
    <div className="space-y-4 p-3 md:p-5">
      <div>
        <h1 className="heading text-xl md:text-2xl">Resource Recommendations</h1>
        <p className="text-xs text-tx2">Category-based recommendations from <span className="font-mono">GET /api/v1/resources/&#123;category&#125;</span></p>
      </div>
      <div className="flex items-start gap-2 rounded-xl border border-med/30 bg-med/10 p-3 text-xs text-med" role="note">
        <Info size={15} className="mt-0.5 shrink-0" />
        <p>These are recommendations only. The backend does not track resource inventory, availability, or deployment, so nothing here implies a resource is on hand or dispatched.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {CATEGORIES.map((c, n) => {
          const r = results[n];
          return (
            <section key={c} className="panel p-4">
              <SectionTitle title={cap(c)} right={
                <span className="rounded border px-2 py-0.5 font-mono text-[10px] text-tx2" title="Open incidents of this category in the current data scope">
                  {openByCat[c] ?? 0} open
                </span>} />
              {r.isLoading ? <div className="space-y-2"><Skeleton className="h-12" /><Skeleton className="h-12" /><Skeleton className="h-12" /></div>
                : r.isError ? <p role="alert" className="flex items-center gap-2 text-xs text-crit"><AlertTriangle size={14} />{describeError(r.error)}</p>
                : r.data && r.data.resources.length ? (
                  <ul className="space-y-2">
                    {r.data.resources.map((name) => (
                      <li key={name} className="flex items-center gap-3 rounded-lg border bg-white/[0.02] px-3 py-2.5">
                        <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-accent/30 bg-accent/10 text-accent"><ResourceIcon name={name} /></span>
                        <span className="text-sm">{name}</span>
                        <span className="ml-auto font-mono text-[10px] uppercase text-tx2">{c}</span>
                      </li>
                    ))}
                  </ul>
                ) : <EmptyState title="No recommendations" hint="The backend returned an empty list for this category." />}
            </section>
          );
        })}
      </div>

      <section className="panel p-4">
        <SectionTitle title="Requested across open incidents" sub="Counted from required_resources on each open incident record" />
        {requested.length === 0 ? <p className="text-xs text-tx2">No open incident lists required resources.</p> : (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {requested.map(([name, count]) => (
              <li key={name} className="flex items-center gap-3 rounded-lg border bg-white/[0.02] px-3 py-2.5">
                <ResourceIcon name={name} className="text-accent2" />
                <span className="text-sm">{name}</span>
                <span className="ml-auto font-mono text-xs text-tx2">×{count}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};
