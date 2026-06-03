import { Component } from "react";
import { formatErrorMessage } from "../utils/errorUtils";

// Error boundary prevents a frontend crash from turning the whole app into a blank page.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      message: ""
    };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      message: formatErrorMessage(error, "Something went wrong")
    };
  }

  componentDidCatch(error, info) {
    console.error("Frontend error boundary caught an error:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary-page">
          <div className="error-boundary-panel">
            <h1>Something went wrong</h1>
            <p>{this.state.message}</p>
            <button onClick={() => window.location.reload()}>
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
