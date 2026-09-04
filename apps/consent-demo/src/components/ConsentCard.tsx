import { useEffect, useState } from 'react';
import {
  usePendingConsentRequests,
  useConsentBroker,
  verifyUserPresence,
  browserSupportsWebAuthn,
  platformAuthenticatorIsAvailable,
  MAX_PRESENCE_ATTEMPTS,
} from '@mcp-b/react-webmcp';

export function ConsentCard() {
  const pending = usePendingConsentRequests();
  const broker = useConsentBroker();

  if (pending.length === 0) return null;

  return (
    <div className="consent-card-overlay">
      {pending.map((request) => (
        <ConsentCardItem
          key={request.id}
          request={request}
          onDecide={(approved, remember, reason) =>
            broker.decide(request.id, approved, remember, reason)
          }
          getCooldownRemaining={() => broker.getCooldownRemaining(request.origin, request.toolName)}
          recordPresenceFailure={() => broker.recordPresenceFailure(request.id)}
        />
      ))}
    </div>
  );
}

function ConsentCardItem({
  request,
  onDecide,
  getCooldownRemaining,
  recordPresenceFailure,
}: {
  request: ReturnType<typeof usePendingConsentRequests>[0];
  onDecide: (approved: boolean, remember: boolean, reason?: 'user' | 'presence-lockout') => void;
  getCooldownRemaining: () => number;
  recordPresenceFailure: () => { attempts: number; lockedOut: boolean };
}) {
  const { toolName, origin, consent } = request;
  const [rememberForSession, setRememberForSession] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [presenceError, setPresenceError] = useState<string | null>(null);
  const [lockedOut, setLockedOut] = useState(false);
  const [cooldownMs, setCooldownMs] = useState(0);

  // Tick the cooldown display down once per second while locked out, purely
  // for the countdown text — the actual enforcement lives in the broker.
  useEffect(() => {
    if (!lockedOut) return;
    setCooldownMs(getCooldownRemaining());
    const interval = setInterval(() => {
      setCooldownMs(getCooldownRemaining());
    }, 1000);
    return () => clearInterval(interval);
  }, [lockedOut, getCooldownRemaining]);

  const handleApprove = async (e: React.MouseEvent) => {
    // React's synthetic event does not copy Event.isTrusted; read the native click.
    if (!e.nativeEvent.isTrusted) {
      console.warn('Ignored untrusted approve event for request', request.id);
      return;
    }

    if (lockedOut) return; // button should already be disabled, but guard anyway

    if (consent.requireUserPresence) {
      setPresenceError(null);
      setIsVerifying(true);
      try {
        const supported = browserSupportsWebAuthn() && (await platformAuthenticatorIsAvailable());

        if (supported) {
          const verified = await verifyUserPresence();
          if (!verified) {
            const { attempts, lockedOut: nowLockedOut } = recordPresenceFailure();
            console.warn(
              'User presence verification failed or was cancelled for request',
              request.id,
              `(attempt ${attempts}/${MAX_PRESENCE_ATTEMPTS})`
            );

            if (nowLockedOut) {
              setLockedOut(true);
              setPresenceError(
                'Too many failed verification attempts. This action is temporarily locked — deny it, or wait for the cooldown.'
              );
              // Auto-deny with an honest audit-log reason rather than
              // leaving it to the generic 30s timeout, and rather than
              // resolving as if a human explicitly denied it.
              onDecide(false, false, 'presence-lockout');
            } else {
              setPresenceError(
                `Verification failed or was cancelled. ${MAX_PRESENCE_ATTEMPTS - attempts} attempt(s) left before this locks temporarily.`
              );
            }
            return;
          }
        } else {
          // No platform authenticator available on this device — degrade
          // gracefully rather than hard-blocking approval entirely.
          console.warn(
            'Platform authenticator unavailable — falling back to click approval for',
            request.id
          );
        }
      } finally {
        setIsVerifying(false);
      }
    }

    onDecide(true, rememberForSession);
  };

  const handleDeny = (e: React.MouseEvent) => {
    if (!e.nativeEvent.isTrusted) {
      console.warn('Ignored untrusted deny event for request', request.id);
      return;
    }

    onDecide(false, false);
  };

  return (
    <div className={`consent-card ${consent.riskLevel === 'high' ? 'high-risk' : ''}`}>
      <div className="consent-card-header">
        <span className={`risk-badge risk-${consent.riskLevel}`}>
          {consent.riskLevel.toUpperCase()} RISK
        </span>
        <h3>{toolName}</h3>
        <p className="origin">
          Requested by: <strong>{origin}</strong>
        </p>
      </div>

      <div className="consent-card-body">
        <div className="details-block">
          <strong>Scopes:</strong>
          <ul>
            {consent.scope.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </div>

        <div className="details-block">
          <strong>Impact:</strong>
          {consent.reversible ? (
            <span className="impact reversible">Reversible (safe to undo)</span>
          ) : (
            <span className="impact irreversible">IRREVERSIBLE (cannot be undone)</span>
          )}
        </div>

        {consent.requireUserPresence && (
          <div className="details-block presence-notice">
            <span className="presence-badge">🔒 Requires identity verification to approve</span>
          </div>
        )}

        {consent.reversible && (
          <div className="remember-block">
            <label>
              <input
                type="checkbox"
                checked={rememberForSession}
                onChange={(e) => setRememberForSession(e.target.checked)}
              />
              Don't ask again this session
            </label>
          </div>
        )}

        {presenceError && <p className="presence-error">{presenceError}</p>}

        {lockedOut && cooldownMs > 0 && (
          <p className="lockout-countdown">
            Locked — retry available in {Math.ceil(cooldownMs / 1000)}s
          </p>
        )}
      </div>

      <div className="consent-card-actions">
        <button className="btn-deny" onClick={handleDeny} disabled={isVerifying}>
          Deny
        </button>
        <button className="btn-approve" onClick={handleApprove} disabled={isVerifying || lockedOut}>
          {isVerifying ? 'Verifying…' : lockedOut ? 'Locked' : 'Approve'}
        </button>
      </div>
    </div>
  );
}
