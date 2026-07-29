import type { StorageBackend } from '@dropto/types';

import type { Crumb } from '@/common/types/workspace.types';

/**
 * Slugifies a root folder name for a readable URL segment (empty → "folder").
 **/
export const slugify = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'folder';

/**
 * Builds the workspace URL for a location: /<backend>/<rootSlug>/<id…> (path[0] is the root).
 **/
export const buildWorkspaceUrl = (backend: StorageBackend, path: Crumb[]): string => {
  if (path.length === 0) {
    return `/${backend}`;
  }

  const [root, ...rest] = path;
  const segments = [slugify(root.name), ...rest.map((crumb) => encodeURIComponent(crumb.id))];

  return `/${backend}/${segments.join('/')}`;
};
