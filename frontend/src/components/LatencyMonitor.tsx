/**
 * RESQNET AI — Live Data Latency Monitor
 * Displays per-provider connection status, event counts, and ingestion delay metrics.
 */

import React, { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Activity, AlertCircle, CheckCircle2, Clock, Database, RefreshCw,
  Satellite, Thermometer, Waves, Zap
} from "lucide-react";
import {
  fetchProviderHealth, fetchIngestionLatency, triggerProviderSync,
  ProviderHealth, API_URL
} from "../api";
import { LatencyBadge } from "./LatencyBadge";
import { Spinner } from "./ui";
import { fmtDateTime, timeAgo } from "../lib/format";

// ── Recharts for timeline ────────────────────────────────────────────
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from "recharts";

const PROVIDER_ICONS: Record<string, React.ReactNode> = {
  usgs: <Waves size={16} />,
  nasa_firms: <Satellite size={16} />,
  open_meteo: <Thermometer size={16} />,
};

const PROVIDER_COLORS: Record<string, string> = {
  usgs: "#FF8A32",
  nasa_firms: "#FF354B",
  open_meteo: "#00D9FF",
};

const PROVIDER_LABELS: Record<string, string> = {
  usgs: "USGS Earthquakes",
  nasa_firms: "NASA FIRMS",
  open_meteo: "Open-Meteo",
};

const StatusDot: React.FC<{ status: string }> = ({ status }) => {
  const color =
    status === "ok" ? "#27D99A" :
    status === "error" ? "#FF354B" :
    status === "degraded" ? "#FFC247" :
    "#8294AA";
  return (
    <span
      className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider"
      style={{ color }}
    >
      <span
        className="h-2 w-2 rounded-full"
        style={{ background: color, boxShadow: `0 0 6px ${color}` }}
      />
      {status === "ok" ? "Connected" : status === "error" ? "Error" : status === "degraded" ? "Degraded" : "Unknown"}
    </span>
  );
};

const ProviderCard: React.FC<{ provider: ProviderHealth; onSync: () => void; syncing: boolean }> = ({
  provider, onSync, syncing
}) => {
  const pid = provider.provider_id;
  const color = PROVIDER_COLORS[pid] ?? "#8294AA";
  const icon = PROVIDER_ICONS[pid] ?? <Database size={16} />;

  const detectionDelaySec = provider.latest_ingestion_delay_s;
  const avgDelaySec = provider.avg_ingestion_delay_s;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border bg-white/[0.02] p-4 space-y-3"
      style={{ borderColor: `${color}30` }}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span style={{ color }}>{icon}</span>
          <div>
            <p className="text-sm font-semibold">{PROVIDER_LABELS[pid] ?? pid}</p>
            <p className="font-mono text-[10px] text-tx2">{provider.provider_name ?? pid}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusDot status={provider.status} />
          <button
            className="btn !px-2 !py-1 !text-[10px]"
            onClick={onSync}
            disabled={syncing}
            title="Trigger immediate sync"
          >
            {syncing ? <Spinner /> : <RefreshCw size={11} />}
          </button>
        </div>
      </div>

      {/* Error message if any */}
      {provider.last_error_message && (
        <div className="flex items-start gap-1.5 rounded-lg border border-crit/30 bg-crit/10 p-2">
          <AlertCircle size={12} className="mt-0.5 shrink-0 text-crit" />
          <p className="font-mono text-[10px] text-crit leading-relaxed">{provider.last_error_message}</p>
        </div>
      )}

      {/* Metrics grid */}
      <dl className="grid grid-cols-2 gap-2">
        <div>
          <dt className="label">Last successful fetch</dt>
          <dd className="mt-0.5 font-mono text-xs">
            {provider.last_success_at ? timeAgo(provider.last_success_at) : <span className="text-tx2">Never</span>}
          </dd>
        </div>
        <div>
          <dt className="label">Latest delay</dt>
          <dd className="mt-0.5">
            <LatencyBadge
              latency={detectionDelaySec != null ? {
                event_detection_delay_s: detectionDelaySec,
                source_published_at_utc: "placeholder",
                source_publication_delay_s: null,
                event_time_utc: null, received_at_utc: null,
                analyzed_at_utc: null, displayed_at_utc: null,
                ai_processing_delay_s: null, frontend_delivery_delay_s: null,
                source_publication_delay_label: "", event_detection_delay_label: null,
                source_publication_delay_formatted: null, event_detection_delay_formatted: null,
                ai_processing_delay_formatted: null, latency_color: null,
              } : null}
              size="sm"
              showLabel
            />
          </dd>
        </div>
        <div>
          <dt className="label">Avg fetch duration</dt>
          <dd className="font-mono text-xs mt-0.5">
            {provider.avg_fetch_duration_ms != null
              ? `${Math.round(provider.avg_fetch_duration_ms)} ms`
              : <span className="text-tx2">—</span>}
          </dd>
        </div>
        <div>
          <dt className="label">Avg ingestion delay</dt>
          <dd className="font-mono text-xs mt-0.5">
            {avgDelaySec != null
              ? (avgDelaySec < 60 ? `${Math.round(avgDelaySec)}s` : `${Math.round(avgDelaySec / 60)}m`)
              : <span className="text-tx2">—</span>}
          </dd>
        </div>
        <div>
          <dt className="label">Total events ingested</dt>
          <dd className="font-mono text-xs mt-0.5">{provider.total_events_received ?? 0}</dd>
        </div>
        <div>
          <dt className="label">Total errors</dt>
          <dd className={`font-mono text-xs mt-0.5 ${(provider.total_errors ?? 0) > 0 ? "text-crit" : "text-tx2"}`}>
            {provider.total_errors ?? 0}
          </dd>
        </div>
      </dl>

      {/* Last fetch timestamp */}
      {provider.last_fetch_at && (
        <p className="font-mono text-[10px] text-tx2">
          Last fetch: {fmtDateTime(provider.last_fetch_at)}
        </p>
      )}
    </motion.div>
  );
};

