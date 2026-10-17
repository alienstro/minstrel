import { Module } from '@nestjs/common';
import { KeyVault, parseKeyring } from '../crypto/key-vault.js';
import { ConnectionsService } from './connections.service.js';

@Module({
  providers: [
    ConnectionsService,
    {
      provide: KeyVault,
      useFactory: () =>
        new KeyVault(parseKeyring(process.env.KEY_ENCRYPTION_KEYS ?? '')),
    },
  ],
  exports: [ConnectionsService, KeyVault],
})
export class ConnectionsModule {}
