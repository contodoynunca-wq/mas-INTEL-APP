import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from 'react-error-boundary';

function ErrorFallback({ error }: { error: Error }) {
    return (
      <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          height: '100vh', fontFamily: 'sans-serif', backgroundColor: '#121212', color: '#EAEAEA', padding: '1rem'
      }}>
          <div style={{ textAlign: 'center', padding: '2rem', backgroundColor: '#1E1E1E', borderRadius: '8px', border: '1px solid #404040', maxWidth: '600px' }}>
              <h1 style={{ color: '#FF4D4D', fontSize: '1.5rem', fontWeight: 'bold' }}>Oops! Something Went Wrong.</h1>
              <p style={{ marginTop: '1rem', color: '#A0A0A0' }}>
                  A critical error occurred in the application. Please try refreshing the page.
              </p>
              <details style={{ whiteSpace: 'pre-wrap', backgroundColor: '#121212', border: '1px solid #404040', padding: '1rem', borderRadius: '4px', marginTop: '1rem', textAlign: 'left', color: '#A0A0A0' }}>
                  <summary style={{ cursor: 'pointer', color: '#EAEAEA' }}>Error Details</summary>
                  <pre style={{ marginTop: '0.5rem', fontFamily: 'monospace', fontSize: '0.8rem' }}>{error.message}</pre>
              </details>
          </div>
      </div>
    );
}

const rootElement = document.getElementById('root');
if (rootElement) {
    const root = ReactDOM.createRoot(rootElement);
    root.render(
        <React.StrictMode>
            <ErrorBoundary FallbackComponent={ErrorFallback}>
                <App />
            </ErrorBoundary>
        </React.StrictMode>
    );
} else {
    console.error("Fatal Error: The root element with ID 'root' was not found in the DOM.");
    const body = document.querySelector('body');
    if (body) {
        body.innerHTML = '<div style="color: red; font-family: sans-serif; padding: 2rem;"><h1>Fatal Error</h1><p>Application could not start because the root HTML element was not found.</p></div>';
    }
}