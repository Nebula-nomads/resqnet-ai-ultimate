import axios from "axios";

export const API_URL: string =
  (import.meta as any).env?.VITE_API_URL ?? "http://127.0.0.1:8000";

export const api = axios.create({ baseURL: API_URL, timeout: 30000 });

export type IncidentStatus = "awaiting" | "in_progress" | "resolved";

/** Mirrors backend `IncidentOut`. */
export type Incident = {
  id: number;
  raw_report: string;
  category: string | null;
  description: string | null;
  location_name: string | null;
  latitude: number | null;
  longitude: number | null;
  people_affected: number | null;
  vulnerable_people: string[] | null;
  immediate_threats: string[] | null;
  required_resources: string[] | null;
  confidence: number | null;
  recommended_urgency: string | null;
  priority_score: number | null;
  priority_label: string | null;
  priority_explanation: string | null;
  status: string;
  notes: string | null;
  is_simulation: boolean;
  is_duplicate: boolean;
  duplicate_of: number | null;
  created_at: string;
  updated_at: string;
};

export type NewIncident = {
  raw_report: string;
  latitude: number | null;
  longitude: number | null;
  location_name: string | null;
};

export type IncidentPatch = Partial<
  Pick<Incident, "status" | "notes" | "priority_score" | "priority_label" | "priority_explanation">
>;

export type ResourceRecommendation = { category: string; resources: string[] };
export type Health = { status: string; latencyMs: number };

// ── Latency info attached to every external event ─────────────────────
export type LatencyInfo = {
  event_time_utc: string | null;
  source_published_at_utc: string | null;
  source_updated_at_utc: string | null;
  received_at_utc: string | null;
  analyzed_at_utc: string | null;
  displayed_at_utc: string | null;
  source_publication_delay_s: number | null;
  event_detection_delay_s: number | null;
  ai_processing_delay_s: number | null;
  frontend_delivery_delay_s: number | null;
  source_publication_delay_label: string;
  event_detection_delay_label: string | null;
  source_publication_delay_formatted: string | null;
  event_detection_delay_formatted: string | null;
  ai_processing_delay_formatted: string | null;
  latency_color: string | null;
};

// ── External event from a real data provider ─────────────────────────
export type ExternalEvent = {
  id: number;
  provider_id: "usgs" | "nasa_firms" | "open_meteo" | string;
  external_id: string;
  category: string | null;
  title: string | null;
  description: string | null;
  location_name: string | null;
  latitude: number | null;
  longitude: number | null;
  severity: string | null;
  verification_status: string | null;
  source_url: string | null;
  // USGS
  magnitude: number | null;
  magnitude_type: string | null;
  depth_km: number | null;
  alert_level: string | null;
  tsunami_flag: number | null;
  // FIRMS
  brightness_kelvin: number | null;
  fire_radiative_power_mw: number | null;
  confidence_label: string | null;
  satellite: string | null;
  instrument: string | null;
  day_night: string | null;
  source_dataset: string | null;
  // Weather
  temperature_c: number | null;
  relative_humidity_pct: number | null;
  precipitation_mm: number | null;
  wind_speed_kmh: number | null;
  wind_direction_deg: number | null;
  weather_code: number | null;
  weather_description: string | null;
  is_alert_candidate: boolean | null;
  threshold_breaches: string[] | null;
  // Timing
  latency: LatencyInfo | null;
  raw_metadata: Record<string, unknown> | null;
  created_at: string | null;
};

// ── Provider health ────────────────────────────────────────────────
export type ProviderHealth = {
  provider_id: string;
  provider_name: string | null;
  status: "ok" | "error" | "degraded" | "unknown";
  enabled: boolean;
  last_fetch_at: string | null;
  last_success_at: string | null;
  last_error_at: string | null;
  last_error_message: string | null;
  avg_ingestion_delay_s: number | null;
  latest_ingestion_delay_s: number | null;
  avg_fetch_duration_ms: number | null;
  latest_fetch_duration_ms: number | null;
  total_events_received: number | null;
  total_errors: number | null;
  updated_at: string | null;
};

