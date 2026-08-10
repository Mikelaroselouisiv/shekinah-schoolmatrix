import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { SyncNode } from './sync-node.entity';
import { SyncEvent } from './sync-event.entity';
import { SyncService } from './sync.service';
import { SyncKickService } from './sync-kick.service';
import { SyncController } from './sync.controller';
import { SyncApiKeyGuard } from './sync-api-key.guard';

@Global()
@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([SyncNode, SyncEvent]),
  ],
  controllers: [SyncController],
  providers: [SyncService, SyncKickService, SyncApiKeyGuard],
  exports: [SyncService, SyncKickService],
})
export class SyncModule {}