// ── Latency Timeline Chart ────────────────────────────────────────────

type ChartPoint = { time: string; usgs?: number; nasa_firms?: number; open_meteo?: number };

const LatencyTimeline: React.FC<{ data: Record<string, Array<{ measured_at: string; ingestion_delay_s: number | null }>> }> = ({ data }) => {
  // Merge all timestamps from all providers
  const allTimes = new Set<string>();
  for (const pid of Object.keys(data)) {
    for (const row of data[pid]) {
      allTimes.add(row.measured_at);
    }
  }
  const sorted = [...allTimes].sort();
  const recent = sorted.slice(-60); // last 60 data points

  const chartData: ChartPoint[] = recent.map((t) => {
    const pt: ChartPoint = {
      time: new Date(t + "Z").toLocaleTimeString(undefined, { hour12: false, hour: "2-digit", minute: "2-digit" }),
    };
    for (const pid of ["usgs", "nasa_firms", "open_meteo"] as const) {
      const row = (data[pid] ?? []).find((r) => r.measured_at === t);
      if (row?.ingestion_delay_s != null) {
        pt[pid] = parseFloat((row.ingestion_delay_s / 60).toFixed(2)); // convert to minutes
      }
    }
    return pt;
  });

  if (chartData.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-xs text-tx2">
        No latency history yet — data will appear after the first successful ingestion.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={180}>
      <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
        <XAxis dataKey="time" tick={{ fontSize: 10, fill: "#7da0be" }} tickLine={false} />
        <YAxis
          tick={{ fontSize: 10, fill: "#7da0be" }}
          tickLine={false}
          axisLine={false}
          unit=" min"
          width={52}
        />
        <Tooltip
          contentStyle={{ background: "#0b1929", border: "1px solid rgba(0,217,255,0.2)", borderRadius: 8 }}
          labelStyle={{ color: "#EAF3FF", fontSize: 11 }}
          itemStyle={{ fontSize: 11 }}
          formatter={(v: number) => [`${v} min`, undefined]}
        />
        <Legend wrapperStyle={{ fontSize: 10 }} />
        <Line type="monotone" dataKey="usgs" stroke={PROVIDER_COLORS.usgs} dot={false} name="USGS" strokeWidth={1.5} connectNulls />
        <Line type="monotone" dataKey="nasa_firms" stroke={PROVIDER_COLORS.nasa_firms} dot={false} name="NASA FIRMS" strokeWidth={1.5} connectNulls />
        <Line type="monotone" dataKey="open_meteo" stroke={PROVIDER_COLORS.open_meteo} dot={false} name="Open-Meteo" strokeWidth={1.5} connectNulls />
      </LineChart>
    </ResponsiveContainer>
  );
};

