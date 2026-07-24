import type { AllowedFolder, AuthUser, LoginPayload, SaveFoldersPayload } from '@dropto/types';

import { http } from '@/common/services/axios/axios.instance';
import { getEnvString } from '@/common/utils/environments.functions';

/**
 * Function to log the operator in (sets the auth cookies on success).
 * @param payload - The username and password
 */
export const login = async (payload: LoginPayload): Promise<void> => {
  await http.post('/auth/login', payload);
};

/**
 * Function to log the operator out (clears the auth cookies).
 */
export const logout = async (): Promise<void> => {
  await http.post('/auth/logout');
};

/**
 * Function to fetch the currently authenticated operator.
 * @returns The authenticated user
 */
export const getMe = async (): Promise<AuthUser> => {
  const { data } = await http.get<AuthUser>('/auth/me');

  return data;
};

/**
 * Function to build the API URL that starts the Google OAuth consent flow.
 * @returns The absolute `/google-auth/google` URL on the API
 */
export const getGoogleAuthUrl = (): string => {
  const base = getEnvString({ key: 'NEXT_PUBLIC_API_URL', fallback: 'http://localhost:4000/api/v1' });

  return `${base.replace(/\/$/, '')}/google-auth/google`;
};

/**
 * Function to fetch a short-lived access token for the Google Picker.
 * @returns The access token
 */
export const getPickerToken = async (): Promise<string> => {
  const { data } = await http.get<{ accessToken: string }>('/google-auth/picker-token');

  return data.accessToken;
};

/**
 * Function to persist the folders selected via the Google Picker.
 * @param payload - The selected folders (id + name)
 * @returns The saved allowed folders
 */
export const saveFolders = async (payload: SaveFoldersPayload): Promise<AllowedFolder[]> => {
  const { data } = await http.post<AllowedFolder[]>('/google-auth/folders', payload);

  return data;
};

/**
 * Function to disconnect the Google account from the app.
 */
export const disconnectAccount = async (): Promise<void> => {
  await http.delete('/google-auth/account');
};
