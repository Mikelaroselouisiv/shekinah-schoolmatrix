import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { SyncNode } from './sync-node.entity';
import { SyncEvent } from './sync-event.entity';
import { SyncTombstone } from './sync-tombstone.entity';
import { StudentParent } from '../student-parents/student-parent.entity';
import { SyncService } from './sync.service';
import { SyncKickService } from './sync-kick.service';
import { SyncController } from './sync.controller';
import { SyncApiKeyGuard } from './sync-api-key.guard';
import { SyncTombstoneSubscriber } from './sync-tombstone.subscriber';

@Global()
@Module({
  imports: [
    ConfigModule,
    // StudentParent n'est plus lue par le métier (le rattachement vit dans
    // user_linked_student), mais sync.entities.ts la réplique encore : sans
    // enregistrement ici, TypeORM n'a pas ses métadonnées et /sync/* renvoie 500.
    // À retirer en même temps que la ligne correspondante de sync.entities.ts,
    // le jour où la table sera supprimée par migration.
    TypeOrmModule.forFeature([
      SyncNode,
      SyncEvent,
      SyncTombstone,
      StudentParent,
    ]),
  ],
  controllers: [SyncController],
  providers: [
    SyncService,
    SyncKickService,
    SyncApiKeyGuard,
    SyncTombstoneSubscriber,
  ],
  exports: [SyncService, SyncKickService],
})
export class SyncModule {}
