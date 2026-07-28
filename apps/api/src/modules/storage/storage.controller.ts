import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  RequestTimeoutException,
  Res,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiConsumes,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import busboy from 'busboy';
import type { Request, Response } from 'express';

import { ResponseEntity } from '@/common/entities/response.entity';
import { AllowedFolderEntity } from '@/modules/google-auth/entities/allowed-folder.entity';

import { CreateSubfolderDto } from './dto/create-subfolder.dto';
import { MoveItemDto } from './dto/move-item.dto';
import { RenameItemDto } from './dto/rename-item.dto';
import { DriveEntryEntity } from './entities/drive-entry.entity';
import { StorageStatusEntity } from './entities/storage-status.entity';
import { UploadResultEntity } from './entities/upload-result.entity';
import { sanitizeUploadFilename } from './storage.functions';
import { StorageRegistry } from './storage.registry';

// 10 GiB ceiling; the file is streamed straight through to storage (never buffered).
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024 * 1024;

/**
 * Backend-agnostic: each route resolves the `:backend` provider from the StorageRegistry.
 **/
@ApiTags('Storage')
@ApiCookieAuth('accessToken')
@ApiUnauthorizedResponse({ type: ResponseEntity, description: 'Unauthorized' })
@ApiParam({ name: 'backend', enum: ['drive', 's3'], description: 'Storage backend key' })
@Controller('storage')
export class StorageController {
  constructor(private readonly registry: StorageRegistry) {}

  @ApiOperation({ summary: 'Get the status of every storage backend' })
  @ApiOkResponse({ type: [StorageStatusEntity], description: 'Per-backend status' })
  @Get('status')
  async getStatuses(): Promise<StorageStatusEntity[]> {
    return Promise.all(this.registry.all().map((provider) => provider.status()));
  }

  @ApiOperation({ summary: 'List the browse roots of a backend' })
  @ApiOkResponse({ type: [AllowedFolderEntity], description: 'Successful' })
  @Get(':backend/folders')
  async getFolders(@Param('backend') backend: string): Promise<AllowedFolderEntity[]> {
    return this.registry.resolve(backend).listRoots();
  }

  @ApiOperation({ summary: 'List the contents of a folder' })
  @ApiOkResponse({ type: [DriveEntryEntity], description: 'Successful' })
  @ApiForbiddenResponse({ type: ResponseEntity, description: 'Folder outside authorized tree' })
  @Get(':backend/folders/:id/contents')
  async getContents(
    @Param('backend') backend: string,
    @Param('id') id: string,
  ): Promise<DriveEntryEntity[]> {
    return this.registry.resolve(backend).listContents(id);
  }

  @ApiOperation({ summary: 'Resolve display names for a set of ids (breadcrumb rebuild)' })
  @ApiOkResponse({ description: 'Id → name pairs' })
  @Get(':backend/names')
  async resolveNames(
    @Param('backend') backend: string,
    @Query('ids') ids?: string,
  ): Promise<Array<{ id: string; name: string }>> {
    const list = (ids ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);

    return list.length === 0 ? [] : this.registry.resolve(backend).resolveNames(list);
  }

  @ApiOperation({ summary: 'Download a file' })
  @ApiOkResponse({ description: 'File stream' })
  @ApiForbiddenResponse({ type: ResponseEntity, description: 'File outside authorized tree' })
  @Get(':backend/files/:id/download')
  async downloadFile(
    @Param('backend') backend: string,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const { stream, name, mimeType, size } = await this.registry.resolve(backend).downloadFile(id);

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', this.contentDisposition(name));
    res.setHeader('Accept-Ranges', 'none');
    // A known Content-Length gives the browser real download progress.
    if (size !== null) {
      res.setHeader('Content-Length', String(size));
    }

    stream.pipe(res);
  }

  @ApiOperation({ summary: 'Download a folder as a ZIP archive' })
  @ApiOkResponse({ description: 'ZIP stream' })
  @ApiForbiddenResponse({ type: ResponseEntity, description: 'Folder outside authorized tree' })
  @Get(':backend/folders/:id/download')
  async downloadFolder(
    @Param('backend') backend: string,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const { archive, name } = await this.registry.resolve(backend).createFolderArchive(id);

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', this.contentDisposition(`${name}.zip`));
    res.setHeader('Accept-Ranges', 'none');
    res.flushHeaders();

    archive.pipe(res);
  }

  /**
   * Content-Disposition with an ASCII fallback + UTF-8 variant for non-ASCII names.
   **/
  private contentDisposition(fileName: string): string {
    const asciiFallback = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '');

