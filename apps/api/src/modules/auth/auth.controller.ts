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
import { RequestUser } from '@/common/decorators/request-user.decorator';
import { ResponseEntity } from '@/common/entities/response.entity';
import { AuthTokensHelper } from '@/common/services/auth-tokens/auth-tokens.helper';
import { RateLimit } from '@/common/services/rate-limit/decorators/rate-limit.decorator';
import type { RequestUser as RequestUserType } from '@/common/types/auth-user.types';
import { extractTokenFromCookies } from '@/common/utils/auth-tokens.functions';

import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { AuthUserEntity } from './entities/auth-user.entity';

/**
 * Class representing an auth controller.
 */
@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly authTokens: AuthTokensHelper,
  ) {}

  /**
   * Controller to log the operator in and set the auth cookies
   */
  @Public()
  @ApiOperation({ summary: 'Log in with username and password' })
  @ApiOkResponse({ type: ResponseEntity, description: 'Logged in' })
  @ApiBadRequestResponse({ type: ResponseEntity, description: 'Validation failed' })
  @ApiUnauthorizedResponse({ type: ResponseEntity, description: 'Invalid credentials' })
  @ApiTooManyRequestsResponse({ type: ResponseEntity, description: 'Too many requests' })
  @RateLimit({ points: 10, duration: 60 })
  @HttpCode(200)
  @Post('login')
  async logIn(@Body() loginDto: LoginDto, @Res() response: Response): Promise<void> {
    const { accessToken, refreshToken } = await this.authService.login(loginDto);

    this.authTokens.addToResponse({ response, type: 'accessToken', value: accessToken });
    this.authTokens.addToResponse({ response, type: 'refreshToken', value: refreshToken });

    response.status(200).send({ status: 200, message: 'Logged in successfully.' });
  }

  /**
   * Controller to rotate the token pair from the refresh cookie
   */
  @Public()
  @ApiOperation({ summary: 'Refresh the access token' })
  @ApiOkResponse({ type: ResponseEntity, description: 'Token refreshed' })
  @ApiUnauthorizedResponse({ type: ResponseEntity, description: 'Invalid or expired refresh token' })
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

  /**
   * Controller to log out by clearing the auth cookies
   */
  @Public()
  @ApiOperation({ summary: 'Log out' })
  @ApiOkResponse({ type: ResponseEntity, description: 'Logged out' })
  @HttpCode(200)
  @Post('logout')
  logOut(@Res() response: Response): void {
    this.authTokens.addToResponse({ response, type: 'accessToken', value: '' });
    this.authTokens.addToResponse({ response, type: 'refreshToken', value: '' });

    response.status(200).send({ status: 200, message: 'Logged out successfully.' });
  }

  /**
   * Controller to return the currently authenticated operator
   */
  @ApiCookieAuth('accessToken')
  @ApiOperation({ summary: 'Get the current authenticated operator' })
  @ApiOkResponse({ type: AuthUserEntity, description: 'Successful' })
  @ApiUnauthorizedResponse({ type: ResponseEntity, description: 'Unauthorized' })
  @Get('me')
  me(@RequestUser() user: RequestUserType): AuthUserEntity {
    return { username: user.sub };
  }
}
