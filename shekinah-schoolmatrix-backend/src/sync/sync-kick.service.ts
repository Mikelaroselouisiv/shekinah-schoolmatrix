import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Déclenche un cycle sync immédiat sur l’agent local (POST /kick).
 * No-op si SYNC_KICK_URL absent (ex. nœud cloud).
 */
@Injectable()
export class SyncKickService {
  private readonly logger = new Logger(SyncKickService.name);
  private readonly url: string;
  private lastKickAt = 0;
  private readonly minIntervalMs = 400;

  constructor(private readonly config: ConfigService) {
    this.url = (this.config.get<string>('SYNC_KICK_URL') || '').trim();
  }

  /** Fire-and-forget ; rate-limité pour éviter le spam. */
  kick(reason?: string): void {
    if (!this.url) return;
    const now = Date.now();
    if (now - this.lastKickAt < this.minIntervalMs) return;
    this.lastKickAt = now;
    const label = reason ? ` (${reason})` : '';
    void fetch(this.url, { method: 'POST' })
      .then((res) => {
        if (!res.ok) {
          this.logger.debug(`kick HTTP ${res.status}${label}`);
        }
      })
      .catch((err: any) => {
        this.logger.debug(`kick échec${label}: ${err?.message || err}`);
      });
  }
}
