import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { useConsentBroker } from '@mcp-b/react-webmcp';
import type { ConsentDecisionEvent } from '@mcp-b/react-webmcp';

const AuditLogContext = createContext<ConsentDecisionEvent[]>([]);

export function AuditLogProvider({ children }: { children: ReactNode }) {
  const broker = useConsentBroker();
  const [logs, setLogs] = useState<ConsentDecisionEvent[]>([]);

  useEffect(() => {
    return broker.subscribeDecision((event) => {
      setLogs((prev) => [event, ...prev]);
    });
  }, [broker]);

  return <AuditLogContext.Provider value={logs}>{children}</AuditLogContext.Provider>;
}

export function AuditLog() {
  const logs = useContext(AuditLogContext);

  return (
    <div className="audit-log">
      <h2>Audit Log</h2>
      {logs.length === 0 ? (
        <p className="empty">No tool invocations yet.</p>
      ) : (
        <ul>
          {logs.map((log) => (
            <li key={log.id} className={`audit-entry ${log.approved ? 'approved' : 'denied'}`}>
              <div className="audit-time">{new Date(log.resolvedAt).toLocaleTimeString()}</div>
              <div className="audit-details">
                <strong>{log.toolName}</strong>
                <span className="audit-origin">({log.origin})</span>
              </div>
              <div className="audit-decision">
                <span className="badge">{log.approved ? 'APPROVED' : 'DENIED'}</span>
                <span className="reason">({log.reason})</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
