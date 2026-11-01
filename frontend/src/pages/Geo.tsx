import React, { useMemo } from "react";
import { useApp } from "../state/AppState";
import { computeStats } from "../lib/format";
import { LiveMap } from "../components/LiveMap";

export const Geo: React.FC = () => {
  const { visible } = useApp();
  const s = useMemo(() => computeStats(visible), [visible]);
  return (
    <div className="flex h-full flex-col gap-3 p-3 md:p-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="heading text-xl md:text-2xl">Geographical Monitoring</h1>
          <p className="text-xs text-tx2">OpenStreetMap · markers colour-coded by priority · dashed ring = simulation</p>
        </div>
        <p className="font-mono text-xs text-tx2">{s.mapped} plotted · {s.total - s.mapped} without coordinates · {s.total} total</p>
      </div>
      <LiveMap incidents={visible} className="min-h-[520px] flex-1" />
    </div>
  );
};
