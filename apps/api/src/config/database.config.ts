import { registerAs } from '@nestjs/config';

export const databaseConfig = registerAs('database', () => ({
  url: `postgresql://${process.env['DB_USER']}:${process.env['DB_PASS']}@${process.env['DB_HOST']}:${process.env['DB_PORT']}/${process.env['DB_NAME']}`,
}));

export type DatabaseConfig = ReturnType<typeof databaseConfig>;
