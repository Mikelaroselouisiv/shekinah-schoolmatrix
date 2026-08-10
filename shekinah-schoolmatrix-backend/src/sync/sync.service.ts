/**
 * Sync SchoolMatrix — protocole état (uuid + curseur temporel composite).
 * Conflits : last-write-wins (updatedAt) ; à horodatage égal, le local gagne.
 * SchoolProfile est un singleton (dédup + adoption UUID gagnant).
 */
import {
  BadRequestException,
  Injectable,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityMetadata, In, Repository } from 'typeorm';
import { SyncNode } from './sync-node.entity';
import { SyncEvent } from './sync-event.entity';
import {
  APPEND_ONLY_ENTITIES,
  SYNC_ENTITY_MAP,
  SyncEntityName,
  listSyncEntityNames,
} from './sync.entities';
import { normalizeMediaFieldsInPlace } from '../uploads/media-url';

export type SyncWireRecord = {
  uuid: string;
  updatedAt: string;
  deletedAt: string | null;
  data: Record<string, unknown>;
};

@Injectable()
export class SyncService implements OnModuleInit {
  private nodeId: string = 'LOCAL';

  constructor(
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
    @InjectRepository(SyncNode)
    private readonly syncNodeRepo: Repository<SyncNode>,
    @InjectRepository(SyncEvent)
    private readonly syncEventRepo: Repository<SyncEvent>,
  ) {}

  async onModuleInit() {
    this.nodeId =
      this.configService.get<string>('NODE_ID') ??
      this.configService.get<string>('SYNC_NODE_ID') ??
      'LOCAL';
    await this.ensureNodeRegistered();
  }

  getNodeId(): string {
    return this.nodeId;
  }

  listEntities(): SyncEntityName[] {
    return listSyncEntityNames();
  }

  private async ensureNodeRegistered(): Promise<void> {
    const existing = await this.syncNodeRepo.findOne({
      where: { id: this.nodeId },
    });
    if (!existing) {
      await this.syncNodeRepo.save(
        this.syncNodeRepo.create({
          id: this.nodeId,
          name: this.nodeId,
        }),
      );
    }
  }

  async recordEvent(
    entityType: string,
    entityId: string,
    eventType: string,
    payload?: Record<string, unknown>,
  ): Promise<void> {
    await this.syncEventRepo.save(
      this.syncEventRepo.create({
        node_id: this.nodeId,
        entity_type: entityType,
        entity_id: entityId,
        event_type: eventType,
        payload: payload ?? null,
      }),
    );
  }

  private isLocalTruthNode(): boolean {
    const id = this.nodeId.toUpperCase();
    return (
      id === 'LOCAL' ||
      id === 'LOCAL-MOTHER' ||
      id.startsWith('LOCAL') ||
      id.includes('MOTHER') ||
      id.includes('SERVER')
    );
  }

  private isCloudSource(sourceNodeId?: string): boolean {
    const s = (sourceNodeId ?? '').toUpperCase();
    return s === 'GCP' || s === 'CLOUD' || s.includes('GCP');
  }

