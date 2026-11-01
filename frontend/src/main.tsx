import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { AppProvider } from "./state/AppState";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./index.css";
import "./leafletFix";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary label="root">
      <QueryClientProvider client={queryClient}>
        <AppProvider>
          <App />
        </AppProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
