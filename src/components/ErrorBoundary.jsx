import React from 'react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary caught error]:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div className="p-4 rounded-xl bg-[#141419] border border-[#FF5A5F]/30 text-center text-xs text-[#F4F1EA]">
          <p className="font-semibold text-[#FF5A5F] mb-1">Something went wrong</p>
          <p className="text-[#9A978F] mb-3">{this.state.error?.message || 'Unexpected error'}</p>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false, error: null })}
            className="px-3 py-1.5 rounded-lg bg-[#1C1C24] hover:bg-[#252530] border border-white/10 text-xs font-medium cursor-pointer"
          >
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;

