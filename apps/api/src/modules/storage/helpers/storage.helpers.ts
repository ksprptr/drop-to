import { BadRequestException, RequestTimeoutException } from '@nestjs/common';
import busboy from 'busboy';
import type { Request } from 'express';

import { UploadResultEntity } from '../entities/upload-result.entity';
import { StorageUpload } from '../interfaces/storage-provider.interface';
import { sanitizeUploadFilename } from '../storage.functions';

/** Hands the parsed part straight to the storage backend; never buffers the body. */
type StoreUpload = (upload: StorageUpload) => Promise<UploadResultEntity>;

/**
 * Aborts `controller` if the client disconnects before the request body is complete.
 **/
// A closed socket on an incomplete request is a canceled upload, not a finished one — without this
// the upstream write keeps running against a client that is already gone. The returned stop()
// closes the window between the upload resolving and the listener coming off.
const abortOnClientDisconnect = (req: Request, controller: AbortController): (() => void) => {
  let finished = false;

  const onClose = () => {
    if (!finished && !req.complete) {
      controller.abort();
    }
  };

  req.on('close', onClose);

  return () => {
    finished = true;
    req.off('close', onClose);
  };
};

/**
 * Streams the single file of a multipart request into storage, without ever buffering it.
 **/
// Kept out of the controller, whose job is routing: this is transport plumbing — busboy's event
// API bridged onto a promise, plus the size-limit and client-disconnect handling around it.
export const receiveStreamedUpload = async (
  req: Request,
  maxUploadBytes: number,
  store: StoreUpload,
): Promise<UploadResultEntity> => {
  const abortController = new AbortController();
  const stopAbortWatch = abortOnClientDisconnect(req, abortController);

  try {
    return await new Promise<UploadResultEntity>((resolve, reject) => {
      let parser: ReturnType<typeof busboy>;

      try {
        parser = busboy({ headers: req.headers, limits: { files: 1, fileSize: maxUploadBytes } });
      } catch {
        // Busboy throws when the request carries no (valid) multipart content type.
        reject(new BadRequestException('No file provided.'));
        return;
      }

      let handledFile = false;

      parser.on('file', (_field, stream, info) => {
        handledFile = true;
        // Re-decode busboy's latin1 filename to UTF-8, then reduce it to a single safe path segment.
        const fileName = sanitizeUploadFilename(
          Buffer.from(info.filename ?? 'file', 'latin1').toString('utf8'),
        );

        stream.on('limit', () => {
          reject(new BadRequestException('File exceeds the maximum allowed size.'));
        });

        // Pipe straight to storage; backpressure throttles the request to the upstream speed.
        store({
          body: stream,
          fileName,
          mimeType: info.mimeType || 'application/octet-stream',
          signal: abortController.signal,
        })
          .then(resolve)
          .catch((error: unknown) => {
            stream.resume();
            // A client abort isn't a real failure — surface it as a handled response.
            reject(
              abortController.signal.aborted
                ? new RequestTimeoutException('Upload canceled.')
                : error,
            );
          });
      });

      parser.on('close', () => {
        if (!handledFile) {
          reject(new BadRequestException('No file provided.'));
        }
      });
      parser.on('error', reject);

      req.pipe(parser);
    });
  } finally {
    stopAbortWatch();
  }
};
