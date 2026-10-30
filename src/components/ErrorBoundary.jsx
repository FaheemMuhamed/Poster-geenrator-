import { Component } from 'react';

// If part of the interface crashes, show a way out instead of a blank page.
export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error(error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="grid h-full place-items-center p-6 text-center">
        <div className="max-w-sm space-y-3">
          <p className="text-[15px] font-semibold">Something went wrong in this view.</p>
          <p className="text-[13px] text-neutral-500">Your poster settings are saved in the link. Reloading usually fixes it.</p>
          <div className="flex justify-center gap-2">
            <button className="rounded-md bg-neutral-900 px-3 py-1.5 text-[13px] text-white" onClick={() => location.reload()}>Reload</button>
            <button className="rounded-md border border-neutral-200 px-3 py-1.5 text-[13px]" onClick={() => this.setState({ error: null })}>Try again</button>
          </div>
        </div>
      </div>
    );
  }
}