  /**
   * Pull deltas. Curseur composite (since + afterId) pour ne jamais rester
   * bloqué sur la même ligne (précision µs Postgres vs ms ISO).
   */
  async pull(
    entityName: string,
    since?: string,
    take = 200,
    afterId?: string,
  ) {
    const def = SYNC_ENTITY_MAP.get(entityName as SyncEntityName);
    if (!def) {
      throw new BadRequestException(`Entité sync inconnue: ${entityName}`);
    }
    const limit = Math.min(Math.max(take || 200, 1), 1000);
    const sinceStr = (since || '1970-01-01T00:00:00.000000Z').trim();
    if (Number.isNaN(new Date(sinceStr).getTime())) {
      throw new BadRequestException('since ISO8601 invalide');
    }

    const repo = this.dataSource.getRepository(def.target);
    const meta = repo.metadata;
    const timeProp = def.timeField;
    const after = (afterId ?? '').trim();

    const qb = repo
      .createQueryBuilder('e')
      .orderBy(`e.${timeProp}`, 'ASC')
      .addOrderBy('e.id', 'ASC')
      .take(limit);

    if (after) {
      qb.where(
        `(e.${timeProp} > CAST(:since AS timestamptz) OR (e.${timeProp} = CAST(:since AS timestamptz) AND CAST(e.id AS varchar) > :afterId))`,
        { since: sinceStr, afterId: after },
      );
    } else {
      qb.where(`e.${timeProp} > CAST(:since AS timestamptz)`, {
        since: sinceStr,
      });
    }

    const rows = await qb.getMany();

    if (rows.length === 0) {
      return {
        entity: entityName,
        records: [] as SyncWireRecord[],
        nextCursor: sinceStr,
        nextAfterId: after || null,
        count: 0,
      };
    }

    const withIds = await repo.find({
      where: { id: In(rows.map((r: any) => r.id)) } as any,
      loadRelationIds: true,
    });
    const byId = new Map(withIds.map((r: any) => [String(r.id), r]));

    const cursorTsById = await this.loadCursorTimestamps(
      meta,
      timeProp,
      rows.map((r: any) => r.id),
    );

    const records: SyncWireRecord[] = rows.map((row: any) => {
      const full = byId.get(String(row.id)) ?? row;
      const cursorTs =
        cursorTsById.get(String(full.id)) ||
        this.toIso(full[timeProp] ?? row[timeProp]);
      return {
        uuid: String(full.id),
        updatedAt: cursorTs,
        deletedAt: null,
        data: this.toWireData(full, meta),
      };
    });

    const last = records[records.length - 1];
    return {
      entity: entityName,
      records,
      nextCursor: last.updatedAt,
      nextAfterId: last.uuid,
      count: records.length,
    };
  }

