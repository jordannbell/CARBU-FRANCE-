import { Linking } from 'react-native'
import { isSafeHttpsUrl } from './logic/url'

/** The donation page, if one is configured (EXPO_PUBLIC_DONATION_URL). */
export const DONATION_URL: string | undefined = isSafeHttpsUrl(process.env.EXPO_PUBLIC_DONATION_URL)
  ? process.env.EXPO_PUBLIC_DONATION_URL
  : undefined

export async function openHttps(url: string): Promise<boolean> {
  if (!isSafeHttpsUrl(url)) return false
  try {
    await Linking.openURL(url)
    return true
  } catch {
    return false
  }
}
