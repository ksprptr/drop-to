import 'server-only';
import type { AllowedFolder, AuthUser, SaveFoldersPayload } from '@dropto/types';

import { getHttp } from '@/common/services/axios/axios.instance';

/**
 * Server-side API functions for auth / Google-account management. All reached
 * through `getHttp()` (server-to-server, cookies forwarded) — never from the
 * browser directly.
 */

/**
 * Fetches the currently authenticated operator.
 * @returns The current user
 */
export const getMe = async (): Promise<AuthUser> => {
  const http = await getHttp();
  const { data } = await http.get<AuthUser>('/auth/me');

  return data;
};

/**
 * Mints a short-lived access token for the Google Picker (used briefly in the browser).
 * @returns The access token
 */
export const getPickerToken = async (): Promise<string> => {
  const http = await getHttp();
  const { data } = await http.get<{ accessToken: string }>('/google-auth/picker-token');

  return data.accessToken;
};

/**
 * Persists the folders selected via the Google Picker.
 * @param payload - The selected folders (id + name)
 * @returns The saved allowed folders
 */
export const saveFolders = async (payload: SaveFoldersPayload): Promise<AllowedFolder[]> => {
  const http = await getHttp();
  const { data } = await http.post<AllowedFolder[]>('/google-auth/folders', payload);

  return data;
};

/**
 * Disconnects the Google account from the app.
 */
export const disconnectAccount = async (): Promise<void> => {
  const http = await getHttp();
  await http.delete('/google-auth/account');
};
