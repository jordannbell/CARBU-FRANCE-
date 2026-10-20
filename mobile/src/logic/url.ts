/** Only https links from the app's own configuration are opened: never http, never custom schemes. */
export function isSafeHttpsUrl(value: string | undefined): value is string {
  if (!value) return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.hostname.length > 0
  } catch {
    return false
  }
}
