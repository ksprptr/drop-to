import { Logger } from '@nestjs/common';
import { config } from 'dotenv';
import { resolve } from 'path';

// Load the dedicated test environment before any module (and config) is evaluated.
config({ path: resolve(__dirname, '../.env.test'), override: true });

// Silence Nest's logger so test output stays readable (services log on success/error paths).
Logger.overrideLogger(false);
