import React, { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle, ArrowUpRight, BrainCircuit, CopyCheck, LocateFixed, MapPin, RotateCcw, Send, ShieldAlert, UserRound,
} from "lucide-react";
import { API_URL, createIncident, describeError, Incident, NewIncident } from "../api";
import { useApp } from "../state/AppState";
import { cap, hasCoords } from "../lib/format";
import { PriorityGauge } from "../components/PriorityGauge";
import { ResourceIcon } from "../components/ResourceIcon";
import { ConfidenceBar, DupBadge, SimBadge, Spinner, cx } from "../components/ui";

const num = (v: string): number | null => {
  const n = parseFloat(v);
  return v.trim() !== "" && Number.isFinite(n) ? n : null;
};

// ---- processing animation: indeterminate — it never claims a stage the backend hasn't reported ----
const Processing: React.FC = () => {
  const [ms, setMs] = useState(0);
  useEffect(() => {
    const t0 = performance.now();
    const id = window.setInterval(() => setMs(performance.now() - t0), 100);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 p-8 text-center" role="status" aria-live="polite">
      <div className="relative h-44 w-44">
        <div className="absolute inset-0 rounded-full border border-accent/30" />
        <div className="absolute inset-5 rounded-full border border-dashed border-accent/25" />
        <div className="absolute inset-10 rounded-full border border-accent/30" />
        <div className="absolute inset-0 animate-sweep rounded-full" style={{ background: "conic-gradient(from 0deg, rgba(0,217,255,0) 0deg, rgba(0,217,255,.35) 60deg, rgba(0,217,255,0) 62deg)" }} />
        <BrainCircuit size={34} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-accent" />
        <span className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 animate-ping2 rounded-full bg-accent/60" />
      </div>
      <div>
        <p className="heading text-lg">AI analysis in progress</p>
        <p className="mt-1 font-mono text-xs text-tx2">POST /api/v1/incidents/ · awaiting backend response</p>
        <p className="mt-3 font-mono text-2xl text-accent">{(ms / 1000).toFixed(1)}s</p>
      </div>
    </div>
  );
};

const Item: React.FC<{ icon: React.ReactNode; title: string; children: React.ReactNode }> = ({ icon, title, children }) => (
  <div className="rounded-xl border bg-white/[0.02] p-3">
    <p className="label mb-2 flex items-center gap-1.5"><span className="text-accent">{icon}</span>{title}</p>
    {children}
  </div>
);
const Tags: React.FC<{ items: string[] | null; tone: string }> = ({ items, tone }) =>
  items && items.length ? (
    <div className="flex flex-wrap gap-1.5">{items.map((t, n) => <span key={`${t}${n}`} className="rounded-md border px-2 py-0.5 text-xs" style={{ borderColor: `${tone}55`, background: `${tone}14` }}>{cap(t)}</span>)}</div>
  ) : <p className="text-xs text-tx2">None extracted.</p>;

const AnalysisResult: React.FC<{ inc: Incident; onReset: () => void }> = ({ inc, onReset }) => {
  const { openIncident } = useApp();
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3 p-4 md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="label !text-low">Analysis complete</span>
          <span className="font-mono text-sm text-accent">Incident #{inc.id}</span>
          {inc.is_simulation && <SimBadge />}
        </div>
        <div className="flex gap-2">
          <button className="btn" onClick={onReset}><RotateCcw size={13} /> New report</button>
          <button className="btn btn-primary" onClick={() => openIncident(inc.id)}>Full intelligence <ArrowUpRight size={13} /></button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-[auto_1fr]">
        <div className="flex flex-col items-center rounded-xl border bg-white/[0.02] p-4">
          <PriorityGauge score={inc.priority_score} label={inc.priority_label} />
        </div>
        <div className="space-y-3">
          <Item icon={<BrainCircuit size={13} />} title="Detected category">
            <p className="heading text-xl">{cap(inc.category)}</p>
            <p className="mt-1 text-xs text-tx2">{inc.description ?? "No description returned."}</p>
          </Item>
          <Item icon={<BrainCircuit size={13} />} title="Confidence score"><ConfidenceBar value={inc.confidence} /></Item>
        </div>
      </div>

      <p className="rounded-lg border bg-base/50 p-3 font-mono text-[11px] leading-relaxed text-tx2">
        <span className="text-tx">Priority explanation · </span>{inc.priority_explanation ?? "—"}
      </p>

      <div className="grid gap-3 md:grid-cols-3">
        <Item icon={<UserRound size={13} />} title="People affected">
          <p className="font-mono text-2xl">{inc.people_affected ?? <span className="font-sans text-sm text-tx2">Not determined</span>}</p>
        </Item>
        <Item icon={<UserRound size={13} />} title="Vulnerable populations"><Tags items={inc.vulnerable_people} tone="#FF8A32" /></Item>
        <Item icon={<ShieldAlert size={13} />} title="Immediate threats"><Tags items={inc.immediate_threats} tone="#FF354B" /></Item>
      </div>

      <Item icon={<ShieldAlert size={13} />} title="Required resources">
        {inc.required_resources && inc.required_resources.length ? (
          <ul className="grid grid-cols-2 gap-2 md:grid-cols-3">
            {inc.required_resources.map((r, n) => (
              <li key={`${r}${n}`} className="flex items-center gap-2 rounded-lg border bg-white/[0.02] px-3 py-2 text-xs"><ResourceIcon name={r} className="text-accent" />{r}</li>
            ))}
          </ul>
        ) : <p className="text-xs text-tx2">The analysis returned no required resources.</p>}
      </Item>

      <div className="grid gap-3 md:grid-cols-2">
        <Item icon={<CopyCheck size={13} />} title="Duplicate detection">
          {inc.is_duplicate ? (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <DupBadge of={inc.duplicate_of} />
              {inc.duplicate_of != null && <button className="btn !py-1" onClick={() => openIncident(inc.duplicate_of!)}>View original</button>}
            </div>
          ) : <p className="text-xs text-low">No duplicate detected by backend.</p>}
        </Item>
        <Item icon={<MapPin size={13} />} title="Location">
          <p className="text-sm">{inc.location_name ?? <span className="text-tx2">No location name</span>}</p>
          <p className="mt-0.5 font-mono text-xs text-tx2">
            {hasCoords(inc) ? `${inc.latitude.toFixed(5)}, ${inc.longitude.toFixed(5)}` : "No coordinates — will not appear on the map"}
          </p>
        </Item>
      </div>
    </motion.div>
  );
};

