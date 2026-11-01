import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity, Bell, BellOff, Brain, CheckCircle2, ChevronsLeft, ChevronsRight, FileWarning, FlaskConical, Globe2,
  LayoutDashboard, LifeBuoy, Maximize2, Menu, Minimize2, Radar, Radio, RefreshCw, Search, Settings, Wifi, WifiOff, X,
} from "lucide-react";
import { PageId, Scope, useApp } from "../state/AppState";
import { cap, fmtTime, incidentTitle, timeAgo } from "../lib/format";
import { LiveDot, PriorityBadge, SimBadge, cx } from "./ui";

export const NAV: Array<{ id: PageId; label: string; icon: React.ElementType }> = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "live", label: "Live Operations", icon: Activity },
  { id: "livefeed", label: "Live Data Feed", icon: Radio },
  { id: "reports", label: "Incident Reports", icon: FileWarning },
  { id: "intel", label: "Intelligence Analysis", icon: Brain },
  { id: "geo", label: "Geographical Monitoring", icon: Globe2 },
  { id: "resources", label: "Resource Recommendations", icon: LifeBuoy },
  { id: "simulation", label: "Simulation Lab", icon: FlaskConical },
  { id: "resolved", label: "Resolved Incidents", icon: CheckCircle2 },
  { id: "settings", label: "Settings", icon: Settings },
];

export const Logo: React.FC<{ compact?: boolean }> = ({ compact }) => (
  <div className="flex items-center gap-2.5">
    <div className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-accent/40 bg-accent/10 shadow-glow">
      <Radar size={19} className="text-accent" />
      <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-crit shadow-[0_0_8px_#FF354B]" />
    </div>
    {!compact && (
      <div className="leading-none">
        <p className="heading text-[15px] tracking-[0.14em]">RESQNET<span className="text-accent"> AI</span></p>
        <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.2em] text-tx2">Disaster intelligence</p>
      </div>
    )}
  </div>
);

