import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { AlertTriangle, RefreshCcw, Home } from 'lucide-react';

interface Props {
    children?: ReactNode;
    fallback?: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
    errorInfo: React.ErrorInfo | null;
}

class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null,
        errorInfo: null
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error, errorInfo: null };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.group('CRITICAL UI CRASH DETECTED');
        console.error('Error:', error);
        console.error('Component Stack:', errorInfo.componentStack);
        console.groupEnd();

        this.setState({
            error,
            errorInfo
        });
    }

    public render() {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback;
            }

            const rideIdMatch = window.location.pathname.match(/\/history\/([^\/]+)/);
            const rideId = rideIdMatch ? rideIdMatch[1] : 'Unknown';

            return (
                <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-background text-foreground">
                    <Card className="w-full max-w-2xl border-destructive/50 shadow-lg">
                        <CardHeader>
                            <div className="flex items-center space-x-2 text-destructive mb-2">
                                <AlertTriangle className="h-6 w-6" />
                                <CardTitle className="text-xl">Safety Intervention</CardTitle>
                            </div>
                            <CardDescription className="text-foreground font-medium">
                                This ride summary could not be displayed safely.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="p-4 bg-muted/50 rounded-lg border font-mono text-[10px] overflow-auto max-h-[400px] space-y-2">
                                <p className="font-bold text-destructive">ERROR: {this.state.error?.name}: {this.state.error?.message}</p>
                                <div className="space-y-1">
                                    <p className="text-muted-foreground uppercase font-bold">State Info:</p>
                                    <p>Route: {window.location.pathname}</p>
                                    <p>RideID: {rideId}</p>
                                </div>
                                {this.state.error?.stack && (
                                    <div className="space-y-1 pt-2 border-t">
                                        <p className="text-muted-foreground uppercase font-bold">Stack Trace:</p>
                                        <pre className="whitespace-pre-wrap text-wrap">{this.state.error.stack}</pre>
                                    </div>
                                )}
                                {this.state.errorInfo?.componentStack && (
                                    <div className="space-y-1 pt-2 border-t">
                                        <p className="text-muted-foreground uppercase font-bold">Component Stack:</p>
                                        <pre className="whitespace-pre-wrap text-wrap">{this.state.errorInfo.componentStack}</pre>
                                    </div>
                                )}
                            </div>

                            <p className="text-sm text-muted-foreground">
                                The application encountered an unexpected issue while rendering this view. This often happens on low-memory mobile devices when handling large datasets.
                            </p>
                        </CardContent>
                        <CardFooter className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2">
                            <Button
                                variant="default"
                                className="w-full sm:w-auto"
                                onClick={() => window.location.reload()}
                            >
                                <RefreshCcw className="h-4 w-4 mr-2" />
                                Retry Render
                            </Button>
                            <Button
                                variant="outline"
                                className="w-full sm:w-auto"
                                onClick={() => window.location.href = '/'}
                            >
                                <Home className="h-4 w-4 mr-2" />
                                Back to Home
                            </Button>
                        </CardFooter>
                    </Card>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
