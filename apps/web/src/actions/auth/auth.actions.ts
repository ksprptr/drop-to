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
 * Server Action: signs the operator in. Posts credentials to the API and writes
 * the returned auth cookies onto the browser (tokens never reach the browser as
 * JS values). The proxy handles the already-authenticated redirect.
 * @param username - The operator username
 * @param password - The operator password
 * @returns Whether the sign-in succeeded, with a message on failure
 */
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
    // An HTTP response (any status) means the API rejected the request → bad
    // credentials. No response means the API is unreachable.
    if (isAxiosError(error) && error.response) {
      return { ok: false, error: extractApiError(error) ?? 'Invalid username or password.' };
    }

    return { ok: false, error: 'The API is currently unavailable.' };
  }
}

/**
 * Server Action: persists the folders selected via the Google Picker.
 * @param payload - The selected folders (id + name)
 * @returns The saved allowed folders
 */
export async function saveFoldersAction(
  payload: SaveFoldersPayload,
): Promise<ActionResult<AllowedFolder[]>> {
  return runAction(() => saveFolders(payload));
}

/**
 * Server Action: disconnects the Google account from the app.
 * @returns The result of the disconnect
 */
export async function disconnectAction(): Promise<ActionResult> {
  return runAction(() => disconnectAccount());
}

/**
 * Server Action: mints a short-lived Google Picker access token for the browser.
 * @returns The token result
 */
export async function pickerTokenAction(): Promise<ActionResult<string>> {
  return runAction(() => getPickerToken());
}
