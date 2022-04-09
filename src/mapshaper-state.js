
export function runningInBrowser() {
  return typeof window !== 'undefined' && typeof window.document !== 'undefined';
}
