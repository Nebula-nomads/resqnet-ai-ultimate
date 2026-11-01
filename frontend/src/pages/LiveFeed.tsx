/**
 * RESQNET AI — Live Data Feed Page
 * Displays real-time external events from USGS, NASA FIRMS, and Open-Meteo
 * with actual ingestion latency for every report.
 */

import React, { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity, AlertCircle, AlertTriangle, ArrowUpRight, Clock,
  Database, ExternalLink, Flame, Globe2, Link2, RefreshCw,
  Satellite, Thermometer, Waves, X, Zap
} from "lucide-react";
import {
  API_URL, fetchExternalEvents, fetchExternalEvent, fetchExternalEventStats,
  ExternalEvent, ExternalEventStats, LatencyInfo,
  triggerProviderSync
} from "../api";
import { LatencyBadge, LatencyRow } from "../components/LatencyBadge";
import { LatencyMonitor } from "../components/LatencyMonitor";
import { Spinner, cx } from "../components/ui";
import { fmtDateTime, timeAgo } from "../lib/format";

// ── Provider metadata ─────────────────────────────────────────────────

const PROVIDER_META: Record<string, { label: string; icon: React.ReactNode; color: string; abbrev: string }> = {
  usgs: { label: "USGS Earthquakes", icon: <Waves size={13} />, color: "#FF8A32", abbrev: "USGS" },
  nasa_firms: { label: "NASA FIRMS", icon: <Satellite size={13} />, color: "#FF354B", abbrev: "FIRMS" },
  open_meteo: { label: "Open-Meteo", icon: <Thermometer size={13} />, color: "#00D9FF", abbrev: "WEATHER" },
};

const SEVERITY_COLOR: Record<string, string> = {
  critical: "#FF354B",
  high: "#FF8A32",
  medium: "#FFC247",
  low: "#27D99A",
  unknown: "#8294AA",
};

function severityColor(s: string | null) {
  return SEVERITY_COLOR[s?.toLowerCase() ?? ""] ?? "#8294AA";
}

function providerMeta(pid: string) {
  return PROVIDER_META[pid] ?? { label: pid, icon: <Database size={13} />, color: "#8294AA", abbrev: pid.toUpperCase() };
}

// ── Event Detail Panel ─────────────────────────────────────────────────

const Block: React.FC<{ title: string; icon?: React.ReactNode; children: React.ReactNode }> = ({ title, icon, children }) => (
  <section className="rounded-xl border bg-white/[0.02] p-4">
    <h4 className="label mb-3 flex items-center gap-1.5 !text-tx2">
      {icon && <span className="text-accent">{icon}</span>}
      {title}
    </h4>
    {children}
  </section>
);

const Field: React.FC<{ k: string; children: React.ReactNode; mono?: boolean }> = ({ k, children, mono }) => (
  <div>
    <dt className="label">{k}</dt>
    <dd className={cx("mt-0.5 text-sm break-all", mono && "font-mono")}>{children}</dd>
  </div>
);

