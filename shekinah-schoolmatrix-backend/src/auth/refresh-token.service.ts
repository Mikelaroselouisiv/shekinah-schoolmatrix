import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, LessThan, Repository } from 'typeorm';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'crypto';
import { RefreshToken } from './refresh-token.entity';

export interface IssuedRefreshToken {
  token: string;
  expiresAt: Date;
  expiresIn: number;
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

@Injectable()
export class RefreshTokenService {
  private readonly logger = new Logger(RefreshTokenService.name);

  /** Durée de vie d'une session renouvelable. */
  private readonly ttlDays = envInt('REFRESH_TOKEN_TTL_DAYS', 30);

  constructor(
    @InjectRepository(RefreshToken)
    private readonly repo: Repository<RefreshToken>,
  ) {}

  private hash(raw: string): string {
    return createHash('sha256').update(raw, 'utf8').digest('hex');
  }

  /** Comparaison à temps constant, pour ne rien apprendre par la durée. */
  private sameHash(a: string, b: string): boolean {
    const ba = Buffer.from(a, 'hex');
    const bb = Buffer.from(b, 'hex');
    return ba.length === bb.length && timingSafeEqual(ba, bb);
  }

  /** Nouvelle session (nouvelle famille). */
  async issue(userId: number): Promise<IssuedRefreshToken> {
    return this.create(userId, randomUUID());
  }

  private async create(
    userId: number,
    familyId: string,
  ): Promise<IssuedRefreshToken> {
    const raw = randomBytes(48).toString('base64url');
    const expiresAt = new Date(Date.now() + this.ttlDays * 86_400_000);
    await this.repo.save(
      this.repo.create({
        user_id: userId,
        token_hash: this.hash(raw),
        family_id: familyId,
        expires_at: expiresAt,
        revoked_at: null,
        revoked_reason: null,
        last_used_at: null,
      }),
    );
    return {
      token: raw,
      expiresAt,
      expiresIn: Math.floor((expiresAt.getTime() - Date.now()) / 1000),
    };
  }

  /**
   * Vérifie un jeton présenté.
   * - inconnu / expiré  → null
   * - déjà révoqué      → rejeu : toute la famille saute, puis null
   */
  async consume(raw: string): Promise<RefreshToken | null> {
    const trimmed = (raw ?? '').trim();
    if (!trimmed) return null;
    const hashed = this.hash(trimmed);
    const record = await this.repo.findOne({ where: { token_hash: hashed } });
    if (!record || !this.sameHash(record.token_hash, hashed)) return null;

    if (record.revoked_at) {
      this.logger.warn(
        `Rejeu d'un refresh token révoqué (user ${record.user_id}) — révocation de la famille.`,
      );
      await this.revokeFamily(record.family_id, 'reuse_detected');
      return null;
    }
    if (record.expires_at.getTime() <= Date.now()) return null;
    return record;
  }

  /** Révoque le jeton présenté et en émet un nouveau dans la même famille. */
  async rotate(record: RefreshToken): Promise<IssuedRefreshToken> {
    record.revoked_at = new Date();
    record.revoked_reason = 'rotated';
    record.last_used_at = new Date();
    await this.repo.save(record);
    return this.create(record.user_id, record.family_id);
  }

  async revokeFamily(familyId: string, reason: string): Promise<void> {
    await this.repo.update(
      { family_id: familyId, revoked_at: IsNull() },
      { revoked_at: new Date(), revoked_reason: reason.slice(0, 40) },
    );
  }

  /** Ferme toutes les sessions d'un utilisateur (désactivation, suppression). */
  async revokeAllForUser(userId: number, reason: string): Promise<number> {
    const res = await this.repo.update(
      { user_id: userId, revoked_at: IsNull() },
      { revoked_at: new Date(), revoked_reason: reason.slice(0, 40) },
    );
    return res.affected ?? 0;
  }

  /** Déconnexion : révoque uniquement la session présentée. Idempotent. */
  async revokeByToken(raw: string): Promise<void> {
    const trimmed = (raw ?? '').trim();
    if (!trimmed) return;
    const record = await this.repo.findOne({
      where: { token_hash: this.hash(trimmed) },
    });
    if (!record || record.revoked_at) return;
    record.revoked_at = new Date();
    record.revoked_reason = 'logout';
    await this.repo.save(record);
  }

  /** Purge des sessions expirées depuis plus de 30 jours. */
  async purgeExpired(): Promise<number> {
    const cutoff = new Date(Date.now() - 30 * 86_400_000);
    const res = await this.repo.delete({ expires_at: LessThan(cutoff) });
    return res.affected ?? 0;
  }
}
