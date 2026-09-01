'use client';

import { useCallback, useRef } from 'react';

import { pickerTokenAction } from '@/actions/auth/auth.actions';
import { getEnvString } from '@/common/utils/environments.functions';

/** A folder selected through the Google Picker. */
export interface PickedFolder {
  folderId: string;
  name: string;
}

/** A document handed back by the Picker (only the fields this hook reads). */
interface PickerDocument {
  id: string;
  name?: string;
}

/** Payload of the Picker's callback. */
interface PickerCallbackData {
  action: string;
  docs?: PickerDocument[];
}

/** Chainable Picker view builder. */
interface PickerView {
  setSelectFolderEnabled: (enabled: boolean) => PickerView;
  setIncludeFolders: (include: boolean) => PickerView;
  setOwnedByMe: (ownedByMe: boolean) => PickerView;
  setMimeTypes: (mimeTypes: string) => PickerView;
}

/** Chainable Picker builder. */
interface PickerBuilder {
  addView: (view: PickerView) => PickerBuilder;
  enableFeature: (feature: string) => PickerBuilder;
  setOAuthToken: (token: string) => PickerBuilder;
  setDeveloperKey: (apiKey: string) => PickerBuilder;
  setAppId: (appId: string) => PickerBuilder;
  setCallback: (callback: (data: PickerCallbackData) => void) => PickerBuilder;
  build: () => { setVisible: (visible: boolean) => void };
}

/** The slice of the `google.picker` namespace this hook drives. */
interface PickerApi {
  DocsView: new (viewId: string) => PickerView;
  PickerBuilder: new () => PickerBuilder;
  ViewId: { FOLDERS: string };
  Feature: { MULTISELECT_ENABLED: string };
  Action: { PICKED: string };
}

// gapi/Picker ship no bundled types, so the globals are declared structurally.
declare global {
  interface Window {
    gapi?: {
      load: (name: string, callback: () => void) => void;
    };
    google?: {
      picker: PickerApi;
    };
  }
}

const GAPI_SRC = 'https://apis.google.com/js/api.js';

/**
 * Loads an external script once, resolving when ready.
 **/
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
 * Lazily loads the Google Picker (scoped to folders) and returns `openPicker`.
 **/
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
        .setOwnedByMe(true)
        .setMimeTypes('application/vnd.google-apps.folder');

      const builder = new picker.PickerBuilder()
        .addView(view)
        .enableFeature(picker.Feature.MULTISELECT_ENABLED)
        .setOAuthToken(token)
        .setDeveloperKey(apiKey)
        .setCallback((data) => {
          if (data.action !== picker.Action.PICKED) {
            return;
          }

          const folders: PickedFolder[] = (data.docs ?? []).map((doc) => ({
            folderId: doc.id,
            name: doc.name ?? 'Untitled',
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
