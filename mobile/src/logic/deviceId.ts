// An anonymous random id, generated once on the phone. It is the only credential for the
// device's price alerts (the server never learns who the user is), so it must be unguessable.
const DEVICE_ID_PATTERN = /^[a-f0-9]{32}$/

export const DEVICE_ID_BYTES = 16

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** Returns the stored id if it is well formed, otherwise null (a new one must be generated). */
export function parseDeviceId(raw: string | null): string | null {
  return raw !== null && DEVICE_ID_PATTERN.test(raw) ? raw : null
}
