import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Optionally log error to service
    // console.error('ErrorBoundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-[#FAFAFA] text-zinc-900 p-8">
          <h1 className="text-2xl font-bold mb-2">Something went wrong</h1>
          <p className="mb-4 text-zinc-600">An unexpected error occurred. Please refresh the page or try again later.</p>
          <details className="text-xs text-zinc-400 whitespace-pre-wrap">
            {this.state.error?.message}
          </details>
        </div>
      );
    }
    return this.props.children;
  }
}
