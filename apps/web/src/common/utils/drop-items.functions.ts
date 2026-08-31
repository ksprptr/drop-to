import type { UploadItem } from '@/common/types/workspace.types';

/**
 * Reads all entries from a directory reader (≤100 per call).
 **/
const readAllEntries = (reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> =>
  new Promise((resolve, reject) => reader.readEntries(resolve, reject));

/**
 * Resolves a file entry into a File.
 **/
const entryToFile = (entry: FileSystemFileEntry): Promise<File> =>
  new Promise((resolve, reject) => entry.file(resolve, reject));

/**
 * Recursively walks a dropped entry into flat upload items.
 **/
const walkEntry = async (
  entry: FileSystemEntry,
  prefix: string,
  out: UploadItem[],
): Promise<void> => {
  if (entry.isFile) {
    const file = await entryToFile(entry as FileSystemFileEntry);
    out.push({ file, relativePath: `${prefix}${entry.name}` });
    return;
  }

  const reader = (entry as FileSystemDirectoryEntry).createReader();
  let batch = await readAllEntries(reader);
  while (batch.length > 0) {
    for (const child of batch) {
      // eslint-disable-next-line no-await-in-loop -- sequential walk into a shared, ordered list
      await walkEntry(child, `${prefix}${entry.name}/`, out);
    }
    // eslint-disable-next-line no-await-in-loop -- the directory reader is stateful; read in sequence
    batch = await readAllEntries(reader);
  }
};

/**
 * Dropped items → flat upload items (falls back to the plain file list).
 **/
export const resolveDropItems = async (
  entries: FileSystemEntry[],
  flatFiles: File[],
): Promise<UploadItem[]> => {
  if (entries.length === 0) {
    return flatFiles.map((file) => ({ file, relativePath: file.name }));
  }

  const out: UploadItem[] = [];
  for (const entry of entries) {
    // eslint-disable-next-line no-await-in-loop -- entries walked sequentially into an ordered list
    await walkEntry(entry, '', out);
  }
  return out;
};

/**
 * Picks the icon name for a file's MIME type.
 **/
export const fileIcon = (mimeType: string | null): string => {
  if (!mimeType) return 'Document';
  if (mimeType.startsWith('image/')) return 'Photo';
  if (mimeType.startsWith('video/')) return 'Film';
  if (mimeType.startsWith('audio/')) return 'MusicalNote';
  if (mimeType === 'application/pdf') return 'DocumentText';
  if (mimeType.includes('zip') || mimeType.includes('compressed')) return 'ArchiveBox';
  return 'Document';
};