    return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
  }

  @ApiOperation({ summary: 'Create a subfolder' })
  @ApiCreatedResponse({ type: DriveEntryEntity, description: 'Folder created' })
  @ApiBadRequestResponse({ type: ResponseEntity, description: 'Validation failed' })
  @ApiForbiddenResponse({ type: ResponseEntity, description: 'Folder outside authorized tree' })
  @Post(':backend/folders/:id/subfolder')
  async createSubfolder(
    @Param('backend') backend: string,
    @Param('id') id: string,
    @Body() createSubfolderDto: CreateSubfolderDto,
  ): Promise<DriveEntryEntity> {
    return this.registry.resolve(backend).createFolder(id, createSubfolderDto.name);
  }

  @ApiOperation({ summary: 'Upload a file into a folder' })
  @ApiConsumes('multipart/form-data')
  @ApiCreatedResponse({ type: UploadResultEntity, description: 'File uploaded' })
  @ApiBadRequestResponse({ type: ResponseEntity, description: 'No file provided' })
  @ApiForbiddenResponse({ type: ResponseEntity, description: 'Folder outside authorized tree' })
  @Post(':backend/folders/:id/upload')
  async uploadFile(
    @Param('backend') backend: string,
    @Param('id') id: string,
    @Req() req: Request,
  ): Promise<UploadResultEntity> {
    const provider = this.registry.resolve(backend);

    // Abort the upload if the client disconnects mid-stream (req.complete stays false).
    const abortController = new AbortController();
    let finished = false;
    const onClose = () => {
      if (!finished && !req.complete) {
        abortController.abort();
      }
    };
    req.on('close', onClose);

    try {
      return await new Promise<UploadResultEntity>((resolve, reject) => {
        let bb: ReturnType<typeof busboy>;
        try {
          bb = busboy({ headers: req.headers, limits: { files: 1, fileSize: MAX_UPLOAD_BYTES } });
        } catch {
          reject(new BadRequestException('No file provided.'));
          return;
        }
        let handledFile = false;

        bb.on('file', (_field, stream, info) => {
          handledFile = true;
          // Busboy decodes the filename as latin1; re-decode to UTF-8, then reduce to a single safe
          // path segment so it can't write to an unintended key prefix / Drive name.
          const fileName = sanitizeUploadFilename(
            Buffer.from(info.filename ?? 'file', 'latin1').toString('utf8'),
          );
          const mimeType = info.mimeType || 'application/octet-stream';

          stream.on('limit', () => {
            reject(new BadRequestException('File exceeds the maximum allowed size.'));
          });

          // Pipe straight to storage; backpressure throttles the request to the upstream speed.
          provider
            .uploadFile(id, { body: stream, fileName, mimeType, signal: abortController.signal })
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

        bb.on('close', () => {
          if (!handledFile) {
            reject(new BadRequestException('No file provided.'));
          }
        });
        bb.on('error', reject);

        req.pipe(bb);
      });
    } finally {
      finished = true;
      req.off('close', onClose);
    }
  }

  @ApiOperation({ summary: 'Rename a file or subfolder' })
  @ApiOkResponse({ type: DriveEntryEntity, description: 'Item renamed' })
  @ApiBadRequestResponse({ type: ResponseEntity, description: 'Validation failed' })
  @ApiForbiddenResponse({ type: ResponseEntity, description: 'Item outside authorized tree' })
  @ApiConflictResponse({ type: ResponseEntity, description: 'Root folders cannot be renamed' })
  @Patch(':backend/files/:id/rename')
  async renameFile(
    @Param('backend') backend: string,
    @Param('id') id: string,
    @Body() renameItemDto: RenameItemDto,
  ): Promise<DriveEntryEntity> {
    return this.registry.resolve(backend).renameItem(id, renameItemDto.name);
  }

  @ApiOperation({ summary: 'Move a file or subfolder into another folder' })
  @ApiOkResponse({ type: DriveEntryEntity, description: 'Item moved' })
  @ApiBadRequestResponse({ type: ResponseEntity, description: 'Invalid move target' })
  @ApiForbiddenResponse({ type: ResponseEntity, description: 'Item or target outside authorized tree' })
  @ApiConflictResponse({ type: ResponseEntity, description: 'Root folders cannot be moved' })
  @Patch(':backend/files/:id/move')
  async moveFile(
    @Param('backend') backend: string,
    @Param('id') id: string,
    @Body() moveItemDto: MoveItemDto,
  ): Promise<DriveEntryEntity> {
    return this.registry.resolve(backend).moveItem(id, moveItemDto.targetFolderId);
  }

  @ApiOperation({ summary: 'Delete a file or subfolder' })
  @ApiNoContentResponse({ description: 'No content' })
  @ApiForbiddenResponse({ type: ResponseEntity, description: 'Item outside authorized tree' })
  @ApiConflictResponse({ type: ResponseEntity, description: 'Root folders cannot be deleted' })
  @HttpCode(204)
  @Delete(':backend/files/:id')
  async deleteFile(@Param('backend') backend: string, @Param('id') id: string): Promise<void> {
    await this.registry.resolve(backend).deleteItem(id);
  }
}
