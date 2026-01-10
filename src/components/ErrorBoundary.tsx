import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { AlertCircle, RotateCcw, Home } from 'lucide-react';

interface Props {
    children?: ReactNode;
    fallback?: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('Uncaught error:', error, errorInfo);
    }

    private handleRetry = () => {
        this.setState({ hasError: false, error: null });
        window.location.reload();
    };

    private handleGoHome = () => {
        this.setState({ hasError: false, error: null });
        window.location.href = '/';
    };

    public render() {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback;
            }

            return (
                <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center">
                    <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mb-6">
                        <AlertCircle size={32} />
                    </div>
                    <h1 className="text-2xl font-bold mb-2">Something went wrong</h1>
                    <p className="text-muted-foreground mb-8 max-w-md">
                        The application encountered an unexpected error. This usually happens when processing very large ride recordings.
                    </p>
                    <div className="flex flex-wrap gap-4 justify-center">
                        <Button onClick={this.handleRetry} variant="outline" className="flex items-center gap-2">
                            <RotateCcw size={16} />
                            Retry
                        </Button>
                        <Button onClick={this.handleGoHome} className="flex items-center gap-2">
                            <Home size={16} />
                            Back to Home
                        </Button>
                    </div>
                    {this.state.error && (
                        <div className="mt-8 p-4 bg-muted rounded-lg text-left w-full max-w-xl overflow-auto border">
                            <p className="text-xs font-mono text-muted-foreground whitespace-pre">
                                {this.state.error.message}
                            </p>
                        </div>
                    )}
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
