import React from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

type Props = { children: React.ReactNode; label?: string };
type State = { error: Error | null };

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };
  static getDerivedStateFromError(error: Error): State {
    return { error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[ErrorBoundary:${this.props.label ?? "app"}]`, error, info.componentStack);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="panel m-4 flex flex-col items-start gap-3 border-crit/40 p-5">
        <div className="flex items-center gap-2 text-crit">
          <AlertTriangle size={18} />
          <span className="heading text-base">This panel failed to render</span>
        </div>
        <p className="font-mono text-xs text-tx2">{this.state.error.message}</p>
        <button className="btn btn-primary" onClick={() => this.setState({ error: null })}>
          <RotateCcw size={14} /> Retry
        </button>
      </div>
    );
  }
}
