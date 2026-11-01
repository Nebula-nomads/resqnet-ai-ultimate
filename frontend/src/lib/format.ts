import type { Incident } from "../api";

export type PriorityKey = "critical" | "high" | "medium" | "low" | "unknown";

export const priorityKey = (label?: string | null): PriorityKey => {
  const v = (label || "").toLowerCase();
  return v === "critical" || v === "high" || v === "medium" || v === "low" ? v : "unknown";
};
export const PRIORITY_HEX: Record<PriorityKey, string> = {
  critical: "#FF354B",
  high: "#FF8A32",
  medium: "#FFC247",
  low: "#27D99A",
  unknown: "#8294AA",
};
export const PRIORITY_RANK: Record<PriorityKey, number> = { critical: 4, high: 3, medium: 2, low: 1, unknown: 0 };
export const priorityColor = (label?: string | null) => PRIORITY_HEX[priorityKey(label)];

export const STATUS_ORDER = ["awaiting", "in_progress", "resolved"] as const;
export const STATUS_LABEL: Record<string, string> = {
  awaiting: "Awaiting",
  in_progress: "In Progress",
  resolved: "Resolved",
};
export const STATUS_HEX: Record<string, string> = {
  awaiting: "#FFC247",
  in_progress: "#00D9FF",
  resolved: "#27D99A",
};
export const statusLabel = (s: string) => STATUS_LABEL[s] ?? s.replace(/_/g, " ");
export const statusHex = (s: string) => STATUS_HEX[s] ?? "#8294AA";

export const cap = (s?: string | null) => (s ? s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ") : "Unclassified");

/** Backend emits naive UTC timestamps (datetime.utcnow().isoformat()) — treat them as UTC. */
export const parseUtc = (s?: string | null): Date | null => {
  if (!s) return null;
  const hasTz = /([zZ]|[+-]\d{2}:?\d{2})$/.test(s);
  const d = new Date(hasTz ? s : `${s}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
};

export const fmtDateTime = (s?: string | null): string => {
  const d = parseUtc(s);
  return d ? d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "medium" }) : "—";
};
export const fmtTime = (ms: number): string =>
  ms ? new Date(ms).toLocaleTimeString(undefined, { hour12: false }) : "—";

export const timeAgo = (s?: string | null): string => {
  const d = parseUtc(s);
  if (!d) return "—";
  const sec = Math.max(0, Math.round((Date.now() - d.getTime()) / 1000));
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
};

export type Mappable = Incident & { latitude: number; longitude: number };
export const hasCoords = (i: Incident): i is Mappable =>
  Number.isFinite(i.latitude) &&
  Number.isFinite(i.longitude) &&
  Math.abs(i.latitude as number) <= 90 &&
  Math.abs(i.longitude as number) <= 180;

export const isOpen = (i: Incident) => i.status !== "resolved";

export const incidentTitle = (i: Incident): string =>
  i.location_name || (i.description ? i.description.slice(0, 60) : `Incident #${i.id}`);

export type Stats = ReturnType<typeof computeStats>;

/** All dashboard numbers are derived from backend incident records — nothing hardcoded. */
export function computeStats(list: Incident[]) {
  const byPriority: Record<PriorityKey, number> = { critical: 0, high: 0, medium: 0, low: 0, unknown: 0 };
  const byCategory: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  const vulnerable: Record<string, number> = {};
  const peopleByCategory: Record<string, number> = {};
  let people = 0;
  let peopleReported = 0;
  let withVulnerable = 0;
  let sim = 0;
  let dup = 0;
  let mapped = 0;
  let criticalOpen = 0;

  for (const i of list) {
    const pk = priorityKey(i.priority_label);
    byPriority[pk]++;
    const cat = i.category || "unclassified";
    byCategory[cat] = (byCategory[cat] ?? 0) + 1;
    byStatus[i.status] = (byStatus[i.status] ?? 0) + 1;
    if (typeof i.people_affected === "number") {
      people += i.people_affected;
      peopleReported++;
      peopleByCategory[cat] = (peopleByCategory[cat] ?? 0) + i.people_affected;
    }
    if (i.vulnerable_people?.length) {
      withVulnerable++;
      for (const v of i.vulnerable_people) {
        const k = String(v).toLowerCase().trim();
        if (k) vulnerable[k] = (vulnerable[k] ?? 0) + 1;
      }
    }
    if (i.is_simulation) sim++;
    if (i.is_duplicate) dup++;
    if (hasCoords(i)) mapped++;
    if (pk === "critical" && isOpen(i)) criticalOpen++;
  }
  return {
    total: list.length,
    awaiting: byStatus["awaiting"] ?? 0,
    inProgress: byStatus["in_progress"] ?? 0,
    resolved: byStatus["resolved"] ?? 0,
    criticalOpen,
    byPriority,
    byCategory,
    byStatus,
    vulnerable,
    peopleByCategory,
    people,
    peopleReported,
    peopleUnreported: list.length - peopleReported,
    withVulnerable,
    sim,
    dup,
    mapped,
  };
}

export const sortByPriority = (a: Incident, b: Incident) =>
  (b.priority_score ?? -1) - (a.priority_score ?? -1) || b.id - a.id;
