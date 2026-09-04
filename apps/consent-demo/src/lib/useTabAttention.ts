import { useEffect, useRef } from 'react';
import { usePendingConsentRequests } from '@mcp-b/react-webmcp';

const BLINK_INTERVAL_MS = 1000;

/**
 * Hook that provides visual feedback when the user is away from the tab
 * and a consent request is pending.
 *
 * Effects:
 * - Title blinks between the original title and an alert indicator while the tab is hidden
 * - Favicon swaps to a badge icon while any request is pending (regardless of focus)
 */
export function useTabAttention() {
  const pending = usePendingConsentRequests();
  const originalTitle = useRef(document.title);
  const blinkTimer = useRef<number | null>(null);
  const faviconLink = useRef<HTMLLinkElement | null>(null);

  useEffect(() => {
    if (!faviconLink.current) {
      faviconLink.current = document.querySelector<HTMLLinkElement>("link[rel~='icon']") ?? null;
    }
  }, []);

  useEffect(() => {
    const hasPending = pending.length > 0;

    if (hasPending && document.hidden) {
      // Blink the title only while the tab is unfocused — no point once they're looking at it.
      if (blinkTimer.current === null) {
        let showAlert = false;
        blinkTimer.current = window.setInterval(() => {
          document.title = showAlert ? originalTitle.current : `\u2757 Approval needed`;
          showAlert = !showAlert;
        }, BLINK_INTERVAL_MS);
      }
    } else {
      if (blinkTimer.current !== null) {
        clearInterval(blinkTimer.current);
        blinkTimer.current = null;
      }
      document.title = originalTitle.current;
    }

    // Favicon dot: swap in a badge icon whenever there's a pending request,
    // regardless of focus, as a persistent visual cue.
    if (faviconLink.current) {
      faviconLink.current.href = hasPending ? '/favicon-dot.svg' : '/favicon.svg';
    }

    return () => {
      if (blinkTimer.current !== null) {
        clearInterval(blinkTimer.current);
        blinkTimer.current = null;
      }
    };
  }, [pending.length]);
}
