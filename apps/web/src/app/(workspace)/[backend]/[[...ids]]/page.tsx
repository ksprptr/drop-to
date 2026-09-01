import type { StorageBackend, StorageStatus } from '@dropto/types';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

import { getStatuses, resolveNames } from '@/common/services/api/storage.api';
import { getCurrentUser } from '@/common/services/auth/current-user';
import type { Crumb } from '@/common/types/workspace.types';
import { slugify } from '@/common/utils/storage-url';
import WorkspaceClient from '@/components/layouts/WorkspaceClient';
import { appServerConfig } from '@/configs/app/app.server-config';

interface Props {
  params: Promise<{ backend: string; ids?: string[] }>;
}

/**
 * Title for the route — "Page not found" when the URL names no backend.
 **/
// Dynamic on purpose: `notFound()` below streams the not-found head, but the client re-applies this
// segment's metadata after hydration, so a static `title: 'Workspace'` would win back the tab title
// on a 404. Deciding it here keeps the served and the hydrated title the same.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { backend } = await params;

  return backend === 'drive' || backend === 's3'
    ? { title: 'Workspace' }
    : { title: 'Page not found', robots: { index: false, follow: true } };
}

/**
 * Workspace route — resolves the browse location (and breadcrumb) from the URL, server-side.
 **/
export default async function WorkspaceBrowsePage({ params }: Props) {
  const user = await getCurrentUser();
  const { backend, ids } = await params;

  // A URL that names no backend is not a workspace at all, so it gets the real 404 route: HTTP 404
  // and the "Page not found" title. A folder that does not resolve is different — that stays inside
  // the workspace (see `folderNotFound` below), because the sidebar and storage are still valid.
  if (backend !== 'drive' && backend !== 's3') {
    notFound();
  }

  const restIds = (ids ?? []).slice(1);

  const [statuses, resolvedNames] = await Promise.all([
    getStatuses().catch((): StorageStatus[] => []),
    restIds.length > 0
      ? resolveNames(backend, restIds).catch(() => [])
      : Promise.resolve([] as { id: string; name: string; webViewLink: string | null }[]),
  ]);

  const isConnected = statuses.some((status) => status.backend === backend && status.connected);

  // Redirect a disconnected backend to the first connected one (no client "No storage selected").
  if (!isConnected) {
    const fallback = statuses.find((status) => status.connected)?.backend;
    if (fallback && fallback !== backend) {
      redirect(`/${fallback}`);
    }
  }

  // Rebuild the breadcrumb: root (from status, matched by slug) + resolved folder names.
  let initialPath: Crumb[] = [];
  const root = statuses
    .find((status) => status.backend === backend)
    ?.roots.find((candidate) => ids && slugify(candidate.name) === ids[0]);
  if (isConnected && root) {
    const resolvedMap = new Map(resolvedNames.map((entry) => [entry.id, entry]));
    initialPath = [
      { id: root.id, name: root.name, webViewLink: null },
      ...restIds.map((id) => ({
        id,
        name: resolvedMap.get(id)?.name ?? '',
        webViewLink: resolvedMap.get(id)?.webViewLink ?? null,
      })),
    ];
  }

  // Deep link with an unknown root slug or unresolvable folder → 404 in the file area, decided server-side.
  const folderNotFound = Boolean(
    isConnected && ids && ids.length > 0 && (!root || initialPath.some((crumb) => !crumb.name)),
  );

  return (
    <WorkspaceClient
      appName={appServerConfig.name}
      username={user.username}
      initialStatuses={statuses}
      initialBackend={isConnected ? (backend as StorageBackend) : null}
      initialPath={folderNotFound ? [] : initialPath}
      initialNotFound={folderNotFound}
    />
  );
}
