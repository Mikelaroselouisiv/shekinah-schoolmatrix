/**
 * Subscriber TypeORM : toute suppression ORM d’une entité sync
 * écrit un tombstone + kick agent (propagation local ↔ cloud).
 */
import { Injectable, Logger } from '@nestjs/common';
import {
  DataSource,
  EntitySubscriberInterface,
  EventSubscriber,
  RemoveEvent,
} from 'typeorm';
import { SYNC_ENTITY_DEFS, SyncEntityName } from './sync.entities';
import { SyncService } from './sync.service';
import { SyncTombstone } from './sync-tombstone.entity';

@EventSubscriber()
@Injectable()
export class SyncTombstoneSubscriber
  implements EntitySubscriberInterface
{
  private readonly logger = new Logger(SyncTombstoneSubscriber.name);
  private readonly targetToName = new Map<Function, SyncEntityName>();

  constructor(
    dataSource: DataSource,
    private readonly syncService: SyncService,
  ) {
    for (const def of SYNC_ENTITY_DEFS) {
      if (def.name === 'SyncTombstone' || def.name === 'SchoolProfile') continue;
      if (typeof def.target === 'function') {
        this.targetToName.set(def.target, def.name);
      }
    }
    dataSource.subscribers.push(this);
  }

  async beforeRemove(event: RemoveEvent<any>): Promise<void> {
    if (this.syncService.isApplyingRemoteTombstone()) return;
    const entity = event.entity;
    if (!entity || entity.id == null) return;
    const target = event.metadata?.target;
    if (typeof target !== 'function') return;
    if (target === SyncTombstone) return;
    const name = this.targetToName.get(target);
    if (!name) return;
    try {
      await this.syncService.markDeleted(name, entity.id);
    } catch (err: any) {
      this.logger.warn(
        `tombstone ${name}/${entity.id}: ${err?.message || err}`,
      );
    }
  }
}
