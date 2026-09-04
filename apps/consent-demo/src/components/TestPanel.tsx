/**
 * Test panel for manually triggering consent scenarios (for 13.1 testing)
 * This component is NOT part of the normal flow - only for debugging the
 * self-approval mechanism.
 */
import { useConsentBroker } from '@mcp-b/react-webmcp';
import { useState } from 'react';

export function TestPanel() {
  const broker = useConsentBroker();
  const [testCount, setTestCount] = useState(0);

  const triggerTestRequest = () => {
    broker.request({
      toolName: 'testTrigger',
      origin: window.location.origin,
      args: { test: testCount },
      consent: {
        scope: ['test'],
        reversible: true,
        riskLevel: 'high',
        requiresApproval: true,
      },
    });
    setTestCount((c) => c + 1);
  };

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        padding: '10px 15px',
        backgroundColor: '#333',
        color: '#fff',
        borderRadius: '5px',
        fontSize: '12px',
        zIndex: 10000,
        fontFamily: 'monospace',
      }}
    >
      <button
        onClick={triggerTestRequest}
        style={{
          padding: '5px 10px',
          backgroundColor: '#666',
          color: '#fff',
          border: 'none',
          borderRadius: '3px',
          cursor: 'pointer',
          marginRight: '10px',
        }}
      >
        [13.1 TEST] Trigger Request
      </button>
      <span>Count: {testCount}</span>
      <div style={{ marginTop: '5px', fontSize: '10px', color: '#aaa' }}>
        Check browser console for isTrusted logs
      </div>
    </div>
  );
}
