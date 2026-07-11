import { Inject, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Auth, google } from 'googleapis';

import { CryptoService } from '@/common/services/crypto/crypto.service';
import { type GoogleConfig, googleConfig } from '@/config/google.config';
import { PrismaService } from '@/prisma/prisma.service';

import { SaveFoldersDto } from './dto/save-folders.dto';
import { AllowedFolderEntity } from './entities/allowed-folder.entity';
import { DriveAccountStatusEntity } from './entities/drive-account-status.entity';

/**
 * Class representing a google auth service.
 *
 * Owns the OAuth lifecycle for the single Drive account whose storage quota is
 * used for uploads: it builds the consent URL, exchanges the callback code for
 * tokens, persists the refresh token encrypted, and hands out authorized
 * OAuth2 clients for Drive API calls.
 */
@Injectable()
export class GoogleAuthService {
  private readonly logger = new Logger(GoogleAuthService.name);

  constructor(
    @Inject(googleConfig.KEY) private readonly googleCfg: GoogleConfig,
    private readonly prismaService: PrismaService,
    private readonly cryptoService: CryptoService,
  ) {}

  /**
   * Function to build a fresh (credential-less) OAuth2 client.
   * @returns An OAuth2 client configured with the app's client id/secret/redirect
   */
  private createOAuthClient(): Auth.OAuth2Client {
    return new google.auth.OAuth2(
      this.googleCfg.clientId,
      this.googleCfg.clientSecret,
      this.googleCfg.redirectUri,
    );
  }

  /**
   * Function to generate the Google OAuth consent URL.
   *
   * `access_type: 'offline'` + `prompt: 'consent'` guarantee a refresh token is
   * returned on every authorization.
   * @returns The consent screen URL to redirect the user to
   */
  getAuthUrl(): string {
    return this.createOAuthClient().generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: true,
      scope: [...this.googleCfg.scopes],
    });
  }

  /**
   * Function to handle the OAuth callback: exchange the code for tokens and
   * persist the account with its refresh token encrypted at rest.
   * @param code - The authorization code from the callback query
   * @returns The email of the account that was authorized
   */
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
   * Function to return an authorized OAuth2 client for the given account,
   * ready to make Drive API calls (access tokens are auto-refreshed).
   * @param driveAccountId - The DriveAccount id
   * @returns An OAuth2 client with the stored refresh token attached
   */
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
   * Function to disconnect the active Google account from the app.
   *
   * Best-effort revokes the token at Google, then deletes the DriveAccount (its
   * AllowedFolders cascade away). A no-op when nothing is connected.
   */
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
   * Function to mint a short-lived access token for the Google Picker.
   *
   * The Picker runs in the browser and needs an OAuth access token for the
   * authorized account; we derive it from the stored refresh token so the
   * frontend never touches OAuth directly.
   * @returns A fresh access token for the active account
   */
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
   * Function to resolve the single active Drive account id.
   *
   * This app authorizes exactly one account; the most recently connected one is
   * treated as active.
   * @returns The active DriveAccount id
   */
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
   * Function to persist the folders selected via the Google Picker as the
   * allow-list of root folders for the active account.
   * @param dto - The selected folders (id + cached name)
   * @returns The full, updated list of allowed folders
   */
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
   * Function to return the current connection status of the Drive account.
   * @returns Whether an account is connected, its email, and its allowed folders
   */
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
   * Function to decode the OpenID Connect id_token and extract the email claim.
   * @param idToken - The raw id_token JWT (or null/undefined)
   * @returns The email claim, or a placeholder if it cannot be resolved
   */
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
