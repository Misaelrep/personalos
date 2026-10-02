/** Opened from the home screen: iOS `navigator.standalone`, or `display-mode: standalone` elsewhere. */
export function isStandalone(win: { matchMedia?: (query: string) => { matches: boolean }; navigator: object }): boolean {
  return win.matchMedia?.('(display-mode: standalone)').matches === true || (win.navigator as { standalone?: boolean }).standalone === true
}

/**
 * Installed, the app lives on this device only: ask the browser to keep its
 * storage (the day states in localStorage) out of eviction. Silent where it
 * is granted; never asked from a browser tab, so no permission prompt.
 */
export function keepStorageWhenInstalled(): void {
  if (typeof window === 'undefined' || !isStandalone(window)) return
  navigator.storage?.persist?.().catch(() => {})
}