const EventDetailPanel: React.FC<{ eventId: number; onClose: () => void }> = ({ eventId, onClose }) => {
  const { data: ev, isLoading, isError } = useQuery(
    ["external-event", eventId],
    () => fetchExternalEvent(eventId),
    { staleTime: 30_000 }
  );

  const pid = ev?.provider_id ?? "";
  const meta = providerMeta(pid);
  const lat = ev?.latency;

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b px-5 py-3 shrink-0">
        <div className="flex items-center gap-2">
          <span style={{ color: meta.color }}>{meta.icon}</span>
          <h2 className="heading text-base uppercase tracking-wider">Report Detail</h2>
        </div>
        <button className="btn !px-2" onClick={onClose} aria-label="Close"><X size={16} /></button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-5 space-y-4">
        {isLoading && <div className="flex justify-center p-10"><Spinner size={22} /></div>}
        {isError && (
          <div className="flex items-center gap-2 text-crit p-4">
            <AlertCircle size={16} /> Failed to load event detail.
          </div>
        )}
        {ev && (
          <>
            {/* Verification status banner */}
            <div
              className="rounded-lg border px-3 py-2 font-mono text-xs font-semibold tracking-wide"
              style={{
                borderColor: `${meta.color}40`,
                background: `${meta.color}12`,
                color: meta.color,
              }}
            >
              {ev.verification_status ?? "STATUS UNKNOWN"}
            </div>

            {/* REPORT INFORMATION */}
            <Block title="Report Information" icon={<Globe2 size={13} />}>
              <dl className="grid grid-cols-2 gap-3">
                <Field k="Title">{ev.title ?? "—"}</Field>
                <Field k="Category">{ev.category ?? "—"}</Field>
                <Field k="Location">{ev.location_name ?? "—"}</Field>
                <Field k="Severity">
                  <span style={{ color: severityColor(ev.severity) }}>
                    {ev.severity ?? "—"}
                  </span>
                </Field>
                {ev.latitude != null && ev.longitude != null && (
                  <Field k="Coordinates" mono>
                    {ev.latitude.toFixed(5)}, {ev.longitude.toFixed(5)}
                  </Field>
                )}
                {ev.magnitude != null && (
                  <Field k="Magnitude" mono>M{ev.magnitude} {ev.magnitude_type && `(${ev.magnitude_type})`}</Field>
                )}
                {ev.depth_km != null && <Field k="Depth" mono>{ev.depth_km} km</Field>}
                {ev.alert_level && <Field k="Alert level">{ev.alert_level}</Field>}
                {ev.tsunami_flag != null && ev.tsunami_flag > 0 && (
                  <Field k="Tsunami flag"><span className="text-crit font-semibold">⚠ TSUNAMI</span></Field>
                )}
                {ev.fire_radiative_power_mw != null && (
                  <Field k="Fire Radiative Power" mono>{ev.fire_radiative_power_mw} MW</Field>
                )}
                {ev.brightness_kelvin != null && (
                  <Field k="Brightness (K)" mono>{ev.brightness_kelvin} K</Field>
                )}
                {ev.confidence_label && <Field k="Detection confidence">{ev.confidence_label}</Field>}
                {ev.satellite && <Field k="Satellite">{ev.satellite}</Field>}
                {ev.instrument && <Field k="Instrument">{ev.instrument}</Field>}
                {ev.day_night && <Field k="Day/Night">{ev.day_night === "D" ? "Daytime" : "Night"}</Field>}
                {ev.source_dataset && <Field k="Source dataset" mono>{ev.source_dataset}</Field>}
                {ev.weather_description && <Field k="Weather condition">{ev.weather_description}</Field>}
                {ev.temperature_c != null && <Field k="Temperature" mono>{ev.temperature_c}°C</Field>}
                {ev.wind_speed_kmh != null && <Field k="Wind speed" mono>{ev.wind_speed_kmh} km/h</Field>}
                {ev.precipitation_mm != null && <Field k="Precipitation" mono>{ev.precipitation_mm} mm</Field>}
                {ev.is_alert_candidate && (
                  <div className="col-span-2">
                    <Field k="Threshold breaches">
                      <ul className="mt-1 space-y-1">
                        {(ev.threshold_breaches ?? []).map((b, i) => (
                          <li key={i} className="flex items-start gap-1 text-xs text-med">
                            <AlertTriangle size={11} className="mt-0.5 shrink-0" />{b}
                          </li>
                        ))}
                      </ul>
                    </Field>
                  </div>
                )}
              </dl>
            </Block>

            {/* SOURCE INFORMATION */}
            <Block title="Source Information" icon={<Database size={13} />}>
              <dl className="grid grid-cols-2 gap-3">
                <Field k="Provider">{meta.label}</Field>
                <Field k="Original event ID" mono>{ev.external_id}</Field>
                {ev.source_url && (
                  <div className="col-span-2">
                    <dt className="label">Original source URL</dt>
                    <dd className="mt-0.5">
                      <a
                        href={ev.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-mono text-xs text-accent hover:underline break-all"
                      >
                        {ev.source_url.slice(0, 80)}{ev.source_url.length > 80 ? "…" : ""}
                        <ExternalLink size={10} className="shrink-0" />
                      </a>
                    </dd>
                  </div>
                )}
                {lat?.source_published_at_utc && (
                  <Field k="Source publication time" mono>{fmtDateTime(lat.source_published_at_utc)}</Field>
                )}
                {lat?.source_updated_at_utc && (
                  <Field k="Source update time" mono>{fmtDateTime(lat.source_updated_at_utc)}</Field>
                )}
              </dl>
            </Block>

            {/* TIMING INFORMATION */}
            <Block title="Timing Information" icon={<Clock size={13} />}>
              <div className="space-y-2">
                {lat?.event_time_utc && (
                  <div>
                    <p className="label">Event occurrence time (UTC)</p>
                    <p className="font-mono text-xs mt-0.5">{fmtDateTime(lat.event_time_utc)}</p>
                  </div>
                )}
                {lat?.received_at_utc && (
                  <div>
                    <p className="label">Backend ingestion time (UTC)</p>
                    <p className="font-mono text-xs mt-0.5">{fmtDateTime(lat.received_at_utc)}</p>
                  </div>
                )}
                <div className="space-y-1.5 mt-3 rounded-lg border bg-base/50 p-3">
                  <LatencyRow
                    label="Source publication delay"
                    seconds={lat?.source_publication_delay_s ?? null}
                    missingReason={lat?.source_published_at_utc ? undefined : "SOURCE PUBLICATION TIME UNAVAILABLE"}
                  />
                  <LatencyRow
                    label="Event detection delay (received_at − event_time)"
                    seconds={lat?.event_detection_delay_s ?? null}
                  />
                  <LatencyRow
                    label="AI processing delay"
                    seconds={lat?.ai_processing_delay_s ?? null}
                    missingReason="Not yet analyzed"
                  />
                  <LatencyRow
                    label="Frontend delivery delay"
                    seconds={lat?.frontend_delivery_delay_s ?? null}
                    missingReason="Measured on first detail view"
                  />
                </div>
              </div>
            </Block>
          </>
        )}
      </div>
    </div>
  );
};

