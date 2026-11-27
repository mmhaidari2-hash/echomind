/**
 * Phone network state — the device's own internet (Wi-Fi / mobile
 * data), not the server. EchoMind must never tell the owner "you're
 * offline" when the phone is online and only the server is
 * unreachable: that is exactly what Mahdi reported (other apps work
 * on the same Wi-Fi, EchoMind says it cannot connect).
 *
 * No new native plugin: navigator.onLine is the WebView's own
 * connectivity signal (Android WebView tracks it and fires the
 * online/offline events), and the Railway health probe is the
 * reachability check. @capacitor/network reads the same
 * ConnectivityManager underneath and would add a dependency + cap
 * sync for no new information — so it is deliberately NOT installed.
 *
 * Two states, kept strictly apart everywhere this is used:
 * - phone offline (navigator.onLine === false): the device has no
 *   internet at all. No API attempt is made; the user is told to
 *   turn on Wi-Fi or mobile data.
 * - phone online but the request failed: the server (or the path to
 *   it) is the cause. The user gets the server message, never
 *   "you're offline".
 *
 * Plain functions over navigator/window, no imports, so this module
 * is importable in plain Node tests (tests stub globalThis.navigator
 * / globalThis.window).
 */

export function isPhoneOnline(): boolean {
  // Unknown environment (no navigator): fail open. The health probe
  // in api.ts is the arbiter there — never block a call on a signal
  // we cannot read.
  if (typeof navigator === "undefined") return true;
  return navigator.onLine;
}

export type PhoneNetworkListener = (online: boolean) => void;

/** Subscribe to the device's connectivity changes. Returns an
    unsubscribe function. No-ops outside a browser. */
export function onPhoneNetworkChange(
  listener: PhoneNetworkListener,
): () => void {
  if (typeof window === "undefined") return () => {};
  const handleOnline = () => listener(true);
  const handleOffline = () => listener(false);
  window.addEventListener("online", handleOnline);
  window.addEventListener("offline", handleOffline);
  return () => {
    window.removeEventListener("online", handleOnline);
    window.removeEventListener("offline", handleOffline);
  };
}