export type ExternalEventsResponse = {
  total: number;
  offset: number;
  limit: number;
  events: ExternalEvent[];
};

export type ExternalEventStats = {
  total_events: number;
  last_24h: number;
  by_provider: Record<string, number>;
  by_category: Record<string, number>;
  by_severity: Record<string, number>;
};

// ─── Fetch functions ──────────────────────────────────────────────────────

export const fetchIncidents = async (): Promise<Incident[]> =>
  (await api.get<Incident[]>("/api/v1/incidents/")).data;

export const createIncident = async (body: NewIncident): Promise<Incident> =>
  (await api.post<Incident>("/api/v1/incidents/", body)).data;

export const updateIncident = async (id: number, patch: IncidentPatch): Promise<Incident> =>
  (await api.patch<Incident>(`/api/v1/incidents/${id}`, patch)).data;

export const triggerSimulation = async (scenario: string): Promise<Incident[]> =>
  (await api.post<Incident[]>("/api/v1/simulation/trigger", { scenario })).data;

export const fetchResources = async (category: string): Promise<ResourceRecommendation> =>
  (await api.get<ResourceRecommendation>(`/api/v1/resources/${encodeURIComponent(category)}`)).data;

export const fetchHealth = async (): Promise<Health> => {
  const t0 = performance.now();
  const r = await api.get<{ status: string }>("/health", { timeout: 4000 });
  return { status: r.data.status, latencyMs: Math.round(performance.now() - t0) };
};

// ── External event API ──────────────────────────────────────────────

export const fetchExternalEvents = async (params?: {
  provider_id?: string;
  category?: string;
  severity?: string;
  limit?: number;
  offset?: number;
  since_hours?: number;
}): Promise<ExternalEventsResponse> =>
  (await api.get<ExternalEventsResponse>("/api/v1/external-events/", { params })).data;

export const fetchExternalEvent = async (id: number): Promise<ExternalEvent> =>
  (await api.get<ExternalEvent>(`/api/v1/external-events/${id}`)).data;

export const fetchExternalEventStats = async (): Promise<ExternalEventStats> =>
  (await api.get<ExternalEventStats>("/api/v1/external-events/statistics")).data;

export const fetchProviderHealth = async (): Promise<ProviderHealth[]> =>
  (await api.get<ProviderHealth[]>("/api/v1/feeds/")).data;

export const fetchFeedsHealth = async () =>
  (await api.get("/api/v1/feeds/health")).data;

export const fetchProviderLatency = async (providerId: string) =>
  (await api.get(`/api/v1/feeds/${encodeURIComponent(providerId)}/latency`)).data;

export const triggerProviderSync = async (providerId: string) =>
  (await api.post(`/api/v1/feeds/${encodeURIComponent(providerId)}/sync`)).data;

export const fetchIngestionLatency = async (providerId?: string) =>
  (await api.get("/api/v1/analytics/ingestion-latency", { params: providerId ? { provider_id: providerId } : {} })).data;

export const fetchSystemIngestion = async () =>
  (await api.get("/api/v1/system/ingestion")).data;

/** Turn any thrown value into a human-readable, truthful error string. */
export const describeError = (e: unknown): string => {
  if (axios.isAxiosError(e)) {
    if (e.response) {
      const d = (e.response.data as any)?.detail;
      const detail = typeof d === "string" ? d : Array.isArray(d) ? d.map((x) => x?.msg ?? JSON.stringify(x)).join("; ") : "";
      return `HTTP ${e.response.status}${detail ? ` — ${detail}` : ` ${e.response.statusText || ""}`}`.trim();
    }
    if (e.code === "ECONNABORTED") return `Request timed out (${API_URL})`;
    return `Cannot reach backend at ${API_URL}`;
  }
  return e instanceof Error ? e.message : "Unknown error";
};
