'use client';

import { useCallback, useRef } from 'react';

import { pickerTokenAction } from '@/actions/auth/auth.actions';
import { getEnvString } from '@/common/utils/environments.functions';

/** A folder selected through the Google Picker. */
export interface PickedFolder {
  folderId: string;
  name: string;
}

// The Picker/gapi globals are injected by external scripts and have no bundled
// types, so they are accessed loosely through `window`.
declare global {
  interface Window {
    gapi?: {
      load: (name: string, callback: () => void) => void;
    };
    google?: {
      picker: any;
    };
  }
}

const GAPI_SRC = 'https://apis.google.com/js/api.js';

/**
 * Function to load an external script once, resolving when it is ready.
 * @param src - The script URL
 * @returns A promise that resolves when the script has loaded
 */
const loadScript = (src: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);

    if (existing) {
      if (existing.dataset.loaded === 'true') {
        resolve();
      } else {
        existing.addEventListener('load', () => resolve());
        existing.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)));
      }
      return;
    }

    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => {
      script.dataset.loaded = 'true';
      resolve();
    };
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.body.appendChild(script);
  });
};

/**
 * Hook that lazily loads the Google Picker and opens it scoped to folders.
 *
 * The Picker is authorized with a short-lived access token minted by the API
 * from the stored refresh token, so the browser never handles OAuth directly.
 * @returns An `openPicker` function that resolves selected folders via callback
 */
export function usePicker() {
  const pickerLoaded = useRef(false);

  const ensurePicker = useCallback(async (): Promise<void> => {
    await loadScript(GAPI_SRC);

    if (pickerLoaded.current) {
      return;
    }

    await new Promise<void>((resolve) => {
      window.gapi!.load('picker', () => {
        pickerLoaded.current = true;
        resolve();
      });
    });
  }, []);

  const openPicker = useCallback(
    async (onPicked: (folders: PickedFolder[]) => void): Promise<void> => {
      await ensurePicker();

      const tokenResult = await pickerTokenAction();
      if (!tokenResult.ok || !tokenResult.data) {
        throw new Error(tokenResult.error ?? 'Failed to authorize the Google Picker.');
      }
      const token = tokenResult.data;
      const apiKey = getEnvString({ key: 'NEXT_PUBLIC_GOOGLE_API_KEY' });
      const appId = getEnvString({ key: 'NEXT_PUBLIC_GOOGLE_APP_ID' });
      const picker = window.google!.picker;

      const view = new picker.DocsView(picker.ViewId.FOLDERS)
        .setSelectFolderEnabled(true)
        .setIncludeFolders(true)
        .setMimeTypes('application/vnd.google-apps.folder');

      const builder = new picker.PickerBuilder()
        .addView(view)
        .enableFeature(picker.Feature.MULTISELECT_ENABLED)
        .setOAuthToken(token)
        .setDeveloperKey(apiKey)
        .setCallback((data: any) => {
          if (data.action !== picker.Action.PICKED) {
            return;
          }

          const folders: PickedFolder[] = (data.docs ?? []).map((doc: any) => ({
            folderId: doc.id as string,
            name: (doc.name as string) ?? 'Untitled',
          }));

          onPicked(folders);
        });

      if (appId) {
        builder.setAppId(appId);
      }

      builder.build().setVisible(true);
    },
    [ensurePicker],
  );

  return { openPicker };
}
