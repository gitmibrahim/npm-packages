import { useGuardedWebMCP } from '@mcp-b/react-webmcp';

export function MonitoringPage() {
  useGuardedWebMCP({
    name: 'getServiceHealth',
    description: 'Get health status of the service',
    inputSchema: { type: 'object', properties: {} },
    consent: {
      scope: ['checkout-service'],
      reversible: true,
      riskLevel: 'low',
      requiresApproval: false,
    },
    execute: async () => {
      return { status: 'healthy', uptime: '99.9%' };
    },
  });

  return (
    <div className="page monitoring-page">
      <h2>Monitoring Dashboard</h2>
      <div className="card">
        <h3>Service Health</h3>
        <p>
          Status: <span className="status-badge healthy">Healthy</span>
        </p>
        <p>
          The <code>getServiceHealth</code> tool is registered and available to the agent. Because
          it's low risk, the agent can call it without prompting you.
        </p>
      </div>
    </div>
  );
}
