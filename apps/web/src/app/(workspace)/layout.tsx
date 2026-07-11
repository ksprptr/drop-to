import type { PropsWithChildren } from 'react';

/**
 * Workspace layout — a thin wrapper for the authenticated workspace routes.
 */
export default function WorkspaceLayout({ children }: Readonly<PropsWithChildren>) {
  return <>{children}</>;
}