// ── Live feed table row ───────────────────────────────────────────────

const EventRow: React.FC<{ ev: ExternalEvent; onSelect: () => void; selected: boolean }> = ({
  ev, onSelect, selected
}) => {
  const meta = providerMeta(ev.provider_id);
  const lat = ev.latency;

  return (
    <motion.tr
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className={cx(
        "border-b border-white/5 hover:bg-white/[0.025] cursor-pointer transition-colors",
        selected && "bg-accent/[0.06]"
      )}
      onClick={onSelect}
    >
      {/* Report */}
      <td className="px-4 py-2.5">
        <div className="flex items-start gap-2">
          <span style={{ color: meta.color }} className="mt-0.5 shrink-0">{meta.icon}</span>
          <div className="min-w-0">
            <p className="text-sm font-medium truncate max-w-xs">{ev.title ?? "—"}</p>
            <p className="font-mono text-[10px] text-tx2 truncate max-w-xs">{ev.location_name ?? "—"}</p>
            {ev.magnitude != null && (
              <span className="font-mono text-[10px]" style={{ color: meta.color }}>M{ev.magnitude}</span>
            )}
          </div>
        </div>
      </td>
      {/* Source */}
      <td className="px-4 py-2.5">
        <span
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[10px]"
          style={{ background: `${meta.color}18`, color: meta.color, border: `1px solid ${meta.color}30` }}
        >
          {meta.abbrev}
        </span>
      </td>
      {/* Received */}
      <td className="px-4 py-2.5 font-mono text-xs text-tx2 whitespace-nowrap">
        {lat?.received_at_utc
          ? timeAgo(lat.received_at_utc)
          : <span className="text-tx2">—</span>}
      </td>
      {/* Delay */}
      <td className="px-4 py-2.5">
        <LatencyBadge latency={lat} size="sm" showLabel useDetectionDelay />
      </td>
      {/* Detail */}
      <td className="px-4 py-2.5">
        <button
          className="btn !px-2 !py-0.5 !text-[10px]"
          onClick={(e) => { e.stopPropagation(); onSelect(); }}
        >
          <ArrowUpRight size={11} />
        </button>
      </td>
    </motion.tr>
  );
};

