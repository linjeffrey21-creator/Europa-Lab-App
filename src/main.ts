import React from 'react';
import { createRoot } from 'react-dom/client';
import { inject } from '@vercel/analytics';
import { App } from './ui/App.ts';

// Initialize Vercel Web Analytics
inject();

const previewOptions = new URLSearchParams(window.location.search);
if (previewOptions.get('style') === 'classroom') {
  document.documentElement.classList.add('classroom-style-preview');
}

const previewFonts = new Map([
  ['jakarta', 'Plus Jakarta Sans'],
  ['source-sans', 'Source Sans 3'],
  ['atkinson', 'Atkinson Hyperlegible Next'],
  ['instrument', 'Instrument Sans'],
]);
const previewFont = previewFonts.get(previewOptions.get('font') ?? '');
if (previewFont) {
  const fontStylesheet = document.createElement('link');
  fontStylesheet.rel = 'stylesheet';
  fontStylesheet.href = 'https://fonts.googleapis.com/css2?family=' +
    encodeURIComponent(previewFont) + ':wght@400;500;600;700;800&display=swap';
  document.head.append(fontStylesheet);
  document.documentElement.style.setProperty('--lab-preview-font', '"' + previewFont + '"');
}

class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    document.getElementById('callisto-loader')?.remove();
    console.error('RootErrorBoundary caught error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return React.createElement(
        'div',
        {
          style: {
            padding: '30px 40px',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            maxWidth: '800px',
            margin: '40px auto',
            background: '#fff',
            borderRadius: '8px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
            border: '1px solid #fee2e2',
          },
        },
        React.createElement('h2', { style: { color: '#b91c1c', marginTop: 0 } }, 'Europa Lab encountered an error'),
        React.createElement(
          'p',
          { style: { color: '#4b5563', lineHeight: 1.5 } },
          'Reload the lab to try again.'
        ),
        React.createElement(
          'button',
          {
            type: 'button',
            onClick: () => window.location.reload(),
            style: {
              background: '#2563eb',
              color: '#fff',
              border: 0,
              padding: '10px 18px',
              borderRadius: '6px',
              fontWeight: 700,
              cursor: 'pointer',
              marginTop: '12px',
            },
          },
          'Reload lab'
        )
      );
    }
    return this.props.children;
  }
}

const rootEl = document.getElementById('root');
if (rootEl) {
  createRoot(rootEl).render(
    React.createElement(RootErrorBoundary, null, React.createElement(App))
  );
}
