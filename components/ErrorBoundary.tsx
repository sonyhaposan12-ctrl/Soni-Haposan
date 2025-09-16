import React, { Component, ErrorInfo, ReactNode } from 'react';
import ErrorDisplay from './ErrorDisplay';

interface Props {
  children: ReactNode;
  onReset: () => void;
}

interface State {
  hasError: boolean;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(_: Error): State {
    // Update state so the next render will show the fallback UI.
    return { hasError: true };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // You can also log the error to an error reporting service
    console.error("Uncaught error:", error, errorInfo);
  }

  private handleReset = () => {
    this.props.onReset();
    this.setState({ hasError: false });
  };

  public render() {
    if (this.state.hasError) {
      // Render a fallback UI when an error is caught
      return (
        <ErrorDisplay
          message="Oops! Something went wrong. Dismiss this message to reset the application and start over."
          onDismiss={this.handleReset}
        />
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
