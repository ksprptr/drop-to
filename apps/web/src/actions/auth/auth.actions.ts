'use server';

import type { AllowedFolder, SaveFoldersPayload } from '@dropto/types';
import { isAxiosError } from 'axios';
import { cookies } from 'next/headers';

import { disconnectAccount, getPickerToken, saveFolders } from '@/common/services/api/auth.api';
import { applyAuthCookies, parseAuthSetCookies } from '@/common/services/auth/tokens.server';
import { getHttp } from '@/common/services/axios/axios.instance';
import { type ActionResult, extractApiError, runAction } from '@/common/utils/action.functions';

/** Outcome of a sign-in attempt. */
export interface LoginResult {
  ok: boolean;
  error?: string;
}

/**
 * Signs the operator in and writes the returned auth cookies to the browser.
 **/
export async function login(username: string, password: string): Promise<LoginResult> {
  try {
    const http = await getHttp();
    const response = await http.post('/auth/login', { username, password });

    const setCookieHeader = response.headers['set-cookie'];
    const setCookies = parseAuthSetCookies(
      Array.isArray(setCookieHeader) ? setCookieHeader : undefined,
    );

    if (setCookies.length === 0) {
      return { ok: false, error: 'Login failed.' };
    }

    applyAuthCookies(await cookies(), setCookies);

    return { ok: true };
  } catch (error) {
    // HTTP response = rejected (bad credentials); no response = API unreachable.
    if (isAxiosError(error) && error.response) {
      return { ok: false, error: extractApiError(error) ?? 'Invalid username or password.' };
    }

    return { ok: false, error: 'The API is currently unavailable.' };
  }
}

/**
 * Persists the folders selected via the Google Picker.
 **/
export async function saveFoldersAction(
  payload: SaveFoldersPayload,
): Promise<ActionResult<AllowedFolder[]>> {
  return runAction(() => saveFolders(payload));
}

/**
 * Disconnects the Google account from the app.
 **/
export async function disconnectAction(): Promise<ActionResult> {
  return runAction(() => disconnectAccount());
}

/**
 * Mints a short-lived Google Picker access token for the browser.
 **/
export async function pickerTokenAction(): Promise<ActionResult<string>> {
  return runAction(() => getPickerToken());
}
