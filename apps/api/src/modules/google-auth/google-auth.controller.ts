import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiExcludeEndpoint,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { randomBytes, timingSafeEqual } from 'node:crypto';

import { Public } from '@/common/decorators/public.decorator';
import { ResponseEntity } from '@/common/entities/response.entity';
import { type AppConfig, appConfig } from '@/config/app.config';

import { SaveFoldersDto } from './dto/save-folders.dto';
import { AllowedFolderEntity } from './entities/allowed-folder.entity';
import { DriveAccountStatusEntity } from './entities/drive-account-status.entity';
import { GoogleAuthService } from './google-auth.service';
import { DriveOwnerGuard } from './guards/drive-owner.guard';

/** Name of the short-lived cookie holding the OAuth `state` nonce (CSRF defense). */
const OAUTH_STATE_COOKIE = 'oauthState';

/** Lifetime of the OAuth `state` cookie — long enough to complete consent, short enough to expire. */
const OAUTH_STATE_MAX_AGE_MS = 10 * 60 * 1000;

@ApiTags('Google Auth')
@ApiCookieAuth('accessToken')
@ApiUnauthorizedResponse({ type: ResponseEntity, description: 'Unauthorized' })
@Controller('google-auth')
export class GoogleAuthController {
  constructor(
    @Inject(appConfig.KEY) private readonly appCfg: AppConfig,
    private readonly googleAuthService: GoogleAuthService,
  ) {}

  /**
   * Starts the consent flow (operator-gated); mints a `state` nonce into a short-lived cookie for CSRF defense.
   **/
  @ApiExcludeEndpoint()
  @Get('google')
  redirectToGoogle(@Res() res: Response): void {
    const state = randomBytes(32).toString('hex');

    res.cookie(OAUTH_STATE_COOKIE, state, {
      httpOnly: true,
      secure: !this.appCfg.isDevelopment,
      sameSite: 'lax',
      maxAge: OAUTH_STATE_MAX_AGE_MS,
      path: '/',
    });

    res.redirect(this.googleAuthService.getAuthUrl(state));
  }

  /**
   * OAuth callback (public); the `state` query must match the cookie set at initiation, tying it to an operator-started flow.
   **/
  @Public()
  @ApiExcludeEndpoint()
  @Get('google/callback')
  async handleGoogleCallback(
    @Query('code') code: string | undefined,
    @Query('error') error: string | undefined,
    @Query('state') state: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const redirectUrl = new URL('/', this.appCfg.webAppUrl);
    const expectedState = (req.cookies as Record<string, string> | undefined)?.[OAUTH_STATE_COOKIE];

    // Single-use nonce: always clear it, even on the error paths below.
    res.clearCookie(OAUTH_STATE_COOKIE, { path: '/' });

    if (!this.stateMatches(state, expectedState)) {
      redirectUrl.searchParams.set('error', 'invalid_state');
      res.redirect(redirectUrl.toString());
      return;
    }

    if (error || !code) {
      redirectUrl.searchParams.set('error', error ?? 'missing_code');
      res.redirect(redirectUrl.toString());
      return;
    }

    try {
      const email = await this.googleAuthService.handleCallback(code);
      redirectUrl.searchParams.set('connected', '1');
      redirectUrl.searchParams.set('email', email);
      redirectUrl.searchParams.set('ownerToken', this.googleAuthService.issueOwnerToken(email));
    } catch {
      redirectUrl.searchParams.set('error', 'callback_failed');
    }

    res.redirect(redirectUrl.toString());
  }

  /**
   * Constant-time comparison of the callback `state` against the cookie nonce (both must be present).
   **/
  private stateMatches(received: string | undefined, expected: string | undefined): boolean {
    if (!received || !expected || received.length !== expected.length) {
      return false;
    }

    return timingSafeEqual(Buffer.from(received), Buffer.from(expected));
  }

  @ApiOperation({ summary: 'Save the Picker-selected allowed folders' })
  @ApiCreatedResponse({ type: [AllowedFolderEntity], description: 'Allowed folders saved' })
  @ApiBadRequestResponse({ type: ResponseEntity, description: 'Validation failed' })
  @ApiForbiddenResponse({ type: ResponseEntity, description: 'Not the verified Drive owner' })
  @UseGuards(DriveOwnerGuard)
  @Post('folders')
  async saveFolders(@Body() saveFoldersDto: SaveFoldersDto): Promise<AllowedFolderEntity[]> {
    return this.googleAuthService.saveAllowedFolders(saveFoldersDto);
  }

  @ApiOperation({ summary: 'Remove an authorized folder (unselect)' })
  @ApiNoContentResponse({ description: 'Folder removed' })
  @ApiForbiddenResponse({ type: ResponseEntity, description: 'Not the verified Drive owner' })
  @UseGuards(DriveOwnerGuard)
  @HttpCode(204)
  @Delete('folders/:folderId')
  async removeFolder(@Param('folderId') folderId: string): Promise<void> {
    await this.googleAuthService.removeAllowedFolder(folderId);
  }

  @ApiOperation({ summary: 'Get a short-lived access token for the Google Picker' })
  @ApiOkResponse({ description: 'Access token issued' })
  @Get('picker-token')
  async getPickerToken(): Promise<{ accessToken: string }> {
    return { accessToken: await this.googleAuthService.getPickerAccessToken() };
  }

  @ApiOperation({ summary: 'Get the Drive account connection status' })
  @ApiOkResponse({ type: DriveAccountStatusEntity, description: 'Successful' })
  @Get('status')
  async getStatus(): Promise<DriveAccountStatusEntity> {
    return this.googleAuthService.getStatus();
  }

  @ApiOperation({ summary: 'Disconnect the Google account' })
  @ApiNoContentResponse({ description: 'Account disconnected' })
  @ApiForbiddenResponse({ type: ResponseEntity, description: 'Not the verified Drive owner' })
  @UseGuards(DriveOwnerGuard)
  @HttpCode(204)
  @Delete('account')
  async disconnect(): Promise<void> {
    await this.googleAuthService.disconnect();
  }
}
