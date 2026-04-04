import React, { ErrorInfo, ReactNode } from 'react';
import { safeParse } from '../lib/utils';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends (React.Component as any) {
  constructor(props: any) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({
      error: error,
      errorInfo: errorInfo
    });
    console.error('Uncaught error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      let errorMessage = 'An unexpected error occurred.';
      let details = '';

      try {
        // Try to parse the error message if it's a JSON string (from handleFirestoreError)
        if (this.state.error?.message) {
          const parsed = safeParse<any>(this.state.error.message, null);
          if (parsed && parsed.error) {
            errorMessage = parsed.error;
            details = JSON.stringify(parsed, null, 2);
          }
        }
      } catch (e) {
        // Not a JSON string, use the raw message
        errorMessage = this.state.error?.message || errorMessage;
      }

      return (
        <div className="min-h-screen bg-stone-50 flex items-center justify-center p-6 font-sans">
          <div className="max-w-2xl w-full bg-white rounded-[40px] p-12 shadow-xl shadow-stone-200 border border-stone-100">
            <div className="w-20 h-20 bg-red-50 rounded-3xl flex items-center justify-center mb-8">
              <span className="text-4xl">⚠️</span>
            </div>
            <h1 className="text-3xl font-bold text-stone-900 mb-4">Something went wrong</h1>
            <p className="text-stone-600 mb-8 text-lg leading-relaxed">
              {errorMessage}
            </p>
            
            {details && (
              <div className="mb-8">
                <p className="text-xs font-bold text-stone-400 uppercase tracking-widest mb-2">Technical Details</p>
                <pre className="bg-stone-50 p-6 rounded-2xl text-xs text-stone-500 overflow-auto max-h-48 font-mono leading-relaxed border border-stone-100">
                  {details}
                </pre>
              </div>
            )}

            <button
              onClick={() => window.location.reload()}
              className="w-full bg-stone-900 text-white py-5 rounded-[24px] font-bold text-lg hover:bg-stone-800 transition-all shadow-xl shadow-stone-200"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