export const Reports: React.FC = () => {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");
  const [place, setPlace] = useState("");
  const [geoBusy, setGeoBusy] = useState(false);
  const [geoErr, setGeoErr] = useState<string | null>(null);
  const lastBody = useRef<NewIncident | null>(null);

  const m = useMutation(createIncident, {
    onSuccess: (inc) => {
      qc.setQueryData<Incident[]>(["incidents"], (old) => (old && !old.some((x) => x.id === inc.id) ? [...old, inc] : old));
      qc.invalidateQueries(["incidents"]);
    },
  });

  const latN = num(lat), lonN = num(lon);
  const coordErr =
    (lat.trim() !== "" && latN === null) || (lon.trim() !== "" && lonN === null) ? "Latitude and longitude must be numbers."
    : latN !== null && Math.abs(latN) > 90 ? "Latitude must be between −90 and 90."
    : lonN !== null && Math.abs(lonN) > 180 ? "Longitude must be between −180 and 180."
    : (latN === null) !== (lonN === null) ? "Provide both latitude and longitude, or leave both empty."
    : null;
  const canSubmit = text.trim().length > 0 && !coordErr && !m.isLoading;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    const body: NewIncident = { raw_report: text.trim(), latitude: latN, longitude: lonN, location_name: place.trim() || null };
    lastBody.current = body;
    m.mutate(body);
  };

  const geolocate = () => {
    setGeoErr(null);
    if (!navigator.geolocation) { setGeoErr("Geolocation is not supported by this browser."); return; }
    setGeoBusy(true);
    navigator.geolocation.getCurrentPosition(
      (p) => { setLat(p.coords.latitude.toFixed(6)); setLon(p.coords.longitude.toFixed(6)); setGeoBusy(false); },
      (err) => { setGeoErr(err.message || "Could not read your position."); setGeoBusy(false); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const reset = () => { m.reset(); setText(""); setLat(""); setLon(""); setPlace(""); };

  return (
    <div className="space-y-4 p-3 md:p-5">
      <div>
        <h1 className="heading text-xl md:text-2xl">AI Incident Reporting</h1>
        <p className="text-xs text-tx2">Free-text reports are analysed by the backend (Gemini if configured, otherwise its rule-based parser). Results below are exactly what the API returns.</p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(340px,5fr)_7fr]">
        <form onSubmit={submit} className="panel space-y-3 p-4" data-testid="report-form">
          <label className="label block" htmlFor="rep-text">Incident description</label>
          <textarea id="rep-text" required rows={9} className="input resize-y" value={text} onChange={(e) => setText(e.target.value)}
            placeholder="Describe what is happening: what, where, how many people, who is vulnerable, immediate dangers…" />
          <div>
            <label className="label mb-1 block" htmlFor="rep-place">Location name</label>
            <input id="rep-place" className="input" placeholder="e.g. Riverside Community Centre" value={place} onChange={(e) => setPlace(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label mb-1 block" htmlFor="rep-lat">Latitude</label>
              <input id="rep-lat" inputMode="decimal" className="input font-mono" placeholder="30.9010" value={lat} onChange={(e) => setLat(e.target.value)} />
            </div>
            <div>
              <label className="label mb-1 block" htmlFor="rep-lon">Longitude</label>
              <input id="rep-lon" inputMode="decimal" className="input font-mono" placeholder="75.8573" value={lon} onChange={(e) => setLon(e.target.value)} />
            </div>
          </div>
          <button type="button" className="btn" onClick={geolocate} disabled={geoBusy}>
            {geoBusy ? <Spinner /> : <LocateFixed size={14} />} Use my current location
          </button>
          {(coordErr || geoErr) && <p role="alert" className="text-xs text-med">{coordErr ?? geoErr}</p>}
          <button type="submit" disabled={!canSubmit} className="btn btn-primary w-full !py-2.5 text-sm">
            {m.isLoading ? <Spinner /> : <Send size={15} />} {m.isLoading ? "Analysing…" : "Submit incident for AI analysis"}
          </button>
        </form>

        <section className="panel relative min-h-[420px] overflow-hidden" aria-label="Analysis result">
          <div className="pointer-events-none absolute inset-0 bg-grid opacity-40" />
          <div className="pointer-events-none absolute inset-x-0 top-0 h-16 animate-scan bg-gradient-to-b from-accent/10 to-transparent" />
          <div className="relative h-full">
            <AnimatePresence mode="wait">
              {m.isLoading ? (
                <motion.div key="load" className="h-full" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><Processing /></motion.div>
              ) : m.isError ? (
                <motion.div key="err" className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} role="alert">
                  <AlertTriangle size={36} className="text-crit" />
                  <p className="heading text-lg text-crit">Analysis failed</p>
                  <p className="max-w-md font-mono text-xs text-tx2">{describeError(m.error)}</p>
                  <p className="text-xs text-tx2">The report was not stored as analysed. No result has been fabricated.</p>
                  <button className="btn btn-primary" onClick={() => lastBody.current && m.mutate(lastBody.current)}><RotateCcw size={13} /> Retry submission</button>
                </motion.div>
              ) : m.isSuccess && m.data ? (
                <AnalysisResult key="ok" inc={m.data} onReset={reset} />
              ) : (
                <motion.div key="idle" className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <BrainCircuit size={40} className="text-accent/60" />
                  <p className="heading text-lg">Awaiting incident report</p>
                  <p className="max-w-sm text-xs text-tx2">Submit a report to see category, people affected, vulnerable groups, threats, resources, confidence, priority and duplicate detection — straight from <span className="font-mono">{API_URL}</span>.</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </section>
      </div>
    </div>
  );
};
