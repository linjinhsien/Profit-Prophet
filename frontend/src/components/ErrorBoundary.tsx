import { Component, type ErrorInfo, type ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
}

/**
 * Error boundary that catches render-phase errors in child components.
 *
 * SECURITY: Does NOT display stack traces or error details to the user.
 * Care data could be present in component state and might leak via stack frames.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Log to console for developer debugging only — never expose to UI
    console.error('[ErrorBoundary] Caught error:', error.message)
    console.error('[ErrorBoundary] Component stack:', info.componentStack)
  }

  private handleRetry = (): void => {
    this.setState({ hasError: false })
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div
          className="flex min-h-[50vh] flex-col items-center justify-center px-4 text-center"
          role="alert"
        >
          <p className="text-4xl">⚠️</p>
          <h2 className="mt-4 text-xl font-bold text-slate-900">應用程式發生錯誤</h2>
          <p className="mt-2 max-w-md text-slate-600">
            系統遇到非預期問題。您的資料不會受到影響，請重新嘗試操作。
          </p>
          <button
            className="mt-6 rounded-xl bg-teal-700 px-5 py-3 font-semibold text-white hover:bg-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2"
            onClick={this.handleRetry}
            type="button"
          >
            重新嘗試
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
