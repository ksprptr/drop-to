'use server';

import type { AllowedFolder, SaveFoldersPayload } from '@dropto/types';
import { isAxiosError } from 'axios';
import { cookies } from 'next/headers';

import { DRIVE_OWNER_COOKIE } from '@/common/constants/auth.constants';
import {
  disconnectAccount,
  getPickerToken,
  removeFolder,
  saveFolders,
} from '@/common/services/api/auth.api';
import { applyAuthCookies, parseAuthSetCookies } from '@/common/services/auth/tokens.server';
import { getHttp } from '@/common/services/axios/axios.instance';
import { type ActionResult, extractApiError, runAction } from '@/common/utils/action.functions';
import { appServerConfig } from '@/configs/app/app.server-config';

/** Owner-proof cookie lifetime — mirrors the API's DRIVE_OWNER_TTL_MS (30 days). */
const DRIVE_OWNER_MAX_AGE_S = 30 * 24 * 60 * 60;

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
 * Stores the Drive owner-proof (minted by the API on OAuth connect) in an httpOnly cookie, so the browser that connected the account can manage/disconnect it. Forwarded to the API on those calls.
 **/
export async function claimDriveOwnerAction(token: string): Promise<void> {
  const { isProduction } = appServerConfig.nodeEnv;

  (await cookies()).set(DRIVE_OWNER_COOKIE, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    domain: isProduction ? appServerConfig.cookieDomain : undefined,
    maxAge: DRIVE_OWNER_MAX_AGE_S,
  });
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