  /** Horodatage pleine précision (µs) pour le curseur — via to_json Postgres. */
  private async loadCursorTimestamps(
    meta: EntityMetadata,
    timeProp: string,
    ids: Array<string | number>,
  ): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    if (ids.length === 0) return map;
    const table = meta.tableName.replace(/"/g, '');
    const schema = (meta.schema || 'public').replace(/"/g, '');
    const col =
      meta.columns.find((c) => c.propertyName === timeProp)?.databaseName ||
      timeProp;
    const idTexts = ids.map((id) => String(id));
    const rows: Array<{ id: string; ts: string }> =
      await this.dataSource.query(
        `SELECT id::text AS id,
                trim(both '"' from to_json("${col}")::text) AS ts
         FROM "${schema}"."${table}"
         WHERE id::text = ANY($1::text[])`,
        [idTexts],
      );
    for (const r of rows) {
      if (r.ts) map.set(String(r.id), r.ts);
    }
    return map;
  }

  async push(body: {
    entity: string;
    sourceNodeId?: string;
    records: Array<{
      uuid: string;
      updatedAt?: string;
      deletedAt?: string | null;
      data: Record<string, unknown>;
    }>;
  }) {
    const def = SYNC_ENTITY_MAP.get(body.entity as SyncEntityName);
    if (!def) {
      throw new BadRequestException(`Entité sync inconnue: ${body.entity}`);
    }
    const repo = this.dataSource.getRepository(def.target);
    const meta = repo.metadata;
    const results: Array<{
      uuid: string;
      action: 'created' | 'updated' | 'skipped' | 'error';
      error?: string;
    }> = [];

    for (const record of body.records || []) {
      const uuid = String(record.uuid || '');
      if (!uuid) {
        results.push({ uuid: '', action: 'error', error: 'uuid manquant' });
        continue;
      }
      try {
        const action =
          def.name === 'SchoolProfile'
            ? await this.applySchoolProfileSingleton(
                repo,
                meta,
                def.timeField,
                record,
                body.sourceNodeId,
              )
            : await this.applyOne(
                def.name,
                repo,
                meta,
                def.timeField,
                record,
                body.sourceNodeId,
              );
        results.push({ uuid, action });
      } catch (err: any) {
        results.push({
          uuid,
          action: 'error',
          error: err?.message || String(err),
        });
      }
    }

    const applied = results.filter(
      (r) => r.action === 'created' || r.action === 'updated',
    ).length;
    const skipped = results.filter((r) => r.action === 'skipped').length;
    const errors = results.filter((r) => r.action === 'error').length;

    return {
      entity: body.entity,
      sourceNodeId: body.sourceNodeId ?? null,
      results,
      applied,
      skipped,
      errors,
    };
  }

  /**
   * Nouveaux champs établissement + signatures : un null/vide distant
   * n’efface jamais une valeur locale déjà renseignée
   * (adresse, téléphone, email, logo, signatures PNG, etc.).
   */
  private static readonly SCHOOL_PROFILE_PRESERVE_FIELDS = [
    'address',
    'phone',
    'email',
    'logo_url',
    'slogan',
    'domain',
    'name',
    'primary_color',
    'secondary_color',
  ] as const;

  private static readonly SCHOOL_SIGNATURE_PRESERVE_FIELDS = [
    'image_url',
    'signer_name',
    'signer_role',
    'slot_key',
  ] as const;

  private isBlank(v: unknown): boolean {
    return v == null || (typeof v === 'string' && v.trim() === '');
  }

  private mergePreserveFields(
    existing: Record<string, unknown> | null | undefined,
    incoming: Record<string, unknown>,
    fields: readonly string[],
  ): Record<string, unknown> {
    const out: Record<string, unknown> = { ...incoming };
    if (!existing) return out;
    for (const f of fields) {
      if (this.isBlank(out[f]) && !this.isBlank(existing[f])) {
        out[f] = existing[f];
      }
    }
    // Propriétés absentes du filaire cloud (ancienne version) → garder le local
    for (const f of fields) {
      if (
        !Object.prototype.hasOwnProperty.call(out, f) &&
        !this.isBlank(existing[f])
      ) {
        out[f] = existing[f];
      }
    }
    return out;
  }

  private mergeSchoolProfileData(
    existing: Record<string, unknown> | null | undefined,
    incoming: Record<string, unknown>,
  ): Record<string, unknown> {
    return this.mergePreserveFields(
      existing,
      incoming,
      SyncService.SCHOOL_PROFILE_PRESERVE_FIELDS,
    );
  }

  private mergeSchoolSignatureData(
    existing: Record<string, unknown> | null | undefined,
    incoming: Record<string, unknown>,
  ): Record<string, unknown> {
    return this.mergePreserveFields(
      existing,
      incoming,
      SyncService.SCHOOL_SIGNATURE_PRESERVE_FIELDS,
    );
  }

  /**
   * SchoolProfile = une seule ligne. LWW adopte l’UUID gagnant et
   * supprime les doublons locaux.
   */
  private async applySchoolProfileSingleton(
    repo: Repository<any>,
    meta: EntityMetadata,
    timeField: 'updated_at' | 'created_at',
    record: {
      uuid: string;
      updatedAt?: string;
      deletedAt?: string | null;
      data: Record<string, unknown>;
    },
    sourceNodeId?: string,
  ): Promise<'created' | 'updated' | 'skipped'> {
    const all = await repo.find({ order: { created_at: 'ASC' } as any });
    const incomingAt = this.parseTime(record.updatedAt);
    const keepId = String(record.uuid);

    if (all.length === 0) {
      await this.persist(
        repo,
        meta,
        keepId,
        record.data,
        record.updatedAt,
        timeField,
      );
      return 'created';
    }

    const newestLocal = all.reduce((a, b) =>
      this.parseTime(a[timeField]).getTime() >=
      this.parseTime(b[timeField]).getTime()
        ? a
        : b,
    );
    const existingAt = this.parseTime(newestLocal[timeField]);

    if (!this.shouldApply(incomingAt, existingAt, sourceNodeId)) {
      await this.deleteProfilesExcept(repo, String(newestLocal.id));
      return 'skipped';
    }

    // Fusionner le contact local avant d’appliquer le filaire cloud (souvent null).
    const merged = this.mergeSchoolProfileData(
      newestLocal as Record<string, unknown>,
      record.data,
    );

    const existed = all.some((p) => String(p.id) === keepId);
    // Réassigner les signatures avant suppression (évite CASCADE wipe).
    try {
      const localIds = all.map((p) => String(p.id));
      await this.dataSource.query(
        `UPDATE school_signature
         SET school_profile_id = $1
         WHERE school_profile_id = ANY($2::uuid[])`,
        [keepId, localIds],
      );
    } catch {
      /* table absente sur très vieux schémas */
    }
    await this.deleteProfilesExcept(repo, keepId);
    await this.persist(
      repo,
      meta,
      keepId,
      merged,
      record.updatedAt,
      timeField,
    );
    return existed ? 'updated' : 'created';
  }

  private async deleteProfilesExcept(
    repo: Repository<any>,
    keepId: string,
  ): Promise<void> {
    await repo
      .createQueryBuilder()
      .delete()
      .where('id != :keepId', { keepId })
      .execute();
  }

  private async applyOne(
    entityName: SyncEntityName,
    repo: Repository<any>,
    meta: EntityMetadata,
    timeField: 'updated_at' | 'created_at',
    record: {
      uuid: string;
      updatedAt?: string;
      deletedAt?: string | null;
      data: Record<string, unknown>;
    },
    sourceNodeId?: string,
  ): Promise<'created' | 'updated' | 'skipped'> {
    const primaryId = this.coercePrimaryId(meta, record.uuid);
    const existing = await repo.findOne({
      where: { id: primaryId } as any,
      loadRelationIds: true,
    });

    if (APPEND_ONLY_ENTITIES.has(entityName)) {
      if (existing) return 'skipped';
      await this.persist(
        repo,
        meta,
        primaryId,
        record.data,
        record.updatedAt,
        timeField,
      );
      return 'created';
    }

    if (!existing) {
      await this.persist(
        repo,
        meta,
        primaryId,
        record.data,
        record.updatedAt,
        timeField,
      );
      return 'created';
    }

    const incomingAt = this.parseTime(record.updatedAt);
    const existingAt = this.parseTime(existing[timeField]);

    if (!this.shouldApply(incomingAt, existingAt, sourceNodeId)) {
      return 'skipped';
    }

    let data = record.data;
    if (entityName === 'SchoolSignature') {
      data = this.mergeSchoolSignatureData(
        existing as Record<string, unknown>,
        record.data,
      );
    }

    await this.persist(
      repo,
      meta,
      primaryId,
      data,
      record.updatedAt,
      timeField,
    );
    return 'updated';
  }

  /** PK int (users) ou uuid string — le filaire est toujours string. */
  private coercePrimaryId(meta: EntityMetadata, uuid: string): string | number {
    const col = meta.primaryColumns[0];
    const t = col?.type;
    const numeric =
      t === Number ||
      t === 'int' ||
      t === 'int2' ||
      t === 'int4' ||
      t === 'int8' ||
      t === 'integer' ||
      t === 'bigint' ||
      t === 'smallint' ||
      t === 'float' ||
      t === 'float4' ||
      t === 'float8' ||
      t === 'double' ||
      t === 'decimal' ||
      t === 'numeric';
    if (numeric) {
      const n = Number(uuid);
      if (!Number.isFinite(n)) {
        throw new Error(`id numérique invalide: ${uuid}`);
      }
      return n;
    }
    return uuid;
  }

  /**
   * Last-write-wins sur updatedAt.
   * À égalité : le nœud local conserve ; le cloud accepte le local.
   */
  private shouldApply(
    incomingAt: Date,
    existingAt: Date,
    sourceNodeId?: string,
  ): boolean {
    const incoming = incomingAt.getTime();
    const existing = existingAt.getTime();
    if (incoming > existing) return true;
    if (incoming < existing) return false;

    const localTruth = this.isLocalTruthNode();
    const fromCloud = this.isCloudSource(sourceNodeId);
    if (localTruth && fromCloud) return false;
    if (!localTruth && !fromCloud) return true;
    return false;
  }

  private parseTime(value: unknown): Date {
    if (value instanceof Date) return value;
    if (typeof value === 'string' || typeof value === 'number') {
      const d = new Date(value);
      if (!Number.isNaN(d.getTime())) return d;
    }
    return new Date(0);
  }

  private toIso(value: unknown): string {
    const d = this.parseTime(value);
    return d.toISOString();
  }

  private toWireData(entity: any, meta: EntityMetadata): Record<string, unknown> {
    const data: Record<string, unknown> = {};
    for (const col of meta.columns) {
      if (col.relationMetadata) continue;
      const prop = col.propertyName;
      if (prop === 'id') continue;
      let v = entity[prop];
      if (v instanceof Date) v = v.toISOString();
      data[prop] = v ?? null;
    }
    for (const rel of meta.relations) {
      if (!(rel.isManyToOne || (rel.isOneToOne && rel.isOwning))) continue;
      const prop = rel.propertyName;
      const v = entity[prop];
      if (v == null) {
        data[prop] = null;
      } else if (typeof v === 'string' || typeof v === 'number') {
        data[prop] = v;
      } else if (typeof v === 'object' && v.id != null) {
        data[prop] = v.id;
      } else {
        data[prop] = null;
      }
    }
    return data;
  }

  private async persist(
    repo: Repository<any>,
    meta: EntityMetadata,
    primaryId: string | number,
    data: Record<string, unknown>,
    updatedAt: string | undefined,
    timeField: 'updated_at' | 'created_at',
  ): Promise<void> {
    let incoming = data;
    const table = (meta.tableName || '').replace(/"/g, '');
    if (table === 'school_profile' || table === 'school_signature') {
      try {
        const existing = await repo.findOne({
          where: { id: primaryId } as any,
        });
        if (existing) {
          incoming =
            table === 'school_profile'
              ? this.mergeSchoolProfileData(
                  existing as Record<string, unknown>,
                  data,
                )
              : this.mergeSchoolSignatureData(
                  existing as Record<string, unknown>,
                  data,
                );
        }
      } catch {
        /* ignore */
      }
    }

    const payload: Record<string, unknown> = { id: primaryId };
    // Chemins uploads/… → URL GCS publique (affichage Server ↔ Remote).
    normalizeMediaFieldsInPlace(incoming);

    for (const col of meta.columns) {
      if (col.relationMetadata) continue;
      const prop = col.propertyName;
      if (prop === 'id') continue;
      if (Object.prototype.hasOwnProperty.call(incoming, prop)) {
        payload[prop] = incoming[prop];
      }
    }

    for (const rel of meta.relations) {
      if (!(rel.isManyToOne || (rel.isOneToOne && rel.isOwning))) continue;
      const prop = rel.propertyName;
      if (!Object.prototype.hasOwnProperty.call(incoming, prop)) continue;
      const fk = incoming[prop];
      if (fk == null || fk === '') {
        payload[prop] = null;
      } else {
        const fkId =
          typeof fk === 'string' && /^\d+$/.test(fk) ? Number(fk) : fk;
        payload[prop] = { id: fkId };
      }
    }

    if (updatedAt && timeField === 'updated_at') {
      payload.updated_at = new Date(updatedAt);
    }

    const entity = repo.create(payload as any);
    await repo.save(entity);

    if (typeof primaryId === 'number') {
      const table = meta.tableName.replace(/"/g, '');
      const schema = (meta.schema || 'public').replace(/"/g, '');
      await this.dataSource.query(
        `SELECT setval(
           pg_get_serial_sequence($1, 'id'),
           (SELECT COALESCE(MAX(id), 1) FROM "${schema}"."${table}")
         )`,
        [`${schema}.${table}`],
      );
    }
  }
}
