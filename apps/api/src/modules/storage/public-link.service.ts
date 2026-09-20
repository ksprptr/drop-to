import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';

import { type AppConfig, appConfig } from '@/config/app.config';
import { PrismaService } from '@/prisma/prisma.service';

import { PublicLinkEntity } from './entities/public-link.entity';
import { StorageRegistry } from './storage.registry';

/** 16 random bytes → 22 base64url chars; the link's whole security rests on guessing this. */
const TOKEN_BYTES = 16;

/** Path the web app serves public links from (`/f/<token>/<name>`). */
const PUBLIC_LINK_PATH = 'f';

/** A resolved link plus the item it points at. */
export interface ResolvedPublicLink {
  backend: string;
  itemId: string;
  fileName: string;
}

/**
 * Mints, resolves and revokes the public share links for stored files.
 **/
// The links are only ever an *entry point*: every fetch still goes through the provider's own scope
// check, so a token can never reach a file outside the authorized tree even if a row were forged.
@Injectable()
export class PublicLinkService {
  private readonly logger = new Logger(PublicLinkService.name);

  constructor(
    private readonly prismaService: PrismaService,
    private readonly registry: StorageRegistry,
    @Inject(appConfig.KEY) private readonly appCfg: AppConfig,
  ) {}

  /**
   * Creates (or replaces) the public link for a file and returns it.
   **/
  // Links never expire: the operator revokes with one click, which is the whole lifecycle they need.
  async create(backend: string, itemId: string): Promise<PublicLinkEntity> {
    const provider = this.registry.resolve(backend);

    // Authorization-checked in both providers: an id outside the allowed scope throws, and Drive
    // reports an unreachable item as an empty name rather than raising.
    const [resolved] = await provider.resolveNames([itemId]);
    if (!resolved || resolved.name === '') {
      throw new NotFoundException('This item no longer exists.');
    }

    const token = randomBytes(TOKEN_BYTES).toString('base64url');

    // Re-sharing a file replaces its link rather than accumulating tokens for the same item.
    const link = await this.prismaService.publicLink.upsert({
      where: { backend_itemId: { backend, itemId } },
      create: { token, backend, itemId, fileName: resolved.name },
      update: { token, fileName: resolved.name },
    });

    this.logger.log(`Created a public link for a ${backend} item.`);

    return this.toEntity(link);
  }

  /**
   * Revokes the public link of a file; revoking a file that has none is a no-op.
   **/
  async remove(backend: string, itemId: string): Promise<void> {
    // Resolves for the kill-switch alone: a disabled backend must not be manageable either.
    this.registry.resolve(backend);

    const { count } = await this.prismaService.publicLink.deleteMany({
      where: { backend, itemId },
    });

    if (count > 0) {
      this.logger.log(`Revoked a public link for a ${backend} item.`);
    }
  }

  /**
   * Resolves a token to the item it points at; 404 once it has been revoked.
   **/
  async resolve(token: string): Promise<ResolvedPublicLink> {
    const link = await this.prismaService.publicLink.findUnique({ where: { token } });

    if (!link) {
      throw new NotFoundException('This link is no longer available.');
    }

    return { backend: link.backend, itemId: link.itemId, fileName: link.fileName };
  }

  /**
   * Public URLs for a set of items, so a folder listing can show which files are shared.
   **/
  async urlsForItems(backend: string, itemIds: string[]): Promise<Map<string, string>> {
    if (itemIds.length === 0) {
      return new Map();
    }

    const links = await this.prismaService.publicLink.findMany({
      where: { backend, itemId: { in: itemIds } },
    });

    return new Map(links.map((link) => [link.itemId, this.urlFor(link.token, link.fileName)]));
  }

  /**
   * Builds the shareable URL; it points at the web app, which proxies the API's public route.
   **/
  private urlFor(token: string, fileName: string): string {
    // The name is cosmetic but keeps the extension in the URL, so images preview inline in chat apps.
    return `${this.appCfg.webAppUrl.replace(/\/$/, '')}/${PUBLIC_LINK_PATH}/${token}/${encodeURIComponent(fileName)}`;
  }

  /**
   * Maps a stored row to the wire entity.
   **/
  private toEntity(link: { token: string; fileName: string; createdAt: Date }): PublicLinkEntity {
    return {
      token: link.token,
      url: this.urlFor(link.token, link.fileName),
      fileName: link.fileName,
      createdAt: link.createdAt.toISOString(),
    };
  }
}
