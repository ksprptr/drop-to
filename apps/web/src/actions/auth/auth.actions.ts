'use server';

import type { AllowedFolder, SaveFoldersPayload } from '@dropto/types';
import { isAxiosError } from 'axios';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { DRIVE_OWNER_COOKIE } from '@/common/constants/auth.constants';
import {
  disconnectAccount,
  getPickerToken,
  removeFolder,
  saveFolders,
} from '@/common/services/api/auth.api';
import {
  applyAuthCookies,
  clearAuthCookies,
  parseAuthSetCookies,
  type ParsedSetCookie,
} from '@/common/services/auth/tokens.server';
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
export async function login(password: string): Promise<LoginResult> {
  try {
    const http = await getHttp();
    const response = await http.post('/auth/login', { password });

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
      return { ok: false, error: extractApiError(error) ?? 'Invalid password.' };
    }

    return { ok: false, error: 'The API is currently unavailable.' };
  }
}

/**
 * Revokes the session at the API, clears the auth cookies and returns to the login page.
 **/
// An action rather than a GET route: Next prefetches `<Link>` targets in production builds, so a
// linked sign-out URL is followed the moment the header renders — signing the operator straight
// back out. A POST is never prefetched, and Server Actions carry their own origin check.
export async function logout(): Promise<never> {
  const cookieStore = await cookies();
  let cleared: ParsedSetCookie[] = [];

  try {
    const http = await getHttp();
    const { headers } = await http.post('/auth/logout');

    // The API's own clearing cookies carry the Domain it set them with — forwarding them is what makes the delete land.
    cleared = parseAuthSetCookies(
      Array.isArray(headers['set-cookie']) ? headers['set-cookie'] : undefined,
    );
  } catch {
    // Unreachable API — the session stays alive server-side, but clear locally below regardless.
  }

  if (cleared.length > 0) {
    applyAuthCookies(cookieStore, cleared);
  } else {
    clearAuthCookies(cookieStore);
  }

  // The owner proof belongs to this browser session too — a sign-out must not leave it behind.
  cookieStore.delete(DRIVE_OWNER_COOKIE);

  // Outside the try: `redirect` reports through a thrown error the catch above must not swallow.
  redirect('/login');
}

/**
 * Clears the Drive owner-proof cookie (on disconnect).
 **/
export async function revokeDriveOwnerAction(): Promise<void> {
  (await cookies()).delete(DRIVE_OWNER_COOKIE);
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
 * Removes a single authorized folder (unselect); owner-gated by the API.
 **/
export async function removeFolderAction(folderId: string): Promise<ActionResult> {
  return runAction(() => removeFolder(folderId));
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
