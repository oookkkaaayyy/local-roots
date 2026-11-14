import { Component, type ReactNode } from 'react';

type State = { failed: boolean };

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false };
  static getDerivedStateFromError(): State { return { failed: true }; }
  componentDidCatch(error: unknown) {
    try { console.error('Local Roots render error', error); } catch { /* optional */ }
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main role="alert" style={{ maxWidth: 480, margin: '20vh auto 0', padding: '0 20px', textAlign: 'center', color: '#3A2618', fontFamily: 'system-ui, sans-serif' }}>
        <h1 style={{ fontSize: '1.3rem' }}>This page did not load</h1>
        <p><a href="/" style={{ color: '#3A2618', fontWeight: 700 }}>Local Roots home</a></p>
        <button type="button" onClick={() => window.location.reload()} style={{ minHeight: 44, padding: '0 20px', fontWeight: 700 }}>Reload</button>
      </main>
    );
  }
}
