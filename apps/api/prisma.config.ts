import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: 'src/prisma/schema.prisma',
  migrations: {
    path: 'src/prisma/migrations',
    seed: 'ts-node --transpile-only src/prisma/seed.ts',
  },
  datasource: {
    url: `postgresql://${env('DB_USER')}:${env('DB_PASS')}@${env('DB_HOST')}:${env('DB_PORT')}/${env('DB_NAME')}`,
  },
});
