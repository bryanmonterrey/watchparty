// Static import so expo-network lives in the MAIN bundle: @better-auth/expo
// lazy-imports it, and Metro's lazy chunks break in Expo Go ("Requiring
// unknown module"). Preloaded, the dynamic import resolves from the module
// registry without fetching a chunk — works with or without
// EXPO_NO_METRO_LAZY=1.
import 'expo-network';

import { createAuthClient } from 'better-auth/react';
import { expoClient } from '@better-auth/expo/client';
import { emailOTPClient } from 'better-auth/client/plugins';
import * as SecureStore from 'expo-secure-store';

import { getBaseUrl } from '@/lib/base-url';

/**
 * better-auth client against the same /api/auth backend the web app uses.
 * The expoClient plugin persists the session cookie in SecureStore and
 * handles deep-link callbacks via the `watchparty://` scheme.
 *
 * Email OTP only for now — wallet (SIWS/SIWE), passkey and OAuth flows come
 * later and need mobile-specific handling (in-app browser / deep links).
 */
export const authClient = createAuthClient({
  baseURL: `${getBaseUrl()}/api/auth`,
  plugins: [
    expoClient({
      scheme: 'watchparty',
      storagePrefix: 'watchparty',
      storage: SecureStore,
    }),
    emailOTPClient(),
  ],
});
