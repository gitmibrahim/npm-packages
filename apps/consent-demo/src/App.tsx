import { useState, useEffect } from 'react';
import { ConsentBrokerProvider } from '@mcp-b/react-webmcp';
import { ConsentCard } from './components/ConsentCard';
import { AuditLog, AuditLogProvider } from './components/AuditLog';
import { MonitoringPage } from './pages/MonitoringPage';
import { DeploymentsPage } from './pages/DeploymentsPage';
import { hasNativeConsentGate } from './lib/detectNativeGate';
import { useTabAttention } from './lib/useTabAttention';
import './App.css';

function AppContent() {
  const [route, setRoute] = useState(window.location.hash || '#/monitoring');
  useTabAttention();

  useEffect(() => {
    const onHashChange = () => setRoute(window.location.hash);
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  return (
    <AuditLogProvider>
      <div className="app-container">
        <header className="app-header">
          <h1>WebMCP Consent Layer Demo</h1>
          <nav>
            <a href="#/monitoring" className={route === '#/monitoring' ? 'active' : ''}>
              Monitoring
            </a>
            <a href="#/deployments" className={route === '#/deployments' ? 'active' : ''}>
              Deployments
            </a>
          </nav>
        </header>

        <main className="app-content">
          {route === '#/monitoring' && <MonitoringPage />}
          {route === '#/deployments' && <DeploymentsPage />}
        </main>

        <aside className="app-sidebar">
          <AuditLog />
        </aside>

        {!hasNativeConsentGate() && <ConsentCard />}
      </div>
    </AuditLogProvider>
  );
}

function App() {
  return (
    <ConsentBrokerProvider>
      <AppContent />
    </ConsentBrokerProvider>
  );
}

export default App;
