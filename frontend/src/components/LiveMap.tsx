import React, { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import { MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { ChevronLeft, ChevronRight, Crosshair, MapPinOff } from "lucide-react";
import type { Incident } from "../api";
import { useApp } from "../state/AppState";
import {
  Mappable, PRIORITY_HEX, PRIORITY_RANK, PriorityKey, cap, fmtDateTime, hasCoords, incidentTitle,
  priorityKey, sortByPriority, timeAgo,
} from "../lib/format";
import { CategoryChip, DupBadge, EmptyState, PriorityBadge, SimBadge, StatusBadge, cx } from "./ui";

// ---------- marker icons (cached so Leaflet doesn't rebuild DOM on every 5 s poll) ----------
const iconCache = new Map<string, L.DivIcon>();
const pinIcon = (key: PriorityKey, sim: boolean, selected: boolean): L.DivIcon => {
  const id = `${key}|${sim}|${selected}`;
  let ic = iconCache.get(id);
  if (!ic) {
    ic = L.divIcon({
      className: "rq-marker",
      html: `<span class="rq-pin ${key === "critical" ? "rq-pin-crit" : ""} ${sim ? "rq-pin-sim" : ""} ${selected ? "rq-pin-sel" : ""}" style="--c:${PRIORITY_HEX[key]}"></span>`,
      iconSize: [22, 22], iconAnchor: [11, 11], popupAnchor: [0, -12],
    });
    iconCache.set(id, ic);
  }
  return ic;
};
const clusterIcon = (count: number, key: PriorityKey): L.DivIcon =>
  L.divIcon({
    className: "rq-marker",
    html: `<span class="rq-cluster" style="--c:${PRIORITY_HEX[key]}">${count}</span>`,
    iconSize: [38, 38], iconAnchor: [19, 19],
  });

// ---------- grid clustering in screen space (recomputed on zoom only) ----------
type Cluster = { lat: number; lng: number; members: Mappable[]; top: PriorityKey };
const CELL_PX = 56;

function buildClusters(points: Mappable[], map: L.Map): Cluster[] {
  const z = map.getZoom();
  const buckets = new Map<string, Mappable[]>();
  for (const p of points) {
    const px = map.project(L.latLng(p.latitude, p.longitude), z);
    const k = `${Math.floor(px.x / CELL_PX)}:${Math.floor(px.y / CELL_PX)}`;
    const arr = buckets.get(k);
    if (arr) arr.push(p); else buckets.set(k, [p]);
  }
  return [...buckets.values()].map((members) => {
    let top: PriorityKey = "unknown";
    for (const m of members) {
      const k = priorityKey(m.priority_label);
      if (PRIORITY_RANK[k] > PRIORITY_RANK[top]) top = k;
    }
    return {
      members, top,
      lat: members.reduce((s, m) => s + m.latitude, 0) / members.length,
      lng: members.reduce((s, m) => s + m.longitude, 0) / members.length,
    };
  });
}

// ---------- helpers living inside <MapContainer> ----------
const FitController: React.FC<{ points: Mappable[]; fitSignal: number }> = ({ points, fitSignal }) => {
  const map = useMap();
  // refit only when the *set* of mappable incidents changes (or user presses "Fit all"), not on every poll
  const key = points.map((p) => p.id).sort((a, b) => a - b).join(",");
  const first = useRef(true);
  useEffect(() => {
    if (!points.length) return;
    const ll = points.map((p) => [p.latitude, p.longitude] as [number, number]);
    const opts = { animate: !first.current, padding: [48, 48] as [number, number], maxZoom: 12 };
    if (ll.length === 1) map.setView(ll[0], 11, { animate: !first.current });
    else map.fitBounds(L.latLngBounds(ll), opts);
    first.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, fitSignal]);
  return null;
};

const FocusController: React.FC<{ target: { lat: number; lng: number; n: number } | null }> = ({ target }) => {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo([target.lat, target.lng], Math.max(map.getZoom(), 10), { duration: 0.8 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.n]);
  return null;
};

const ResizeWatcher: React.FC = () => {
  const map = useMap();
  useEffect(() => {
    const el = map.getContainer();
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(el);
    return () => ro.disconnect();
  }, [map]);
  return null;
};

const IncidentPopup: React.FC<{ inc: Incident; onOpen: () => void }> = ({ inc, onOpen }) => (
  <div className="space-y-2 text-tx">
    <div className="flex flex-wrap items-center gap-1.5">
      <PriorityBadge label={inc.priority_label} score={inc.priority_score} />
      {inc.is_simulation && <SimBadge />}
      {inc.is_duplicate && <DupBadge of={inc.duplicate_of} />}
    </div>
    <p className="heading text-sm leading-snug">{inc.location_name ?? "Unnamed location"}</p>
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
      <dt className="text-tx2">Category</dt><dd>{cap(inc.category)}</dd>
      <dt className="text-tx2">Status</dt><dd><StatusBadge status={inc.status} /></dd>
      <dt className="text-tx2">People</dt><dd className="font-mono">{inc.people_affected ?? "not reported"}</dd>
      <dt className="text-tx2">Created</dt><dd>{fmtDateTime(inc.created_at)}</dd>
    </dl>
    <button className="btn btn-primary w-full" onClick={onOpen}>Open intelligence · #{inc.id}</button>
  </div>
);

const MarkerLayer: React.FC<{
  points: Mappable[]; focusedId: number | null; onFocus: (id: number) => void; onOpen: (id: number) => void;
}> = ({ points, focusedId, onFocus, onOpen }) => {
  const map = useMap();
  const [zoom, setZoom] = useState(map.getZoom());
  const [group, setGroup] = useState<Cluster | null>(null);
  useMapEvents({ zoomend: () => setZoom(map.getZoom()), click: () => setGroup(null) });

  const clusters = useMemo(() => buildClusters(points, map), [points, map, zoom]); // eslint-disable-line react-hooks/exhaustive-deps

  const expand = (c: Cluster) => {
    const b = L.latLngBounds(c.members.map((m) => [m.latitude, m.longitude] as [number, number]));
    const degenerate = b.getSouthWest().equals(b.getNorthEast());
    if (degenerate || map.getZoom() >= 16) setGroup(c);
    else map.fitBounds(b, { padding: [60, 60], maxZoom: 17 });
  };

  return (
    <>
      {clusters.map((c) =>
        c.members.length === 1 ? (
          <Marker
            key={`i${c.members[0].id}`}
            position={[c.members[0].latitude, c.members[0].longitude]}
            icon={pinIcon(priorityKey(c.members[0].priority_label), c.members[0].is_simulation, c.members[0].id === focusedId)}
            eventHandlers={{ click: () => onFocus(c.members[0].id) }}
            keyboard
            title={`Incident #${c.members[0].id}`}
          >
            <Popup><IncidentPopup inc={c.members[0]} onOpen={() => onOpen(c.members[0].id)} /></Popup>
          </Marker>
        ) : (
          <Marker
            key={`c${c.members.map((m) => m.id).join("-")}`}
            position={[c.lat, c.lng]}
            icon={clusterIcon(c.members.length, c.top)}
            eventHandlers={{ click: () => expand(c) }}
            keyboard
            title={`${c.members.length} incidents`}
          />
        )
      )}
      {group && (
        <Popup position={[group.lat, group.lng]} eventHandlers={{ remove: () => setGroup(null) }}>
          <div className="space-y-2">
            <p className="label">{group.members.length} incidents at this location</p>
            <ul className="max-h-48 space-y-1 overflow-y-auto">
              {[...group.members].sort(sortByPriority).map((m) => (
                <li key={m.id}>
                  <button className="flex w-full items-center gap-2 rounded px-1 py-1 text-left text-xs hover:bg-white/5" onClick={() => onOpen(m.id)}>
                    <PriorityBadge label={m.priority_label} score={m.priority_score} />
                    <span className="truncate">#{m.id} {incidentTitle(m)}</span>
                    {m.is_simulation && <SimBadge />}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </Popup>
      )}
    </>
  );
};

// ---------- public component ----------
const FILTERS: Array<{ id: "all" | PriorityKey; label: string }> = [
  { id: "all", label: "All" }, { id: "critical", label: "Critical" }, { id: "high", label: "High" },
  { id: "medium", label: "Medium" }, { id: "low", label: "Low" },
];

export const LiveMap: React.FC<{
  incidents: Incident[]; className?: string; defaultPanelOpen?: boolean;
}> = ({ incidents, className, defaultPanelOpen = true }) => {
  const { openIncident } = useApp();
  const [panelOpen, setPanelOpen] = useState(defaultPanelOpen);
  const [filter, setFilter] = useState<"all" | PriorityKey>("all");
  const [focusedId, setFocusedId] = useState<number | null>(null);
  const [fitSignal, setFitSignal] = useState(0);
  const [flyTo, setFlyTo] = useState<{ lat: number; lng: number; n: number } | null>(null);

  const feed = useMemo(
    () => [...incidents].filter((i) => filter === "all" || priorityKey(i.priority_label) === filter).sort(sortByPriority),
    [incidents, filter]
  );
  // Only incidents with valid coordinates ever reach Leaflet.
  const points = useMemo(() => feed.filter(hasCoords), [feed]);
  const unmapped = feed.length - points.length;

  const selectFromFeed = (i: Incident) => {
    setFocusedId(i.id);
    if (hasCoords(i)) setFlyTo({ lat: i.latitude, lng: i.longitude, n: Date.now() });
    else openIncident(i.id);
  };

  return (
    <div className={cx("panel relative flex min-h-[420px] flex-col overflow-hidden lg:flex-row", className)}>
      <div className="relative min-h-[360px] flex-1 rq-dark-tiles">
        <MapContainer center={[20, 30]} zoom={2} minZoom={2} worldCopyJump style={{ height: "100%", width: "100%" }}>
          <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <ResizeWatcher />
          <FitController points={points} fitSignal={fitSignal} />
          <FocusController target={flyTo} />
          <MarkerLayer points={points} focusedId={focusedId} onFocus={setFocusedId} onOpen={openIncident} />
        </MapContainer>

        {/* HUD overlays */}
        <div className="pointer-events-none absolute inset-0 z-[400] bg-grid opacity-40" />
        <div className="pointer-events-none absolute left-3 top-3 z-[1000] flex flex-col gap-2">
          <div className="pointer-events-auto rounded-lg border bg-base/80 px-3 py-2 backdrop-blur">
            <p className="label">Live geo-intelligence</p>
            <p className="font-mono text-xs text-tx">
              {points.length} plotted
              {unmapped > 0 && <span className="text-med"> · {unmapped} without coordinates</span>}
            </p>
          </div>
          <button className="btn pointer-events-auto bg-base/80 backdrop-blur" onClick={() => setFitSignal((n) => n + 1)}>
            <Crosshair size={13} /> Fit all
          </button>
        </div>
        <div className="pointer-events-none absolute bottom-6 left-3 z-[1000] rounded-lg border bg-base/80 px-3 py-2 backdrop-blur">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {(["critical", "high", "medium", "low"] as PriorityKey[]).map((k) => (
              <span key={k} className="flex items-center gap-1.5 font-mono text-[10px] uppercase text-tx2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: PRIORITY_HEX[k], boxShadow: `0 0 8px ${PRIORITY_HEX[k]}` }} />
                {k}
              </span>
            ))}
            <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase text-tx2">
              <span className="h-2.5 w-2.5 rounded-full border border-dashed border-tx bg-tx2/40" /> sim
            </span>
          </div>
        </div>
        <button
          onClick={() => setPanelOpen((v) => !v)}
          aria-expanded={panelOpen}
          aria-label={panelOpen ? "Collapse incident panel" : "Expand incident panel"}
          className="absolute right-3 top-3 z-[1000] hidden h-8 w-8 items-center justify-center rounded-lg border bg-base/80 text-tx backdrop-blur hover:text-accent lg:flex"
        >
          {panelOpen ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      {panelOpen && (
        <aside className="flex max-h-[360px] w-full shrink-0 flex-col border-t bg-panel/80 lg:max-h-none lg:w-80 lg:border-l lg:border-t-0" aria-label="Incident information panel">
          <div className="border-b p-3">
            <div className="flex items-center justify-between">
              <h3 className="heading text-sm uppercase tracking-wider">Incident feed</h3>
              <span className="font-mono text-xs text-tx2">{feed.length}</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1" role="tablist" aria-label="Filter by priority">
              {FILTERS.map((f) => (
                <button
                  key={f.id} role="tab" aria-selected={filter === f.id} onClick={() => setFilter(f.id)}
                  className={cx(
                    "rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase",
                    filter === f.id ? "border-accent/60 bg-accent/15 text-accent" : "text-tx2 hover:text-tx"
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {feed.length === 0 ? (
              <EmptyState title="No incidents in view" hint="Submit a report or trigger a simulation to populate the map." />
            ) : (
              <ul>
                {feed.map((i) => {
                  const mapped = hasCoords(i);
                  return (
                    <li key={i.id} className="border-b last:border-b-0">
                      <div className={cx("flex items-start gap-2 p-3 hover:bg-white/[0.03]", focusedId === i.id && "bg-accent/[0.07]")}>
                        <button onClick={() => selectFromFeed(i)} className="min-w-0 flex-1 text-left">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <PriorityBadge label={i.priority_label} score={i.priority_score} />
                            {i.is_simulation && <SimBadge />}
                          </div>
                          <p className="mt-1 truncate text-sm font-medium">{incidentTitle(i)}</p>
                          <p className="mt-0.5 flex items-center gap-2 text-[11px] text-tx2">
                            <CategoryChip category={i.category} />
                            <span>{timeAgo(i.created_at)}</span>
                            {!mapped && <span className="flex items-center gap-1 text-med"><MapPinOff size={11} />no coords</span>}
                          </p>
                        </button>
                        <button className="btn !px-2 !py-1" onClick={() => openIncident(i.id)} aria-label={`Open incident ${i.id}`}>#{i.id}</button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </aside>
      )}
    </div>
  );
};