// ── Main Component ─────────────────────────────────────────────────

export const LatencyMonitor: React.FC = () => {
  const [syncingMap, setSyncingMap] = useState<Record<string, boolean>>({});

  const healthQuery = useQuery(["provider-health"], fetchProviderHealth, {
    refetchInterval: 15_000,
    retry: false,
  });

  const latencyQuery = useQuery(["ingestion-latency"], fetchIngestionLatency, {
    refetchInterval: 30_000,
    retry: false,
  });

  const handleSync = async (providerId: string) => {
    setSyncingMap((m) => ({ ...m, [providerId]: true }));
    try {
      await triggerProviderSync(providerId);
      void healthQuery.refetch();
    } catch (e) {
      console.error("Sync failed:", e);
    } finally {
      setSyncingMap((m) => ({ ...m, [providerId]: false }));
    }
  };

  const providers = healthQuery.data ?? [];
  const latencyData = latencyQuery.data ?? {};

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="heading text-lg">Live Data Latency Monitor</h2>
          <p className="text-xs text-tx2">
            Real connection status and ingestion delay for all three providers.
            Data is fetched from <span className="font-mono">{API_URL}</span>.
          </p>
        </div>
        <button
          className="btn"
          onClick={() => { void healthQuery.refetch(); void latencyQuery.refetch(); }}
          disabled={healthQuery.isFetching}
        >
          {healthQuery.isFetching ? <Spinner /> : <RefreshCw size={13} />}
          Refresh
        </button>
      </div>

      {healthQuery.isError && (
        <div className="rounded-xl border border-crit/30 bg-crit/10 p-4 text-sm text-crit">
          <AlertCircle size={14} className="mr-2 inline" />
          Failed to load provider health — backend may be unreachable.
        </div>
      )}

      {healthQuery.isLoading ? (
        <div className="grid gap-4 md:grid-cols-3">
          {[0, 1, 2].map((n) => (
            <div key={n} className="h-56 animate-pulse rounded-xl border bg-white/[0.02]" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {/* Ensure we always show all 3 providers even if no health record yet */}
          {(["usgs", "nasa_firms", "open_meteo"] as const).map((pid) => {
            const ph = providers.find((p) => p.provider_id === pid) ?? {
              provider_id: pid,
              provider_name: PROVIDER_LABELS[pid],
              status: "unknown" as const,
              enabled: true,
              last_fetch_at: null,
              last_success_at: null,
              last_error_at: null,
              last_error_message: null,
              avg_ingestion_delay_s: null,
              latest_ingestion_delay_s: null,
              avg_fetch_duration_ms: null,
              latest_fetch_duration_ms: null,
              total_events_received: null,
              total_errors: null,
              updated_at: null,
            };
            return (
              <ProviderCard
                key={pid}
                provider={ph}
                onSync={() => handleSync(pid)}
                syncing={syncingMap[pid] ?? false}
              />
            );
          })}
        </div>
      )}

      {/* Latency Timeline */}
      <section className="rounded-xl border bg-white/[0.02] p-4">
        <h3 className="label mb-3 flex items-center gap-2">
          <Activity size={13} className="text-accent" />
          Ingestion Latency Timeline (minutes, last 60 measurements)
        </h3>
        {latencyQuery.isLoading ? (
          <div className="h-44 animate-pulse rounded-lg bg-white/[0.02]" />
        ) : (
          <LatencyTimeline data={latencyData} />
        )}
        <p className="mt-2 font-mono text-[10px] text-tx2">
          Ingestion delay = time between event occurrence and RESQNET receipt.
          Open-Meteo forecasts are labelled separately from disaster events.
        </p>
      </section>
    </div>
  );
};
