/**
 * Top-level segment of an item's path (file name, or the folder it lives in).
 **/
export const topLevelName = (relativePath: string): string => {
  const slash = relativePath.indexOf('/');
  return slash === -1 ? relativePath : relativePath.slice(0, slash);
};

/**
 * Whether the item lives inside a folder.
 **/
export const isTopLevelFolder = (relativePath: string): boolean => relativePath.includes('/');

/**
 * Name unique among `existing`, appending " (1)", " (2)"… before the extension.
 **/
export const uniqueName = (name: string, existing: Set<string>): string => {
  if (!existing.has(name)) {
    return name;
  }

  const dot = name.lastIndexOf('.');
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';

  let counter = 1;
  while (existing.has(`${base} (${counter})${ext}`)) {
    counter += 1;
  }

  return `${base} (${counter})${ext}`;
};
