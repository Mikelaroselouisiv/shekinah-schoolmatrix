import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { SyncApiKeyGuard } from './sync-api-key.guard';
import { SyncService } from './sync.service';

@Controller('sync')
@UseGuards(SyncApiKeyGuard)
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @Get('entities')
  listEntities() {
    return { entities: this.syncService.listEntities() };
  }

  @Get('pull')
  pull(
    @Query('entity') entity: string,
    @Query('since') since?: string,
    @Query('take') take?: string,
    @Query('afterId') afterId?: string,
  ) {
    const n = take ? parseInt(take, 10) : 200;
    return this.syncService.pull(
      entity,
      since,
      Number.isFinite(n) ? n : 200,
      afterId,
    );
  }

  @Post('push')
  push(
    @Body()
    body: {
      entity: string;
      sourceNodeId?: string;
      records: Array<{
        uuid: string;
        updatedAt?: string;
        deletedAt?: string | null;
        data: Record<string, unknown>;
      }>;
    },
  ) {
    return this.syncService.push(body);
  }
}
