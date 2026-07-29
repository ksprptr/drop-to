import type { StorageStatus } from '@dropto/types';
import { redirect } from 'next/navigation';

import { getStatuses } from '@/common/services/api/storage.api';
import { getCurrentUser } from '@/common/services/auth/current-user';

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Entry route — redirects to the first connected backend so browsing always lives in /[backend].
 **/
export default async function WorkspaceRootPage({ searchParams }: Props) {
  await getCurrentUser();

  let statuses: StorageStatus[] = [];
  try {
    statuses = await getStatuses();
  } catch {
    statuses = [];
  }

  const backend = statuses.find((status) => status.connected)?.backend ?? 'drive';

  // Preserve query (e.g. the Google OAuth `?connected`/`?error` callback params).
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (typeof value === 'string') {
      params.set(key, value);
    }
  }
  const query = params.toString();

  redirect(`/${backend}${query ? `?${query}` : ''}`);
}
