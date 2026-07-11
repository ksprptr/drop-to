'use client';

import AuthGate from '@/components/layouts/AuthGate';
import WorkspaceClient from '@/components/layouts/WorkspaceClient';

/**
 * Workspace route — the Finder-like Drive workspace, gated behind operator login.
 */
export default function WorkspacePage() {
  return <AuthGate>{(user) => <WorkspaceClient username={user.username} />}</AuthGate>;
}
