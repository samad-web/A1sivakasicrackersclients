import React, { Component, ErrorInfo, ReactNode } from "react";
import { Button } from "./ui/button";
import { AlertCircle, RefreshCcw } from "lucide-react";

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null,
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error("Uncaught error:", error, errorInfo);
    }

    private handleReset = () => {
        this.setState({ hasError: false, error: null });
        window.location.href = "/";
    };

    public render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen flex items-center justify-center p-4 bg-background">
                    <div className="max-w-md w-full glass-panel p-8 rounded-2xl border-destructive/20 text-center space-y-6">
                        <div className="mx-auto w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center">
                            <AlertCircle className="w-10 h-10 text-destructive" />
                        </div>
                        <div className="space-y-2">
                            <h1 className="text-2xl font-bold tracking-tight">Something went wrong</h1>
                            <p className="text-muted-foreground text-sm">
                                An unexpected error occurred. We've been notified and are working on a fix.
                            </p>
                        </div>
                        {this.state.error && (
                            <pre className="text-[10px] bg-muted p-3 rounded-lg overflow-auto max-h-32 text-left font-mono">
                                {this.state.error.message}
                            </pre>
                        )}
                        <Button
                            onClick={this.handleReset}
                            className="w-full btn-premium flex items-center justify-center gap-2"
                        >
                            <RefreshCcw className="w-4 h-4" />
                            Reload Application
                        </Button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