// ── Main Page ─────────────────────────────────────────────────────────

const TABS = ["Live Feed", "Latency Monitor"] as const;
type Tab = typeof TABS[number];

const FILTER_PROVIDERS = [
  { id: "", label: "All providers" },
  { id: "usgs", label: "USGS" },
  { id: "nasa_firms", label: "NASA FIRMS" },
  { id: "open_meteo", label: "Open-Meteo" },
];

const FILTER_CATEGORIES = [
  { id: "", label: "All types" },
  { id: "earthquake", label: "Earthquakes" },
  { id: "fire", label: "Fire detections" },
  { id: "weather", label: "Weather" },
];

export const LiveFeed: React.FC = () => {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("Live Feed");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [filterProvider, setFilterProvider] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const sseRef = useRef<EventSource | null>(null);
  const [sseConnected, setSseConnected] = useState(false);
  const [newEventFlash, setNewEventFlash] = useState(false);

  // ── SSE connection ─────────────────────────────────────────────
  useEffect(() => {
    const es = new EventSource(`${API_URL}/api/v1/stream`);
    sseRef.current = es;

    es.addEventListener("connected", () => setSseConnected(true));
    es.addEventListener("new_event", (e) => {
      // Invalidate external events query so the table auto-refreshes
      void qc.invalidateQueries(["external-events"]);
      void qc.invalidateQueries(["provider-health"]);
      setNewEventFlash(true);
      setTimeout(() => setNewEventFlash(false), 1500);
    });
    es.onerror = () => {
      setSseConnected(false);
      // EventSource auto-reconnects by default
    };

    return () => {
      es.close();
      setSseConnected(false);
    };
  }, [qc]);

  // ── External events query ──────────────────────────────────────
  const eventsQuery = useQuery(
    ["external-events", filterProvider, filterCategory],
    () => fetchExternalEvents({
      provider_id: filterProvider || undefined,
      category: filterCategory || undefined,
      limit: 200,
      since_hours: 48,
    }),
    { refetchInterval: 30_000 }
  );

  const statsQuery = useQuery(["external-event-stats"], fetchExternalEventStats, {
    refetchInterval: 60_000,
  });

  const events = eventsQuery.data?.events ?? [];
  const stats = statsQuery.data;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* ── Header ───────────────────────────────────────────────── */}
      <div className="shrink-0 space-y-3 border-b p-3 md:p-5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h1 className="heading text-xl md:text-2xl">Live Data Feed</h1>
            <p className="text-xs text-tx2">
              Real-time data from USGS, NASA FIRMS, and Open-Meteo.
              Exact ingestion delay shown for every report.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={cx(
                "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 font-mono text-[10px] uppercase transition-all",
                sseConnected
                  ? "border-low/40 text-low"
                  : "border-tx2/30 text-tx2",
                newEventFlash && "ring-1 ring-accent/50"
              )}
            >
              <span
                className={cx("h-2 w-2 rounded-full", sseConnected && "animate-pulse")}
                style={{ background: sseConnected ? "#27D99A" : "#8294AA" }}
              />
              {sseConnected ? "Live stream" : "Reconnecting…"}
            </span>
          </div>
        </div>

        {/* Stats strip */}
        {stats && (
          <div className="flex flex-wrap gap-3">
            {[
              { label: "Total events", value: stats.total_events },
              { label: "Last 24h", value: stats.last_24h },
              ...Object.entries(stats.by_provider).map(([pid, count]) => ({
                label: providerMeta(pid).abbrev, value: count,
              })),
            ].map((s, i) => (
              <div key={i} className="rounded-lg border bg-white/[0.02] px-3 py-1.5">
                <p className="label">{s.label}</p>
                <p className="font-mono text-sm font-semibold">{s.value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cx(
                "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                tab === t
                  ? "bg-accent/15 text-accent"
                  : "text-tx2 hover:text-tx hover:bg-white/5"
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* ── Content ─────────────────────────────────────────────── */}
      {tab === "Latency Monitor" ? (
        <div className="min-h-0 flex-1 overflow-y-auto p-3 md:p-5">
          <LatencyMonitor />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          {/* Table area */}
          <div className={cx(
            "flex min-h-0 flex-1 flex-col overflow-hidden transition-all duration-200",
            selectedId != null ? "hidden md:flex" : ""
          )}>
            {/* Filters */}
            <div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-4 py-2">
              <select
                className="input !py-1 !text-xs max-w-[160px]"
                value={filterProvider}
                onChange={(e) => setFilterProvider(e.target.value)}
              >
                {FILTER_PROVIDERS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
              </select>
              <select
                className="input !py-1 !text-xs max-w-[160px]"
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
              >
                {FILTER_CATEGORIES.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
              </select>
              <button
                className="btn !py-1 !text-xs"
                onClick={() => void eventsQuery.refetch()}
                disabled={eventsQuery.isFetching}
              >
                {eventsQuery.isFetching ? <Spinner /> : <RefreshCw size={11} />}
                Refresh
              </button>
              <span className="ml-auto font-mono text-[10px] text-tx2">
                {eventsQuery.data?.total ?? 0} total · showing {events.length}
              </span>
            </div>

            {/* Table */}
            <div className="min-h-0 flex-1 overflow-auto">
              {eventsQuery.isError ? (
                <div className="flex flex-col items-center gap-3 p-12 text-center">
                  <AlertCircle size={36} className="text-crit" />
                  <p className="text-sm text-crit">Failed to load live feed</p>
                  <p className="text-xs text-tx2">
                    Backend may be starting up. The ingestion scheduler runs automatically.
                  </p>
                </div>
              ) : eventsQuery.isLoading ? (
                <div className="flex items-center justify-center p-12">
                  <Spinner size={24} />
                </div>
              ) : events.length === 0 ? (
                <div className="flex flex-col items-center gap-3 p-12 text-center">
                  <Activity size={36} className="text-tx2/40" />
                  <p className="heading text-lg">No live data yet</p>
                  <p className="max-w-md text-xs text-tx2">
                    The ingestion scheduler runs automatically after backend startup.
                    USGS data arrives within ~60 seconds. NASA FIRMS requires a valid
                    <span className="font-mono"> NASA_FIRMS_API_KEY</span>. Open-Meteo is free and keyless.
                  </p>
                </div>
              ) : (
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="sticky top-0 bg-panel/95 backdrop-blur">
                    <tr className="border-b border-white/10 text-left">
                      <th className="px-4 py-2 font-mono text-[10px] uppercase tracking-wider text-tx2">Report</th>
                      <th className="px-4 py-2 font-mono text-[10px] uppercase tracking-wider text-tx2">Source</th>
                      <th className="px-4 py-2 font-mono text-[10px] uppercase tracking-wider text-tx2">Received</th>
                      <th className="px-4 py-2 font-mono text-[10px] uppercase tracking-wider text-tx2">Delay</th>
                      <th className="px-4 py-2 font-mono text-[10px] uppercase tracking-wider text-tx2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    <AnimatePresence initial={false}>
                      {events.map((ev) => (
                        <EventRow
                          key={ev.id}
                          ev={ev}
                          selected={ev.id === selectedId}
                          onSelect={() => setSelectedId(ev.id === selectedId ? null : ev.id)}
                        />
                      ))}
                    </AnimatePresence>
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Detail panel */}
          <AnimatePresence>
            {selectedId != null && (
              <motion.aside
                key="detail"
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: 420, opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="shrink-0 border-l bg-panel/90 overflow-hidden h-full flex flex-col"
                style={{ maxWidth: "100vw" }}
              >
                <EventDetailPanel
                  eventId={selectedId}
                  onClose={() => setSelectedId(null)}
                />
              </motion.aside>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
};
