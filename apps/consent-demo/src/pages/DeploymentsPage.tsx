import { useGuardedWebMCP } from '@mcp-b/react-webmcp';
import { useState } from 'react';

export function DeploymentsPage() {
  const [deployments, setDeployments] = useState([
    { id: 'v4.2.0', status: 'active', date: '2026-09-03' },
    { id: 'v4.1.0', status: 'previous', date: '2026-09-02' },
  ]);
  const [requireUserPresence, setRequireUserPresence] = useState(true);

  useGuardedWebMCP({
    name: 'getRecentDeployments',
    description: 'List recent deployments',
    inputSchema: { type: 'object', properties: {} },
    consent: {
      scope: ['checkout-service'],
      reversible: true,
      riskLevel: 'low',
      requiresApproval: false,
    },
    execute: async () => {
      return { deployments };
    },
  });

  useGuardedWebMCP({
    name: 'rollbackDeployment',
    description: 'Rollback a deployment to a specific version',
    inputSchema: {
      type: 'object',
      properties: {
        versionId: { type: 'string' },
      },
      required: ['versionId'],
    },
    consent: {
      scope: ['checkout-service', 'production'],
      reversible: false,
      riskLevel: 'high',
      requiresApproval: true,
      requireUserPresence,
    },
    execute: async ({ versionId }: { versionId: string }) => {
      setDeployments((prev) =>
        prev.map((d) => ({
          ...d,
          status: d.id === versionId ? 'active' : d.status === 'active' ? 'rolled-back' : d.status,
        }))
      );
      return { success: true, message: `Rolled back to ${versionId}` };
    },
  });

  return (
    <div className="page deployments-page">
      <h2>Deployments</h2>
      <p>
        Two tools are registered here: <code>getRecentDeployments</code> (low risk) and{' '}
        <code>rollbackDeployment</code> (high risk).
      </p>

      <div className="card presence-toggle-card">
        <div>
          <h3>User presence verification</h3>
          <p>
            When on, approving <code>rollbackDeployment</code> requires a WebAuthn ceremony (Touch
            ID, Windows Hello, or a hardware key). Turn it off to compare a standard
            click-to-approve card. Takes effect on the next call.
          </p>
        </div>
        <label className="presence-switch">
          <input
            type="checkbox"
            role="switch"
            checked={requireUserPresence}
            onChange={(e) => setRequireUserPresence(e.target.checked)}
            aria-label="Require user presence for rollbackDeployment"
          />
          <span className="presence-switch-track" aria-hidden="true" />
          <span className="presence-switch-label">{requireUserPresence ? 'On' : 'Off'}</span>
        </label>
      </div>

      <div className="card">
        <h3>Deployment History</h3>
        <ul className="deployment-list">
          {deployments.map((d) => (
            <li key={d.id} className={`deployment-item ${d.status}`}>
              <strong>{d.id}</strong> - {d.status} <em>({d.date})</em>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
