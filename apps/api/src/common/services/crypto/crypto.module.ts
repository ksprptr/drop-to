import { Global, Module } from '@nestjs/common';

import { CryptoService } from './crypto.service';

/**
 * Class representing a crypto module
 */
@Global()
@Module({
  exports: [CryptoService],
  providers: [CryptoService],
})
export class CryptoModule {}
