import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchHealth, fetchIncidents, Incident } from "../api";
import { incidentTitle } from "../lib/format";

export type PageId =
  | "overview" | "live" | "livefeed" | "reports" | "intel" | "geo" | "resources" | "simulation" | "resolved" | "settings";

export const PAGE_IDS: PageId[] = [
  "overview", "live", "livefeed", "reports", "intel", "geo", "resources", "simulation", "resolved", "settings",
];

export type Scope = "all" | "real" | "sim";

export type Notice = {
  key: string;
  incidentId: number;
  title: string;
  sub: string;
  label: string | null;
  isSim: boolean;
  at: number;
  read: boolean;
};

const EMPTY: Incident[] = [];

type Ctx = {
  page: PageId;
  go: (p: PageId) => void;
  selectedId: number | null;
  openIncident: (id: number | null) => void;
  scope: Scope;
  setScope: (s: Scope) => void;
  /** every incident returned by the backend */
  incidents: Incident[];
  /** incidents after applying the global data-scope (all / real only / simulation only) */
  visible: Incident[];
  q: {
    isLoading: boolean;
    isError: boolean;
    error: unknown;
    isFetching: boolean;
    updatedAt: number;
    refetch: () => void;
  };
  health: { online: boolean; latencyMs?: number; checking: boolean };
  notices: Notice[];
  unread: number;
  markAllRead: () => void;
  clearNotices: () => void;
  toasts: Notice[];
  dismissToast: (key: string) => void;
  navOpen: boolean;
  setNavOpen: (v: boolean) => void;
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
};

const AppCtx = createContext<Ctx | null>(null);
export const useApp = (): Ctx => {
  const c = useContext(AppCtx);
  if (!c) throw new Error("useApp must be used inside <AppProvider>");
  return c;
};

const readHash = (): PageId => {
  const h = window.location.hash.replace(/^#\/?/, "") as PageId;
  return PAGE_IDS.includes(h) ? h : "overview";
};

const safeGet = (k: string) => {
  try { return window.localStorage.getItem(k); } catch { return null; }
};
const safeSet = (k: string, v: string) => {
  try { window.localStorage.setItem(k, v); } catch { /* storage unavailable */ }
};

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [page, setPage] = useState<PageId>(readHash);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [scope, setScope] = useState<Scope>("all");
  const [navOpen, setNavOpen] = useState(false);
  const [collapsed, setCollapsedRaw] = useState(() => safeGet("rq.nav.collapsed") === "1");
  const [notices, setNotices] = useState<Notice[]>([]);
  const [toasts, setToasts] = useState<Notice[]>([]);

  useEffect(() => {
    const on = () => setPage(readHash());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);

  const go = useCallback((p: PageId) => {
    window.location.hash = `#/${p}`;
    setPage(p);
    setNavOpen(false);
  }, []);

  const setCollapsed = useCallback((v: boolean) => {
    setCollapsedRaw(v);
    safeSet("rq.nav.collapsed", v ? "1" : "0");
  }, []);

  // ---- incidents: polled every 5 s from the real backend ----
  const iq = useQuery(["incidents"], fetchIncidents, { refetchInterval: 5000 });
  const incidents = iq.data ?? EMPTY;

  // ---- backend health ----
  const hq = useQuery(["health"], fetchHealth, { refetchInterval: 5000, retry: false });
  const health = {
    online: hq.isSuccess && hq.data?.status === "ok" && !hq.isError,
    latencyMs: hq.data?.latencyMs,
    checking: hq.isLoading,
  };

  const visible = useMemo(
    () => (scope === "all" ? incidents : incidents.filter((i) => (scope === "sim" ? i.is_simulation : !i.is_simulation))),
    [incidents, scope]
  );

  // ---- notification-style alerts for newly received records ----
  const seen = useRef<Set<number> | null>(null);
  useEffect(() => {
    if (!iq.data) return;
    if (seen.current === null) {
      seen.current = new Set(iq.data.map((i) => i.id)); // baseline: don't alert for pre-existing records
      return;
    }
    const known = seen.current;
    const fresh = iq.data.filter((i) => !known.has(i.id));
    if (!fresh.length) return;
    fresh.forEach((i) => known.add(i.id));
    const mk = (i: Incident): Notice => ({
      key: `${i.id}-${Date.now()}`,
      incidentId: i.id,
      title: incidentTitle(i),
      sub: `${i.category ?? "unclassified"} · score ${i.priority_score ?? "—"}`,
      label: i.priority_label,
      isSim: i.is_simulation,
      at: Date.now(),
      read: false,
    });
    const n = fresh.map(mk);
    setNotices((p) => [...n, ...p].slice(0, 50));
    setToasts((p) => [...n.slice(0, 3), ...p].slice(0, 4));
  }, [iq.data]);

  const dismissToast = useCallback((key: string) => setToasts((p) => p.filter((t) => t.key !== key)), []);
  const markAllRead = useCallback(() => setNotices((p) => p.map((n) => ({ ...n, read: true }))), []);
  const clearNotices = useCallback(() => setNotices([]), []);

  const value: Ctx = {
    page, go, selectedId, openIncident: setSelectedId, scope, setScope,
    incidents, visible,
    q: {
      isLoading: iq.isLoading, isError: iq.isError, error: iq.error, isFetching: iq.isFetching,
      updatedAt: iq.dataUpdatedAt, refetch: () => { void iq.refetch(); },
    },
    health, notices, unread: notices.filter((n) => !n.read).length, markAllRead, clearNotices,
    toasts, dismissToast, navOpen, setNavOpen, collapsed, setCollapsed,
  };
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
};
