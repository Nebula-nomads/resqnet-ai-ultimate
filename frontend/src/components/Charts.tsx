import React, { useMemo, useState } from "react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Baby, Users } from "lucide-react";
import type { Incident } from "../api";
import type { PriorityKey, Stats } from "../lib/format";
import {
  PRIORITY_HEX, STATUS_ORDER, cap, parseUtc, priorityKey, statusHex, statusLabel,
} from "../lib/format";
import { AnimatedNumber, EmptyState, cx } from "./ui";

const AXIS = { fill: "#8294AA", fontSize: 10, fontFamily: "JetBrains Mono, monospace" };

const TipBox: React.FC<{ active?: boolean; payload?: any[]; label?: string }> = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-accent/30 bg-base/95 px-3 py-2 text-xs shadow-glow">
      {label && <p className="label mb-1">{label}</p>}
      {payload.map((p, i) => (
        <p key={i} className="font-mono" style={{ color: p.color || p.payload?.fill || "#EAF3FF" }}>
          {p.name}: {p.value}
        </p>
      ))}
    </div>
  );
};

// ---------------- activity timeline ----------------
export const ActivityTimeline: React.FC<{ incidents: Incident[] }> = ({ incidents }) => {
  const [mode, setMode] = useState<"24h" | "7d">("24h");
  const { data, outside } = useMemo(() => {
    const hourly = mode === "24h";
    const n = hourly ? 24 : 7;
    const floor = (d: Date) => {
      const x = new Date(d);
      if (hourly) x.setMinutes(0, 0, 0); else x.setHours(0, 0, 0, 0);
      return x;
    };
    const starts: Date[] = [];
    const cur = floor(new Date());
    for (let k = n - 1; k >= 0; k--) {
      const d = new Date(cur);
      if (hourly) d.setHours(d.getHours() - k); else d.setDate(d.getDate() - k);
      starts.push(d);
    }
    const idx = new Map(starts.map((d, i) => [d.getTime(), i]));
    const rows = starts.map((d) => ({
      t: hourly ? `${String(d.getHours()).padStart(2, "0")}:00` : d.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      Reports: 0, Critical: 0,
    }));
    let outside = 0;
    for (const i of incidents) {
      const c = parseUtc(i.created_at);
      const slot = c ? idx.get(floor(c).getTime()) : undefined;
      if (slot === undefined) { outside++; continue; }
      rows[slot].Reports++;
      if (priorityKey(i.priority_label) === "critical") rows[slot].Critical++;
    }
    return { data: rows, outside };
  }, [incidents, mode]);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[11px] text-tx2">{outside > 0 ? `${outside} older record(s) outside window` : "All records in window"}</p>
        <div className="flex gap-1" role="tablist" aria-label="Timeline range">
          {(["24h", "7d"] as const).map((m) => (
            <button key={m} role="tab" aria-selected={mode === m} onClick={() => setMode(m)}
              className={cx("rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase", mode === m ? "border-accent/60 bg-accent/15 text-accent" : "text-tx2 hover:text-tx")}>
              {m}
            </button>
          ))}
        </div>
      </div>
      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 6, right: 8, left: -22, bottom: 0 }}>
            <defs>
              <linearGradient id="gRep" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#00D9FF" stopOpacity={0.4} /><stop offset="100%" stopColor="#00D9FF" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gCrit" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#FF354B" stopOpacity={0.45} /><stop offset="100%" stopColor="#FF354B" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(125,160,190,.1)" vertical={false} />
            <XAxis dataKey="t" tick={AXIS} tickLine={false} axisLine={false} interval="preserveStartEnd" />
            <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
            <Tooltip content={<TipBox />} />
            <Area type="monotone" dataKey="Reports" stroke="#00D9FF" strokeWidth={2} fill="url(#gRep)" />
            <Area type="monotone" dataKey="Critical" stroke="#FF354B" strokeWidth={2} fill="url(#gCrit)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

