import 'server-only';
import type { AllowedFolder, AuthUser, SaveFoldersPayload } from '@dropto/types';

import { getHttp } from '@/common/services/axios/axios.instance';

// Server-side auth / Google-account API — reached via getHttp(), never from the browser.

/**
 * Fetches the currently authenticated operator.
 **/
export const getMe = async (): Promise<AuthUser> => {
  const http = await getHttp();
  const { data } = await http.get<AuthUser>('/auth/me');

  return data;
};

/**
 * Mints a short-lived access token for the Google Picker.
 **/
export const getPickerToken = async (): Promise<string> => {
  const http = await getHttp();
  const { data } = await http.get<{ accessToken: string }>('/google-auth/picker-token');

  return data.accessToken;
};

/**
 * Persists the folders selected via the Google Picker.
 **/
export const saveFolders = async (payload: SaveFoldersPayload): Promise<AllowedFolder[]> => {
  const http = await getHttp();
  const { data } = await http.post<AllowedFolder[]>('/google-auth/folders', payload);

  return data;
};

/**
 * Disconnects the Google account from the app.
 **/
export const disconnectAccount = async (): Promise<void> => {
  const http = await getHttp();
  await http.delete('/google-auth/account');
};
