import { Inject, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Auth, google } from 'googleapis';

import { CryptoService } from '@/common/services/crypto/crypto.service';
import { type GoogleConfig, googleConfig } from '@/config/google.config';
import { PrismaService } from '@/prisma/prisma.service';

import { SaveFoldersDto } from './dto/save-folders.dto';
import { AllowedFolderEntity } from './entities/allowed-folder.entity';
import { DriveAccountStatusEntity } from './entities/drive-account-status.entity';

/**
 * OAuth lifecycle for the single Drive account: consent, token exchange, encrypted storage, authorized clients.
 **/
@Injectable()
export class GoogleAuthService {
  private readonly logger = new Logger(GoogleAuthService.name);

  constructor(
    @Inject(googleConfig.KEY) private readonly googleCfg: GoogleConfig,
    private readonly prismaService: PrismaService,
    private readonly cryptoService: CryptoService,
  ) {}

  private createOAuthClient(): Auth.OAuth2Client {
    return new google.auth.OAuth2(
      this.googleCfg.clientId,
      this.googleCfg.clientSecret,
      this.googleCfg.redirectUri,
    );
  }

  /**
   * Consent URL; `offline` + `prompt: consent` force a refresh token, `state` nonce defeats OAuth CSRF.
   **/
  getAuthUrl(state: string): string {
    return this.createOAuthClient().generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: true,
      scope: [...this.googleCfg.scopes],
      state,
    });
  }

  /**
   * Exchanges the callback code for tokens and upserts the account (refresh token encrypted).
   **/
  async handleCallback(code: string): Promise<string> {
    const client = this.createOAuthClient();

    let refreshToken: string | null | undefined;
    let idToken: string | null | undefined;

    try {
      const { tokens } = await client.getToken(code);
      refreshToken = tokens.refresh_token;
      idToken = tokens.id_token;
    } catch (error) {
      this.logger.error('Failed to exchange authorization code for tokens.', error as Error);
      throw new UnauthorizedException('Failed to exchange authorization code.');
    }

    if (!refreshToken) {
      throw new UnauthorizedException(
        'Google did not return a refresh token. Revoke the app in the Google account and try again with prompt=consent.',
      );
    }

    const email = this.extractEmailFromIdToken(idToken);
    const refreshTokenEnc = this.cryptoService.encrypt(refreshToken);

    const account = await this.prismaService.driveAccount.upsert({
      where: { email },
      create: { email, refreshTokenEnc },
      update: { refreshTokenEnc },
    });

    this.logger.log(`Authorized Drive account ${account.email} (${account.id}).`);

    return account.email;
  }

  /**
   * OAuth2 client with the stored refresh token attached (access tokens auto-refresh).
   **/
  async getAuthorizedClient(driveAccountId: string): Promise<Auth.OAuth2Client> {
    const account = await this.prismaService.driveAccount.findUnique({
      where: { id: driveAccountId },
    });

    if (!account) {
      throw new NotFoundException('Drive account not found.');
    }

    const refreshToken = this.cryptoService.decrypt(account.refreshTokenEnc);
    const client = this.createOAuthClient();
    client.setCredentials({ refresh_token: refreshToken });

    return client;
  }

  /**
   * Best-effort revokes at Google, then deletes the account (folders cascade); no-op if none.
   **/
  async disconnect(): Promise<void> {
    const account = await this.prismaService.driveAccount.findFirst({
      orderBy: { updatedAt: 'desc' },
    });

    if (!account) {
      return;
    }

    try {
      const client = await this.getAuthorizedClient(account.id);
      await client.revokeCredentials();
    } catch (error) {
      this.logger.warn(`Failed to revoke Google credentials: ${(error as Error).message}`);
    }

    await this.prismaService.driveAccount.delete({ where: { id: account.id } });

    this.logger.log(`Disconnected Drive account ${account.email} (${account.id}).`);
  }

  /**
   * Short-lived access token for the browser Picker, derived from the stored refresh token.
   **/
  async getPickerAccessToken(): Promise<string> {
    const driveAccountId = await this.getActiveAccountId();
    const client = await this.getAuthorizedClient(driveAccountId);

    const { token } = await client.getAccessToken();

    if (!token) {
      throw new UnauthorizedException('Failed to obtain an access token for the Picker.');
    }

    return token;
  }

  /**
   * The active account id (most recently connected; the app authorizes exactly one).
   **/
  async getActiveAccountId(): Promise<string> {
    const account = await this.prismaService.driveAccount.findFirst({
      orderBy: { updatedAt: 'desc' },
    });

    if (!account) {
      throw new NotFoundException('No Google Drive account is connected yet.');
    }

    return account.id;
  }

  /**
   * Persists the Picker-selected folders as the account's allowed roots.
   **/
  async saveAllowedFolders(dto: SaveFoldersDto): Promise<AllowedFolderEntity[]> {
    const driveAccountId = await this.getActiveAccountId();

    await this.prismaService.$transaction(
      dto.folders.map((folder) =>
        this.prismaService.allowedFolder.upsert({
          where: { driveAccountId_folderId: { driveAccountId, folderId: folder.folderId } },
          create: { driveAccountId, folderId: folder.folderId, name: folder.name },
          update: { name: folder.name },
        }),
      ),
    );

    return this.prismaService.allowedFolder.findMany({
      where: { driveAccountId },
      select: { id: true, folderId: true, name: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Current connection status: connected flag, email, and allowed folders.
   **/
  async getStatus(): Promise<DriveAccountStatusEntity> {
    const account = await this.prismaService.driveAccount.findFirst({
      orderBy: { updatedAt: 'desc' },
      include: {
        allowedFolders: {
          select: { id: true, folderId: true, name: true, createdAt: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!account) {
      return { connected: false, email: null, allowedFolders: [] };
    }

    return {
      connected: true,
      email: account.email,
      allowedFolders: account.allowedFolders,
    };
  }

  /**
   * Extracts the email claim from the id_token (placeholder when unresolved).
   **/
  private extractEmailFromIdToken(idToken: string | null | undefined): string {
    if (!idToken) {
      return 'unknown@google';
    }

    try {
      const payload = idToken.split('.')[1];
      const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
        email?: string;
      };

      return decoded.email ?? 'unknown@google';
    } catch {
      return 'unknown@google';
    }
  }
}
