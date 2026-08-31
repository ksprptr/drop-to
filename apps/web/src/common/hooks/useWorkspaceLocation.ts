'use client';

import type { StorageBackend, StorageStatus } from '@dropto/types';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import { resolvePathAction } from '@/actions/storage/storage.actions';
import type { Crumb, SortDir, SortKey, ViewEntry } from '@/common/types/workspace.types';
import { buildWorkspaceUrl, slugify } from '@/common/utils/storage-url';

interface Options {
  statuses: StorageStatus[];
  /** Backend from the URL (already validated connected), for first paint without a flash. */
  initialBackend?: StorageBackend | null;
  /** Breadcrumb resolved server-side, so a deep link paints with real names. */
  initialPath?: Crumb[];
  /** The URL points at a folder that doesn't exist / isn't authorized (server-detected 404). */
  initialNotFound?: boolean;
  /** Called whenever the location changes, so the workspace can drop the preview. */
  onLocationChange: () => void;
}

/**
 * First connected backend (or null) — used to auto-select a storage.
 **/
const pickDefaultBackend = (statuses: StorageStatus[]): StorageBackend | null =>
  statuses.find((status) => status.connected)?.backend ?? null;

/**
 * The browse location, derived from the URL: which backend, which folder path, and the sort.
 **/
// The URL is the source of truth. Navigation writes to window.history (no server round-trip) and
// this hook reads it back, so the back button and a shared deep link behave identically.
export function useWorkspaceLocation({
  statuses,
  initialBackend,
  initialPath,
  initialNotFound,
  onLocationChange,
}: Options) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [activeBackend, setActiveBackend] = useState<StorageBackend | null>(initialBackend ?? null);
  const [path, setPath] = useState<Crumb[]>(initialPath ?? []);

  // id → display name, so navigating (and rebuilding a deep-linked breadcrumb) shows real names.
  const nameCache = useRef<Map<string, string>>(
    new Map((initialPath ?? []).map((crumb) => [crumb.id, crumb.name])),
  );
  // id → Drive web-view link, so the breadcrumb / toolbar "Copy link" always points at the real folder.
  const linkCache = useRef<Map<string, string | null>>(
    new Map((initialPath ?? []).map((crumb) => [crumb.id, crumb.webViewLink])),
  );

  // Server-detected 404 (bad folder URL): shown in the file area until the operator navigates away.
  const notFoundPathname = useRef(initialNotFound ? pathname : null);
  const notFound = notFoundPathname.current !== null && notFoundPathname.current === pathname;

  const currentFolderId = path.length > 0 ? path[path.length - 1].id : null;
  const atRoots = path.length === 0;

  // Sort lives in the URL query (?sort=&dir=) so it's shareable; the main pane is controlled by it.
  const sortParam = searchParams.get('sort');
  const sortKey: SortKey = sortParam === 'modified' || sortParam === 'size' ? sortParam : 'name';
  const sortDir: SortDir = searchParams.get('dir') === 'desc' ? 'desc' : 'asc';

  // Derive the browse location from the URL; navigation updates it via window.history (no server round-trip).
  useEffect(() => {
    const segments = pathname.split('/').filter(Boolean).map(decodeURIComponent);
    const paramBackend = segments[0] === 'drive' || segments[0] === 's3' ? segments[0] : null;
    const connected = statuses.filter((status) => status.connected).map((status) => status.backend);

    // Server-detected 404: keep the sidebar (select the backend) but don't load the bad folder.
    if (notFound) {
      if (paramBackend && connected.includes(paramBackend)) {
        setActiveBackend(paramBackend);
      }
      setPath([]);
      return;
    }

    // Only connected backends are browsable; redirect away from an unknown/disconnected URL.
    if (paramBackend === null || !connected.includes(paramBackend)) {
      const fallback = pickDefaultBackend(statuses);
      if (fallback === null) {
        setActiveBackend(null);
        setPath([]);
        onLocationChange();
        return;
      }
      router.replace(`/${fallback}`);
      return;
    }

    const backend = paramBackend;
    const backendRoots = statuses.find((status) => status.backend === backend)?.roots ?? [];
    const folderSegs = segments.slice(1);
    const root =
      folderSegs.length > 0 && backendRoots.find((r) => slugify(r.name) === folderSegs[0]);

    if (!root) {
      setActiveBackend(backend);
      setPath([]);
      onLocationChange();
      return;
    }

    // Names/links come from the cache so the breadcrumb paints instantly; any gap is filled once below.
    const restIds = folderSegs.slice(1);
    setActiveBackend(backend);
    setPath([
      { id: root.id, name: root.name, webViewLink: null },
      ...restIds.map((id) => ({
        id,
        name: nameCache.current.get(id) ?? '',
        webViewLink: linkCache.current.get(id) ?? null,
      })),
    ]);
    onLocationChange();

    const missing = restIds.filter(
      (id) => !nameCache.current.has(id) || !linkCache.current.has(id),
    );
    if (missing.length === 0) {
      return;
    }

    let cancelled = false;
    void (async () => {
      const result = await resolvePathAction(backend, missing);
      if (cancelled || !result.ok) {
        return;
      }
      for (const pair of result.data ?? []) {
        nameCache.current.set(pair.id, pair.name);
        linkCache.current.set(pair.id, pair.webViewLink);
      }
      setPath((current) =>
        current.map((crumb) => ({
          ...crumb,
          name: nameCache.current.get(crumb.id) ?? crumb.name,
          webViewLink: linkCache.current.get(crumb.id) ?? crumb.webViewLink,
        })),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [pathname, statuses, router]);
  const openFolder = useCallback(
    (entry: ViewEntry) => {
      if (activeBackend === null) {
        return;
      }
      nameCache.current.set(entry.id, entry.name);
      linkCache.current.set(entry.id, entry.webViewLink);
      const url = buildWorkspaceUrl(activeBackend, [
        ...path,
        { id: entry.id, name: entry.name, webViewLink: entry.webViewLink },
      ]);
      window.history.pushState(null, '', url);
    },
    [activeBackend, path],
  );

  const navigate = useCallback(
    (index: number) => {
      if (activeBackend === null) {
        return;
      }
      const url = buildWorkspaceUrl(activeBackend, index < 0 ? [] : path.slice(0, index + 1));
      window.history.pushState(null, '', url);
    },
    [activeBackend, path],
  );

  const selectStorage = useCallback((backend: StorageBackend) => {
    window.history.pushState(null, '', `/${backend}`);
  }, []);

  const handleToggleSort = useCallback(
    (key: SortKey) => {
      const nextDir: SortDir = key === sortKey ? (sortDir === 'asc' ? 'desc' : 'asc') : 'asc';
      const base = activeBackend
        ? buildWorkspaceUrl(activeBackend, path)
        : window.location.pathname;
      // Default (name/asc) stays out of the URL to keep it clean.
      const query = key === 'name' && nextDir === 'asc' ? '' : `?sort=${key}&dir=${nextDir}`;
      window.history.replaceState(null, '', `${base}${query}`);
    },
    [sortKey, sortDir, activeBackend, path],
  );

  return {
    activeBackend,
    path,
    currentFolderId,
    atRoots,
    notFound,
    sortKey,
    sortDir,
    openFolder,
    navigate,
    selectStorage,
    toggleSort: handleToggleSort,
  };
}
