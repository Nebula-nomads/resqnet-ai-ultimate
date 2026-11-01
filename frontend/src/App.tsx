import React from "react";
import { API_URL } from "./api";
import { useApp } from "./state/AppState";
import { Sidebar, TopBar, Toasts } from "./components/Shell";
import { IncidentDrawer } from "./components/IncidentIntel";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { BackendDown } from "./components/ui";
import { Overview } from "./pages/Overview";
import { Management } from "./pages/Management";
import { Reports } from "./pages/Reports";
import { Intel } from "./pages/Intel";
import { Geo } from "./pages/Geo";
import { Resources } from "./pages/Resources";
import { Simulation } from "./pages/Simulation";
import { Settings } from "./pages/Settings";
import { LiveFeed } from "./pages/LiveFeed";

const Page: React.FC = () => {
  const { page } = useApp();
  switch (page) {
    case "live": return <Management mode="active" />;
    case "livefeed": return <LiveFeed />;
    case "resolved": return <Management mode="resolved" />;
    case "reports": return <Reports />;
    case "intel": return <Intel />;
    case "geo": return <Geo />;
    case "resources": return <Resources />;
    case "simulation": return <Simulation />;
    case "settings": return <Settings />;
    default: return <Overview />;
  }
};

const App: React.FC = () => {
  const { q, health, page } = useApp();
  const down = q.isError || (!health.online && !health.checking);
  return (
    <div className="flex h-full bg-base bg-grid text-tx">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        {down && <BackendDown url={API_URL} onRetry={q.refetch} />}
        <main className="min-h-0 flex-1 overflow-y-auto" id="main">
          <ErrorBoundary key={page} label={page}><Page /></ErrorBoundary>
        </main>
      </div>
      <IncidentDrawer />
      <Toasts />
    </div>
  );
};

export default App;
