import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';

import { Public } from '@/common/decorators/public.decorator';
import { ResponseEntity } from '@/common/entities/response.entity';
import { AuthTokensHelper } from '@/common/services/auth-tokens/auth-tokens.helper';
import { RateLimit } from '@/common/services/rate-limit/decorators/rate-limit.decorator';
import { extractTokenFromCookies } from '@/common/utils/auth-tokens.functions';

import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { AuthUserEntity } from './entities/auth-user.entity';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly authTokens: AuthTokensHelper,
  ) {}

  @Public()
  @ApiOperation({ summary: 'Log in with the operator password' })
  @ApiOkResponse({ type: ResponseEntity, description: 'Logged in' })
  @ApiBadRequestResponse({ type: ResponseEntity, description: 'Validation failed' })
  @ApiUnauthorizedResponse({ type: ResponseEntity, description: 'Invalid credentials' })
  @ApiTooManyRequestsResponse({ type: ResponseEntity, description: 'Too many requests' })
  @RateLimit({ points: 5, duration: 60, blockDuration: 900 })
  @HttpCode(200)
  @Post('login')
  async logIn(@Body() loginDto: LoginDto, @Res() response: Response): Promise<void> {
    const { accessToken, refreshToken } = await this.authService.login(loginDto);

    this.authTokens.addToResponse({ response, type: 'accessToken', value: accessToken });
    this.authTokens.addToResponse({ response, type: 'refreshToken', value: refreshToken });

    response.status(200).send({ status: 200, message: 'Logged in successfully.' });
  }

  @Public()
  @ApiOperation({ summary: 'Refresh the access token' })
  @ApiOkResponse({ type: ResponseEntity, description: 'Token refreshed' })
  @ApiUnauthorizedResponse({
    type: ResponseEntity,
    description: 'Invalid or expired refresh token',
  })
  @ApiTooManyRequestsResponse({ type: ResponseEntity, description: 'Too many requests' })
  @RateLimit({ points: 30, duration: 60 })
  @HttpCode(200)
  @Post('refresh')
  async refresh(@Req() request: Request, @Res() response: Response): Promise<void> {
    const refreshToken = extractTokenFromCookies({ type: 'refreshToken', request }) ?? null;
    const tokens = await this.authService.refreshTokens(refreshToken);

    this.authTokens.addToResponse({ response, type: 'accessToken', value: tokens.accessToken });
    this.authTokens.addToResponse({ response, type: 'refreshToken', value: tokens.refreshToken });

    response.status(200).send({ status: 200, message: 'Token refreshed successfully.' });
  }

  @Public()
  @ApiOperation({ summary: 'Log out' })
  @ApiOkResponse({ type: ResponseEntity, description: 'Logged out' })
  @HttpCode(200)
  @Post('logout')
  async logOut(@Req() request: Request, @Res() response: Response): Promise<void> {
    // Revoke server-side (bumps the token version) before clearing the cookies.
    const refreshToken = extractTokenFromCookies({ type: 'refreshToken', request }) ?? null;
    await this.authService.logout(refreshToken);

    this.authTokens.addToResponse({ response, type: 'accessToken', value: '' });
    this.authTokens.addToResponse({ response, type: 'refreshToken', value: '' });

    response.status(200).send({ status: 200, message: 'Logged out successfully.' });
  }

  @ApiCookieAuth('accessToken')
  @ApiOperation({ summary: 'Check whether the request carries a valid session' })
  @ApiOkResponse({ type: AuthUserEntity, description: 'Successful' })
  @ApiUnauthorizedResponse({ type: ResponseEntity, description: 'Unauthorized' })
  @Get('me')
  me(): AuthUserEntity {
    // The guard already rejected anything without a valid access token, so reaching here is the answer.
    return { authenticated: true };
  }
}
