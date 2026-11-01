import React from "react";
import { Ban, Server } from "lucide-react";
import { API_URL } from "../api";
import { useApp } from "../state/AppState";
import { fmtTime } from "../lib/format";
import { SectionTitle } from "../components/ui";

const GAPS = [
  "Authentication / operator roles — notes and status can be changed by anyone who can reach the API.",
  "GET /api/v1/incidents/{id} — single-incident fetch; the UI reads from the list endpoint.",
  "Deleting or clearing simulation incidents.",
  "Server-side search, category, duplicate and simulation filters (only status & priority exist, so those run client-side).",
  "Resource inventory, availability, assignment and dispatch tracking.",
  "WebSocket / push updates — the UI polls every 5 seconds instead.",
  "Resolved-time / audit history — only created_at and updated_at are stored.",
];

export const Settings: React.FC = () => {
  const { health, q, incidents, scope, setScope, notices, clearNotices } = useApp();
  const rows: Array<[string, React.ReactNode]> = [
    ["API base URL", <span className="font-mono">{API_URL}</span>],
    ["Backend health", health.online ? `Online (${health.latencyMs} ms)` : "Unreachable"],
    ["Incident polling", "Every 5 seconds"],
    ["Last sync", fmtTime(q.updatedAt)],
    ["Records loaded", incidents.length],
  ];
  return (
    <div className="space-y-4 p-3 md:p-5">
      <h1 className="heading text-xl md:text-2xl">Settings</h1>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="panel p-4">
          <SectionTitle icon={<Server size={15} />} title="Connection" sub="Set VITE_API_URL in frontend/.env to change the backend address." />
          <dl className="divide-y">
            {rows.map(([k, v]) => (
              <div key={k} className="flex items-center justify-between py-2.5 text-sm"><dt className="text-tx2">{k}</dt><dd>{v}</dd></div>
            ))}
          </dl>
        </section>
        <section className="panel p-4">
          <SectionTitle title="Data scope" sub="Applies to every dashboard, map and list." />
          <div className="flex gap-2">
            {(["all", "real", "sim"] as const).map((s) => (
              <button key={s} className={`btn ${scope === s ? "btn-primary" : ""}`} aria-pressed={scope === s} onClick={() => setScope(s)}>
                {s === "all" ? "Real + simulation" : s === "real" ? "Real only" : "Simulation only"}
              </button>
            ))}
          </div>
          <div className="mt-5 border-t pt-4">
            <p className="label mb-2">Alerts</p>
            <button className="btn" disabled={!notices.length} onClick={clearNotices}>Clear {notices.length} alert(s)</button>
          </div>
        </section>
      </div>
      <section className="panel p-4">
        <SectionTitle icon={<Ban size={15} />} title="Not available in the current backend" sub="Features the UI does not pretend to have — each would need a new backend endpoint." />
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-tx2">{GAPS.map((g) => <li key={g}>{g}</li>)}</ul>
      </section>
    </div>
  );
};