// ---------------- priority donut ----------------
export const PriorityDonut: React.FC<{ stats: Stats }> = ({ stats }) => {
  const data = (["critical", "high", "medium", "low", "unknown"] as PriorityKey[])
    .map((k) => ({ name: k === "unknown" ? "Unscored" : cap(k), value: stats.byPriority[k], fill: PRIORITY_HEX[k] }))
    .filter((d) => d.value > 0);
  if (!data.length) return <EmptyState title="No priority data" />;
  return (
    <div className="flex items-center gap-4">
      <div className="relative h-40 w-40 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={48} outerRadius={70} paddingAngle={2} stroke="none">
              {data.map((d) => <Cell key={d.name} fill={d.fill} />)}
            </Pie>
            <Tooltip content={<TipBox />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-mono text-2xl font-semibold"><AnimatedNumber value={stats.total} /></span>
          <span className="label">total</span>
        </div>
      </div>
      <ul className="flex-1 space-y-1.5 text-xs">
        {data.map((d) => (
          <li key={d.name} className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: d.fill }} />{d.name}</span>
            <span className="font-mono text-tx2">{d.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

// ---------------- category bars ----------------
export const CategoryBars: React.FC<{ stats: Stats }> = ({ stats }) => {
  const data = Object.entries(stats.byCategory)
    .map(([k, v]) => ({ name: cap(k), value: v }))
    .sort((a, b) => b.value - a.value);
  if (!data.length) return <EmptyState title="No category data" />;
  return (
    <div style={{ height: Math.max(130, data.length * 34 + 20) }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 12, left: 0, bottom: 0 }}>
          <XAxis type="number" hide allowDecimals={false} />
          <YAxis type="category" dataKey="name" tick={{ ...AXIS, fontSize: 11 }} width={92} tickLine={false} axisLine={false} />
          <Tooltip content={<TipBox />} cursor={{ fill: "rgba(0,217,255,.06)" }} />
          <Bar dataKey="value" name="Incidents" fill="#536DFF" radius={[0, 4, 4, 0]} barSize={14} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

// ---------------- status distribution ----------------
export const StatusDistribution: React.FC<{ stats: Stats }> = ({ stats }) => {
  if (!stats.total) return <EmptyState title="No status data" />;
  const keys = [...STATUS_ORDER, ...Object.keys(stats.byStatus).filter((k) => !(STATUS_ORDER as readonly string[]).includes(k))];
  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full bg-white/5" role="img"
        aria-label={keys.map((k) => `${statusLabel(k)} ${stats.byStatus[k] ?? 0}`).join(", ")}>
        {keys.map((k) => {
          const v = stats.byStatus[k] ?? 0;
          return v ? <div key={k} style={{ width: `${(v / stats.total) * 100}%`, background: statusHex(k) }} /> : null;
        })}
      </div>
      <ul className="mt-3 grid grid-cols-3 gap-2">
        {keys.map((k) => (
          <li key={k} className="rounded-lg border bg-white/[0.02] p-2">
            <p className="label flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full" style={{ background: statusHex(k) }} />{statusLabel(k)}</p>
            <p className="mt-1 font-mono text-lg">{stats.byStatus[k] ?? 0}</p>
          </li>
        ))}
      </ul>
    </div>
  );
};

// ---------------- people affected ----------------
export const PeopleAffected: React.FC<{ stats: Stats }> = ({ stats }) => {
  const rows = Object.entries(stats.peopleByCategory).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...rows.map((r) => r[1]));
  return (
    <div>
      <div className="flex items-end gap-3">
        <Users size={22} className="mb-1 text-accent" />
        <div>
          <p className="font-mono text-3xl font-semibold leading-none"><AnimatedNumber value={stats.people} /></p>
          <p className="label mt-1">people affected (reported)</p>
        </div>
      </div>
      <p className="mt-2 text-[11px] text-tx2">
        Sum of <span className="font-mono">people_affected</span> across {stats.peopleReported} incident(s)
        {stats.peopleUnreported > 0 && ` · ${stats.peopleUnreported} without a reported count`}.
      </p>
      <ul className="mt-3 space-y-2">
        {rows.map(([cat, n]) => (
          <li key={cat}>
            <div className="mb-0.5 flex justify-between text-xs"><span>{cap(cat)}</span><span className="font-mono text-tx2">{n}</span></div>
            <div className="h-1.5 rounded-full bg-white/5"><div className="h-full rounded-full bg-accent" style={{ width: `${(n / max) * 100}%` }} /></div>
          </li>
        ))}
      </ul>
    </div>
  );
};

// ---------------- vulnerable populations ----------------
export const VulnerablePanel: React.FC<{ stats: Stats }> = ({ stats }) => {
  const rows = Object.entries(stats.vulnerable).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...rows.map((r) => r[1]));
  return (
    <div>
      <div className="flex items-end gap-3">
        <Baby size={22} className="mb-1 text-high" />
        <div>
          <p className="font-mono text-3xl font-semibold leading-none"><AnimatedNumber value={stats.withVulnerable} /></p>
          <p className="label mt-1">incidents with vulnerable people</p>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="mt-3 text-xs text-tx2">No vulnerable populations identified in current records.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {rows.map(([k, n]) => (
            <li key={k}>
              <div className="mb-0.5 flex justify-between text-xs"><span>{cap(k)}</span><span className="font-mono text-tx2">{n} incident{n === 1 ? "" : "s"}</span></div>
              <div className="h-1.5 rounded-full bg-white/5"><div className="h-full rounded-full bg-high" style={{ width: `${(n / max) * 100}%` }} /></div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
