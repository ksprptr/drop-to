import { PrismaService } from '@/prisma/prisma.service';

interface UploadLogSuccess {
  fileName: string;
  folderId: string;
  fileId: string | null | undefined;
  size: number | null;
}

interface UploadLogFailure {
  fileName: string;
  folderId: string;
  error: unknown;
  signal?: AbortSignal;
}

/**
 * Records a successful upload in the audit log (shared by every storage provider).
 **/
export const logUploadSuccess = async (
  prisma: PrismaService,
  entry: UploadLogSuccess,
): Promise<void> => {
  await prisma.uploadLog.create({
    data: {
      fileName: entry.fileName,
      folderId: entry.folderId,
      fileId: entry.fileId ?? null,
      size: entry.size === null ? null : BigInt(entry.size),
      status: 'SUCCESS',
    },
  });
};

/**
 * Records a failed upload — but not a client-cancelled one, which isn't a real failure.
 **/
export const logUploadFailure = async (
  prisma: PrismaService,
  entry: UploadLogFailure,
): Promise<void> => {
  if (entry.signal?.aborted) {
    return;
  }

  await prisma.uploadLog.create({
    data: {
      fileName: entry.fileName,
      folderId: entry.folderId,
      status: 'FAILED',
      error: entry.error instanceof Error ? entry.error.message : String(entry.error),
    },
  });
};
