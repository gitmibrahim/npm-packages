export function hasNativeConsentGate(): boolean {
  // Placeholder heuristic — refine once real detection signals are confirmed.
  // e.g. check for a global flag set by the MCP-B extension, or a UA/context
  // marker present when running inside ChatGPT's built-in browser.
  return false;
}
