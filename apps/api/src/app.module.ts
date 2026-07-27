import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import * as fs from 'fs';
import * as path from 'path';

import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { CryptoModule } from './common/services/crypto/crypto.module';
import { RateLimitModule } from './common/services/rate-limit/rate-limit.module';
import { appConfig } from './config/app.config';
import { authConfig } from './config/auth.config';
import { cryptoConfig } from './config/crypto.config';
import { databaseConfig } from './config/database.config';
import { googleConfig } from './config/google.config';
import { jwtConfig } from './config/jwt.config';
import { rateLimitConfig } from './config/rate-limit.config';
import { redisConfig } from './config/redis.config';
import { s3Config } from './config/s3.config';
import { AuthModule } from './modules/auth/auth.module';
import { AuthGuard } from './modules/auth/guards/auth.guard';
import { GoogleAuthModule } from './modules/google-auth/google-auth.module';
import { HealthModule } from './modules/health/health.module';
import { StorageModule } from './modules/storage/storage.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [path.join(__dirname, '..', '.env'), path.join(__dirname, '..', '.env.local')],

      load: [
        appConfig,
        authConfig,
        jwtConfig,
        databaseConfig,
        googleConfig,
        cryptoConfig,
        rateLimitConfig,
        redisConfig,
        s3Config,
      ],
      validate: (config) => {
        const envExample = fs.readFileSync(path.join(__dirname, '..', '.env.example'), 'utf-8');

        const required = envExample
          .split('\n')
          .filter((line) => line.trim() && !line.startsWith('#'))
          .map((line) => line.split('=')[0].trim());
        const missing = required.filter((key) => !config[key]);
        if (missing.length > 0) {
          throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
        }

        // Reject weak/placeholder JWT secrets — a guessable secret means forgeable tokens.
        const weakSecrets = ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'].filter((key) => {
          const value = String(config[key] ?? '');
          return value.length < 16 || /generate_me|change_me|your[_-]|example|secret_here/i.test(value);
        });
        if (weakSecrets.length > 0) {
          throw new Error(
            `Weak or placeholder secrets (set strong random values, >= 16 chars): ${weakSecrets.join(', ')}`,
          );
        }

        return config;
      },
    }),

    PrismaModule,
    CryptoModule,
    RateLimitModule,

    AuthModule,
    HealthModule,
    GoogleAuthModule,
    StorageModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
  ],
})
export class AppModule {}
