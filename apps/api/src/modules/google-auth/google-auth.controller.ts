import { Body, Controller, Delete, Get, HttpCode, Inject, Post, Query, Res } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiExcludeEndpoint,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';

import { Public } from '@/common/decorators/public.decorator';
import { ResponseEntity } from '@/common/entities/response.entity';
import { type AppConfig, appConfig } from '@/config/app.config';

import { SaveFoldersDto } from './dto/save-folders.dto';
import { AllowedFolderEntity } from './entities/allowed-folder.entity';
import { DriveAccountStatusEntity } from './entities/drive-account-status.entity';
import { GoogleAuthService } from './google-auth.service';

@ApiTags('Google Auth')
@ApiCookieAuth('accessToken')
@ApiUnauthorizedResponse({ type: ResponseEntity, description: 'Unauthorized' })
@Controller('google-auth')
export class GoogleAuthController {
  constructor(
    @Inject(appConfig.KEY) private readonly appCfg: AppConfig,
    private readonly googleAuthService: GoogleAuthService,
  ) {}

  @Public()
  @ApiExcludeEndpoint()
  @Get('google')
  redirectToGoogle(@Res() res: Response): void {
    res.redirect(this.googleAuthService.getAuthUrl());
  }

  @Public()
  @ApiExcludeEndpoint()
  @Get('google/callback')
  async handleGoogleCallback(
    @Query('code') code: string | undefined,
    @Query('error') error: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const redirectUrl = new URL('/', this.appCfg.webAppUrl);

    if (error || !code) {
      redirectUrl.searchParams.set('error', error ?? 'missing_code');
      res.redirect(redirectUrl.toString());
      return;
    }

    try {
      const email = await this.googleAuthService.handleCallback(code);
      redirectUrl.searchParams.set('connected', '1');
      redirectUrl.searchParams.set('email', email);
    } catch {
      redirectUrl.searchParams.set('error', 'callback_failed');
    }

    res.redirect(redirectUrl.toString());
  }

  @ApiOperation({ summary: 'Save the Picker-selected allowed folders' })
  @ApiCreatedResponse({ type: [AllowedFolderEntity], description: 'Allowed folders saved' })
  @ApiBadRequestResponse({ type: ResponseEntity, description: 'Validation failed' })
  @Post('folders')
  async saveFolders(@Body() saveFoldersDto: SaveFoldersDto): Promise<AllowedFolderEntity[]> {
    return this.googleAuthService.saveAllowedFolders(saveFoldersDto);
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
  @HttpCode(204)
  @Delete('account')
  async disconnect(): Promise<void> {
    await this.googleAuthService.disconnect();
  }
}