// ---------------- sidebar ----------------
export const Sidebar: React.FC = () => {
  const { page, go, collapsed, setCollapsed, navOpen, setNavOpen, incidents } = useApp();
  const openCrit = incidents.filter((i) => i.priority_label?.toLowerCase() === "critical" && i.status !== "resolved").length;

  const list = (compact: boolean) => (
    <nav aria-label="Primary" className="flex-1 space-y-1 overflow-y-auto px-2 py-3">
      {NAV.map((n) => {
        const active = page === n.id;
        return (
          <button
            key={n.id} onClick={() => go(n.id)} aria-current={active ? "page" : undefined} title={compact ? n.label : undefined}
            className={cx(
              "group relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[13px] transition-colors",
              active ? "bg-accent/10 text-accent" : "text-tx2 hover:bg-white/5 hover:text-tx",
              compact && "justify-center px-0"
            )}
          >
            {active && <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r bg-accent shadow-[0_0_10px_#00D9FF]" />}
            <n.icon size={17} className="shrink-0" />
            {!compact && <span className="truncate">{n.label}</span>}
            {!compact && n.id === "live" && openCrit > 0 && (
              <span className="ml-auto rounded-full bg-crit/20 px-1.5 font-mono text-[10px] text-crit">{openCrit}</span>
            )}
          </button>
        );
      })}
    </nav>
  );

  return (
    <>
      <aside className={cx("hidden shrink-0 flex-col border-r bg-panel/90 transition-[width] duration-200 lg:flex", collapsed ? "w-[68px]" : "w-64")}>
        <div className={cx("flex h-14 items-center border-b px-4", collapsed && "justify-center px-0")}><Logo compact={collapsed} /></div>
        {list(collapsed)}
        <button className="m-2 flex items-center justify-center gap-2 rounded-lg border py-2 text-xs text-tx2 hover:text-tx"
          onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}>
          {collapsed ? <ChevronsRight size={15} /> : <><ChevronsLeft size={15} /> Collapse</>}
        </button>
      </aside>

      <AnimatePresence>
        {navOpen && (
          <>
            <motion.div className="fixed inset-0 z-[1400] bg-black/60 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setNavOpen(false)} />
            <motion.aside className="fixed left-0 top-0 z-[1450] flex h-full w-72 flex-col border-r bg-panel lg:hidden"
              initial={{ x: "-100%" }} animate={{ x: 0 }} exit={{ x: "-100%" }} transition={{ type: "tween", duration: 0.22 }}>
              <div className="flex h-14 items-center justify-between border-b px-4">
                <Logo />
                <button className="btn !px-2" onClick={() => setNavOpen(false)} aria-label="Close navigation"><X size={16} /></button>
              </div>
              {list(false)}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
};

// ---------------- global search ----------------
const GlobalSearch: React.FC = () => {
  const { incidents, openIncident } = useApp();
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const ref = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) { e.preventDefault(); ref.current?.focus(); }
    };
    const onClick = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("mousedown", onClick); };
  }, []);

  const results = useMemo(() => {
    const s = text.trim().toLowerCase().replace(/^#/, "");
    if (!s) return [];
    return incidents.filter((i) =>
      String(i.id) === s ||
      [i.description, i.raw_report, i.location_name, i.category].some((f) => f?.toLowerCase().includes(s))
    ).slice(0, 7);
  }, [text, incidents]);

  const pick = (id: number) => { openIncident(id); setOpen(false); setText(""); ref.current?.blur(); };

  return (
    <div ref={box} className="relative w-full max-w-md">
      <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-tx2" />
      <input
        ref={ref} value={text} role="combobox" aria-expanded={open && results.length > 0} aria-controls="gs-list" aria-label="Search incidents"
        placeholder="Search incidents — ID, location, description…" className="input !py-1.5 pl-9 pr-12 text-xs"
        onChange={(e) => { setText(e.target.value); setOpen(true); setHi(0); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(h + 1, results.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
          else if (e.key === "Enter" && results[hi]) pick(results[hi].id);
          else if (e.key === "Escape") { setOpen(false); ref.current?.blur(); }
        }}
      />
      <kbd className="absolute right-2 top-1/2 hidden -translate-y-1/2 rounded border px-1.5 font-mono text-[10px] text-tx2 sm:block">Ctrl K</kbd>
      {open && text.trim() && (
        <ul id="gs-list" role="listbox" className="absolute left-0 right-0 top-full z-[1200] mt-1 overflow-hidden rounded-xl border border-accent/25 bg-panel shadow-2xl">
          {results.length === 0 && <li className="px-4 py-3 text-xs text-tx2">No matching incidents.</li>}
          {results.map((r, n) => (
            <li key={r.id} role="option" aria-selected={n === hi}>
              <button onMouseEnter={() => setHi(n)} onClick={() => pick(r.id)}
                className={cx("flex w-full items-center gap-2 px-3 py-2 text-left text-xs", n === hi && "bg-accent/10")}>
                <span className="font-mono text-accent">#{r.id}</span>
                <span className="min-w-0 flex-1 truncate">{incidentTitle(r)}</span>
                {r.is_simulation && <SimBadge />}
                <PriorityBadge label={r.priority_label} score={r.priority_score} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

// ---------------- notifications ----------------
const NotificationCenter: React.FC = () => {
  const { notices, unread, markAllRead, clearNotices, openIncident } = useApp();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const on = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("mousedown", on); window.addEventListener("keydown", esc);
    return () => { window.removeEventListener("mousedown", on); window.removeEventListener("keydown", esc); };
  }, []);
  return (
    <div ref={box} className="relative">
      <button className="btn relative !px-2.5" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`} aria-expanded={open}
        onClick={() => { setOpen((o) => !o); if (!open) markAllRead(); }}>
        <Bell size={16} />
        {unread > 0 && <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-crit px-1 font-mono text-[9px] font-bold text-white">{unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-[1200] mt-2 w-80 overflow-hidden rounded-xl border border-accent/25 bg-panel shadow-2xl">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <span className="heading text-xs uppercase tracking-wider">Incident alerts</span>
            {notices.length > 0 && <button className="text-[11px] text-tx2 hover:text-tx" onClick={clearNotices}>Clear</button>}
          </div>
          <ul className="max-h-80 overflow-y-auto">
            {notices.length === 0 && (
              <li className="flex flex-col items-center gap-2 px-4 py-8 text-center text-xs text-tx2"><BellOff size={20} />No new incidents received since this session began.</li>
            )}
            {notices.map((n) => (
              <li key={n.key} className="border-b last:border-0">
                <button className="flex w-full flex-col gap-1 px-3 py-2.5 text-left hover:bg-white/5" onClick={() => { openIncident(n.incidentId); setOpen(false); }}>
                  <span className="flex items-center gap-2"><PriorityBadge label={n.label} />{n.isSim && <SimBadge />}<span className="ml-auto font-mono text-[10px] text-tx2">{timeAgo(new Date(n.at).toISOString())}</span></span>
                  <span className="truncate text-xs font-medium">#{n.incidentId} {n.title}</span>
                  <span className="text-[11px] text-tx2">{cap(n.sub.split(" · ")[0])} · {n.sub.split(" · ")[1]}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

const SCOPES: Array<{ id: Scope; label: string }> = [{ id: "all", label: "All" }, { id: "real", label: "Real" }, { id: "sim", label: "Sim" }];

// ---------------- top bar ----------------
export const TopBar: React.FC = () => {
  const { health, q, setNavOpen, scope, setScope, incidents } = useApp();
  const [full, setFull] = useState(!!document.fullscreenElement);
  const simCount = incidents.filter((i) => i.is_simulation).length;

  useEffect(() => {
    const on = () => setFull(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);
  const toggleFull = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => undefined);
  };

  const online = health.online && !q.isError;
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-panel/90 px-3 backdrop-blur md:px-4">
      <button className="btn !px-2.5 lg:hidden" onClick={() => setNavOpen(true)} aria-label="Open navigation"><Menu size={16} /></button>
      <div className="lg:hidden"><Logo compact /></div>
      <GlobalSearch />

      <div className="ml-auto flex items-center gap-2 md:gap-3">
        {simCount > 0 && (
          <div className="hidden items-center gap-1 rounded-lg border border-dashed border-accent2/60 bg-accent2/10 p-0.5 md:flex" role="group" aria-label="Data scope">
            <span className="px-1.5 font-mono text-[10px] font-bold tracking-wider text-[#9fb0ff]"><FlaskConical size={10} className="mr-1 inline" />SIM DATA · {simCount}</span>
            {SCOPES.map((s) => (
              <button key={s.id} onClick={() => setScope(s.id)} aria-pressed={scope === s.id}
                className={cx("rounded px-1.5 py-0.5 font-mono text-[10px] uppercase", scope === s.id ? "bg-accent2/40 text-white" : "text-tx2 hover:text-tx")}>{s.label}</button>
            ))}
          </div>
        )}
        <div className="hidden items-center gap-2 rounded-lg border px-2.5 py-1.5 sm:flex" title={online ? `Backend healthy · ${health.latencyMs ?? "?"} ms` : "Backend unreachable"}>
          {online ? <Wifi size={14} className="text-low" /> : <WifiOff size={14} className="text-crit" />}
          <LiveDot color={online ? "#27D99A" : "#FF354B"} />
          <span className={cx("font-mono text-[10px] uppercase tracking-wider", online ? "text-low" : "text-crit")}>
            {health.checking ? "Checking" : online ? `Online · ${health.latencyMs}ms` : "Offline"}
          </span>
        </div>
        <div className="hidden items-center gap-1.5 font-mono text-[10px] text-tx2 xl:flex" title="Last successful incident synchronisation">
          <RefreshCw size={12} className={q.isFetching ? "animate-spin text-accent" : ""} />
          <span>SYNC {fmtTime(q.updatedAt)}</span>
        </div>
        <NotificationCenter />
        <button className="btn !px-2.5" onClick={toggleFull} aria-label={full ? "Exit fullscreen" : "Enter fullscreen"}>
          {full ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </button>
        <div className="flex items-center gap-2 rounded-lg border px-2 py-1" title="No authentication in the backend — local operator session">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent2/30 font-display text-[11px] font-semibold">OP</span>
          <span className="hidden leading-tight md:block"><span className="block text-[11px] font-medium">Operator</span><span className="block font-mono text-[9px] text-tx2">LOCAL SESSION</span></span>
        </div>
      </div>
    </header>
  );
};

// ---------------- toast alerts ----------------
export const Toasts: React.FC = () => {
  const { toasts, dismissToast, openIncident } = useApp();
  useEffect(() => {
    const timers = toasts.map((t) => window.setTimeout(() => dismissToast(t.key), 7000));
    return () => timers.forEach(clearTimeout);
  }, [toasts, dismissToast]);
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[1700] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2" aria-live="polite">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div key={t.key} layout initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 40 }}
            className="pointer-events-auto overflow-hidden rounded-xl border border-accent/30 bg-panel/95 shadow-glow backdrop-blur">
            <button className="flex w-full flex-col gap-1 p-3 text-left" onClick={() => { openIncident(t.incidentId); dismissToast(t.key); }}>
              <span className="flex items-center gap-2"><span className="label !text-accent">New incident</span><PriorityBadge label={t.label} />{t.isSim && <SimBadge />}</span>
              <span className="truncate text-sm font-medium">#{t.incidentId} {t.title}</span>
              <span className="text-[11px] text-tx2">{t.sub}</span>
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};
