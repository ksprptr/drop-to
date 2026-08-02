import type { StorageBackend, StorageStatus } from '@dropto/types';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { getStatuses, resolveNames } from '@/common/services/api/storage.api';
import { getCurrentUser } from '@/common/services/auth/current-user';
import type { Crumb } from '@/common/types/workspace.types';
import { slugify } from '@/common/utils/storage-url';
import NotFoundContent from '@/components/layouts/NotFoundContent';
import WorkspaceClient from '@/components/layouts/WorkspaceClient';

export const metadata: Metadata = {
  title: 'Workspace',
};

interface Props {
  params: Promise<{ backend: string; ids?: string[] }>;
}

/**
 * Workspace route — resolves the browse location (and breadcrumb) from the URL, server-side.
 **/
export default async function WorkspaceBrowsePage({ params }: Props) {
  const user = await getCurrentUser();
  const { backend, ids } = await params;

  // Unknown backend → full-page 404; rendered inline (not notFound()) to avoid the next-themes script-tag warning.
  if (backend !== 'drive' && backend !== 's3') {
    return <NotFoundContent />;
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
      username={user.username}
      initialStatuses={statuses}
      initialBackend={isConnected ? (backend as StorageBackend) : null}
      initialPath={folderNotFound ? [] : initialPath}
      initialNotFound={folderNotFound}
    />
  );
}
