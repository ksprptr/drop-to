import type { StorageStatus } from '@dropto/types';
import type { Metadata } from 'next';

import { getStatuses } from '@/common/services/api/storage.api';
import { getCurrentUser } from '@/common/services/auth/current-user';
import WorkspaceClient from '@/components/layouts/WorkspaceClient';

export const metadata: Metadata = {
  title: 'Workspace',
};

/**
 * Workspace route — the Finder-like storage workspace. The proxy gates the route
 * (redirecting unauthenticated visitors); here we resolve the operator and the
 * initial storage statuses on the server so the client mounts with data.
 */
export default async function WorkspacePage() {
  const user = await getCurrentUser();

  let statuses: StorageStatus[] = [];
  try {
    statuses = await getStatuses();
  } catch {
    statuses = [];
  }

  return <WorkspaceClient username={user.username} initialStatuses={statuses} />;
}
