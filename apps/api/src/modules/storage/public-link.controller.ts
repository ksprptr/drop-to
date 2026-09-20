import { Controller, Get, Param, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Response } from 'express';

import { Public } from '@/common/decorators/public.decorator';
import { RateLimit } from '@/common/services/rate-limit/decorators/rate-limit.decorator';

import { PublicLinkService } from './public-link.service';
import { contentDisposition, isInlineSafeMimeType } from './storage.functions';
import { StorageRegistry } from './storage.registry';

/**
 * Serves files behind a public share token — the one route on the API with no session at all.
 **/
// Unauthenticated and world-reachable, so it stays deliberately thin: resolve the token, hand the
// request to the provider (which re-checks the item's scope), stream. Nothing else.
@ApiExcludeController()
@Controller('public')
export class PublicLinkController {
  constructor(
    private readonly publicLinkService: PublicLinkService,
    private readonly registry: StorageRegistry,
  ) {}

  /**
   * Resolves a share token and streams the file it points at.
   **/
  // The bytes are proxied rather than the viewer being redirected to a signed storage URL: a signed
  // URL is a standalone credential that outlives revocation (it never reaches this app again), and
  // it would put the storage endpoint in the viewer's address bar. Streaming costs the app the
  // bandwidth and buys revocation that takes effect on the very next request.
  @Public()
  // Generous enough for a page of embedded images, tight enough that the token space can't be swept.
  @RateLimit({ points: 120, duration: 60 })
  @Get(':token')
  async serve(@Param('token') token: string, @Res() res: Response): Promise<void> {
    const link = await this.publicLinkService.resolve(token);
    // 404s when that backend has since been switched off in the env, like every other storage route.
    const provider = this.registry.resolve(link.backend);

    const { stream, name, mimeType, size } = await provider.downloadFile(link.itemId);
    const inline = isInlineSafeMimeType(mimeType);

    res.setHeader('Content-Type', mimeType);
    res.setHeader(
      'Content-Disposition',
      contentDisposition(inline ? 'inline' : 'attachment', name),
    );
    // Never let the browser second-guess the type — a sniffed text/html would run as a page here.
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // Uncached on purpose: a cached copy would keep answering after the link is revoked, which is
    // the guarantee this route exists to provide.
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Accept-Ranges', 'none');
    if (size !== null) {
      res.setHeader('Content-Length', String(size));
    }

    stream.pipe(res);
  }
}
