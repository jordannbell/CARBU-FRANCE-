export type MapsPlatform = 'ios' | 'android'

/** Deep link that opens the platform's default maps app with directions to the station. */
export function buildDirectionsUrl(
  platform: MapsPlatform,
  latitude: number,
  longitude: number,
  label: string,
): string {
  const coords = `${latitude},${longitude}`
  if (platform === 'ios') return `https://maps.apple.com/?daddr=${coords}&dirflg=d`
  return `geo:${coords}?q=${coords}(${encodeURIComponent(label)})`
}
