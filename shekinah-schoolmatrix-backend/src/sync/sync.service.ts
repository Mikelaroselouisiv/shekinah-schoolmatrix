/**
 * Sync SchoolMatrix — protocole état (uuid + curseur temporel composite).
 * Conflits : last-write-wins (updatedAt) ; à horodatage égal, le local gagne.
 * Suppressions : sync_tombstone (LWW deleted_at vs updated_at cible).
 * SchoolProfile est un singleton (dédup + adoption UUID gagnant).
 */
import {
  BadRequestException,
  Injectable,
  OnModuleInit,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityMetadata, In, Repository } from 'typeorm';
import { SyncNode } from './sync-node.entity';
import { SyncEvent } from './sync-event.entity';
import { SyncTombstone } from './sync-tombstone.entity';
import { SyncKickService } from './sync-kick.service';
import {
  APPEND_ONLY_ENTITIES,
  SYNC_ENTITY_MAP,
  SyncEntityName,
  listSyncEntityNames,
} from './sync.entities';
import { normalizeMediaFieldsInPlace } from '../uploads/media-url';
import { Role } from '../roles/role.entity';
import {
  TEACHER_ROLE_NAMES,
  isTeacherRoleName,
} from '../roles/roles.constants';
import { Account } from '../finance/account.entity';
import { Exercice } from '../finance/exercice.entity';
import { User } from '../users/user.entity';
import { alignCurrentYearClass } from '../formation-classe/align-current-year-class';

/** Entités dont la FK personne est un id serial User (pas un UUID). */
const USER_FK_SPECS: Partial<
  Record<SyncEntityName, { rel: string; col: string; emailKey: string }>
> = {
  TeacherClassSubject: { rel: 'teacher', col: 'teacher_id', emailKey: 'teacher_email' },
  ClassTeacher: { rel: 'teacher', col: 'user_id', emailKey: 'teacher_email' },
  TeacherSubject: { rel: 'teacher', col: 'teacher_id', emailKey: 'teacher_email' },
  ScheduleSlot: { rel: 'teacher', col: 'teacher_id', emailKey: 'teacher_email' },
  HomeworkAssignment: { rel: 'teacher', col: 'teacher_id', emailKey: 'teacher_email' },
  SchoolWeekDuty: {
    rel: 'responsible',
    col: 'responsible_user_id',
    emailKey: 'responsible_email',
  },
};

export type SyncWireRecord = {
  uuid: string;
  updatedAt: string;
  deletedAt: string | null;
  data: Record<string, unknown>;
};

@Injectable()
export class SyncService implements OnModuleInit {
  private nodeId: string = 'LOCAL';
  /** Évite les boucles subscriber pendant apply tombstone distant. */
  private applyingRemoteTombstone = 0;
  /** Cache existence FK pendant un push (salle absente ≠ bloquer l’élève). */
  private fkExistCache = new Map<string, Set<string>>();
  private fkMissCache = new Map<string, Set<string>>();
  /** role.name → id local (les ids ne voyagent pas : seed / renommage TEACHER). */
  private roleByNameCache = new Map<string, number | null>();
  /** User serial GCP → serial local (même e-mail, ids différents). */
  private userIdAlias = new Map<number, number>();

  constructor(
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
    @InjectRepository(SyncNode)
    private readonly syncNodeRepo: Repository<SyncNode>,
    @InjectRepository(SyncEvent)
    private readonly syncEventRepo: Repository<SyncEvent>,
    @InjectRepository(SyncTombstone)
    private readonly tombstoneRepo: Repository<SyncTombstone>,
    @Inject(forwardRef(() => SyncKickService))
    private readonly syncKick: SyncKickService,
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

  isApplyingRemoteTombstone(): boolean {
    return this.applyingRemoteTombstone > 0;
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

  /**
   * Enregistre / rafraîchit un tombstone puis kick l’agent.
   * Appelé avant/après hard delete métier (ou via subscriber ORM).
   */
  async markDeleted(
    entityName: SyncEntityName,
    entityId: string | number,
    deletedAt?: Date,
    opts?: { kick?: boolean },
  ): Promise<void> {
    if (entityName === 'SyncTombstone' || entityName === 'SchoolProfile') {
      return;
    }
    const when = deletedAt ?? new Date();
    const eid = String(entityId);
    let row = await this.tombstoneRepo.findOne({
      where: { entity_name: entityName, entity_id: eid },
    });
    if (row) {
      if (this.parseTime(row.deleted_at).getTime() >= when.getTime()) {
        if (opts?.kick !== false) this.syncKick.kick(`tombstone:${entityName}`);
        return;
      }
      row.deleted_at = when;
      row.updated_at = when;
    } else {
      row = this.tombstoneRepo.create({
        entity_name: entityName,
        entity_id: eid,
        deleted_at: when,
        updated_at: when,
      });
    }
    await this.tombstoneRepo.save(row);
    if (opts?.kick !== false) this.syncKick.kick(`tombstone:${entityName}`);
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
      // Départage à égalité de timestamp : comparer l'id dans son type réel.
      // En texte '100' > '99' est faux, donc un import qui crée plus de 99
      // lignes dans la même transaction bloquait le curseur définitivement.
      const idColumn = meta.primaryColumns[0];
      const numericId =
        (idColumn?.type === Number ||
          ['int', 'int2', 'int4', 'int8', 'integer', 'smallint', 'bigint'].includes(
            String(idColumn?.type),
          )) &&
        /^\d+$/.test(after);
      const comparison = numericId
        ? 'e.id > CAST(:afterId AS bigint)'
        : 'CAST(e.id AS varchar) > :afterId';
      qb.where(
        `(e.${timeProp} > CAST(:since AS timestamptz) OR (e.${timeProp} = CAST(:since AS timestamptz) AND ${comparison}))`,
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

    const liveRows =
      entityName === 'SyncTombstone'
        ? await this.omitStaleTombstones(rows)
        : await this.omitRowsBeatenByDelete(
            entityName as SyncEntityName,
            rows,
            timeProp,
          );

    const withIds =
      liveRows.length === 0
        ? []
        : await repo.find({
            where: { id: In(liveRows.map((r: any) => r.id)) } as any,
            loadRelationIds: true,
          });
    const byId = new Map(withIds.map((r: any) => [String(r.id), r]));

    const cursorTsById = await this.loadCursorTimestamps(
      meta,
      timeProp,
      rows.map((r: any) => r.id),
    );

    const records: SyncWireRecord[] = liveRows.map((row: any) => {
      const full = byId.get(String(row.id)) ?? row;
      const cursorTs =
        cursorTsById.get(String(full.id)) ||
        this.toIso(full[timeProp] ?? row[timeProp]);
      const deletedAt =
        entityName === 'SyncTombstone'
          ? this.toIso(full.deleted_at ?? cursorTs)
          : null;
      return {
        uuid: String(full.id),
        updatedAt: cursorTs,
        deletedAt,
        data: this.toWireData(full, meta),
      };
    });
    if (entityName === 'User') {
      await this.attachUserRoleNames(records);
    }
    if (USER_FK_SPECS[entityName as SyncEntityName]) {
      await this.attachTeacherEmails(entityName as SyncEntityName, records);
    }
    if (entityName === 'JournalEntry') {
      await this.attachJournalEntryExerciceKeys(records);
    }
    if (entityName === 'JournalEntryLine') {
      await this.attachJournalLineAccountCodes(records);
    }

    // Curseur = dernier row lu (y compris deletes/lignes filtrés LWW).
    const lastRow: any = rows[rows.length - 1];
    const lastCursorTs =
      cursorTsById.get(String(lastRow.id)) ||
      this.toIso(lastRow[timeProp]);
    return {
      entity: entityName,
      records,
      nextCursor: lastCursorTs,
      nextAfterId: String(lastRow.id),
      count: records.length,
    };
  }

  /**
   * Ne pas exporter un delete plus vieux que la ligne vivante (nouveau compte
   * après une purge, même id serial). LWW : le write le plus récent gagne.
   */
  private async omitStaleTombstones(rows: any[]): Promise<any[]> {
    const kept: any[] = [];
    for (const row of rows) {
      const liveAt = await this.liveRowUpdatedAt(
        row.entity_name,
        row.entity_id,
      );
      if (
        liveAt &&
        !this.shouldApply(this.parseTime(row.deleted_at), liveAt, undefined)
      ) {
        continue;
      }
      kept.push(row);
    }
    return kept;
  }

  /** Masquer une ligne seulement si son delete est plus récent (anti-rebond). */
  private async omitRowsBeatenByDelete(
    entityName: SyncEntityName,
    rows: any[],
    timeProp: string,
  ): Promise<any[]> {
    const tombAt = await this.loadTombstoneDeletedAtMap(
      entityName,
      rows.map((r: any) => r.id),
    );
    if (tombAt.size === 0) return rows;
    return rows.filter((r: any) => {
      const deletedAt = tombAt.get(String(r.id));
      if (!deletedAt) return true;
      return this.shouldApply(
        this.parseTime(r[timeProp]),
        deletedAt,
        undefined,
      );
    });
  }

  private async loadTombstoneDeletedAtMap(
    entityName: SyncEntityName,
    ids: Array<string | number>,
  ): Promise<Map<string, Date>> {
    const out = new Map<string, Date>();
    if (ids.length === 0) return out;
    const rows: Array<{ entity_id: string; deleted_at: Date | string }> =
      await this.dataSource.query(
        `SELECT entity_id, deleted_at FROM sync_tombstone
         WHERE entity_name = $1 AND entity_id = ANY($2::text[])`,
        [entityName, ids.map((id) => String(id))],
      );
    for (const r of rows) {
      out.set(String(r.entity_id), this.parseTime(r.deleted_at));
    }
    return out;
  }

  private async loadTombstoneDeletedAt(
    entityName: SyncEntityName,
    entityId: string,
  ): Promise<Date | null> {
    const rows: Array<{ deleted_at: Date | string }> =
      await this.dataSource.query(
        `SELECT deleted_at FROM sync_tombstone
         WHERE entity_name = $1 AND entity_id = $2
         LIMIT 1`,
        [entityName, String(entityId)],
      );
    if (rows.length === 0) return null;
    return this.parseTime(rows[0].deleted_at);
  }

  /**
   * Un write vivant plus récent a gagné : ce delete ne s’applique plus
   * (nouveau compte, même id serial, après une purge).
   */
  async forgetDeleted(
    entityName: SyncEntityName,
    entityId: string | number,
  ): Promise<void> {
    if (entityName === 'SyncTombstone' || entityName === 'SchoolProfile') {
      return;
    }
    await this.dataSource.query(
      `DELETE FROM sync_tombstone
       WHERE entity_name = $1 AND entity_id = $2`,
      [entityName, String(entityId)],
    );
  }

  private async liveRowUpdatedAt(
    entityName: string,
    entityId: string,
  ): Promise<Date | null> {
    const def = SYNC_ENTITY_MAP.get(entityName as SyncEntityName);
    if (!def || entityName === 'SyncTombstone') return null;
    const repo = this.dataSource.getRepository(def.target);
    let primaryId: string | number;
    try {
      primaryId = this.coercePrimaryId(repo.metadata, entityId);
    } catch {
      return null;
    }
    const row = await repo.findOne({ where: { id: primaryId } as any });
    if (!row) return null;
    return this.parseTime(row[def.timeField]);
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
    this.fkExistCache.clear();
    this.fkMissCache.clear();
    this.roleByNameCache.clear();
    const results: Array<{
      uuid: string;
      action: 'created' | 'updated' | 'skipped' | 'deleted' | 'error';
      error?: string;
    }> = [];

    for (const record of body.records || []) {
      const uuid = String(record.uuid || '');
      if (!uuid) {
        results.push({ uuid: '', action: 'error', error: 'uuid manquant' });
        continue;
      }
      try {
        let action: 'created' | 'updated' | 'skipped' | 'deleted';
        if (def.name === 'SchoolProfile') {
          action = await this.applySchoolProfileSingleton(
            repo,
            meta,
            def.timeField,
            record,
            body.sourceNodeId,
          );
        } else if (def.name === 'SyncTombstone') {
          action = await this.applyTombstone(
            repo,
            meta,
            def.timeField,
            record,
            body.sourceNodeId,
          );
        } else {
          action = await this.applyOne(
            def.name,
            repo,
            meta,
            def.timeField,
            record,
            body.sourceNodeId,
          );
        }
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
      (r) =>
        r.action === 'created' ||
        r.action === 'updated' ||
        r.action === 'deleted',
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

    const merged = this.mergeSchoolProfileData(
      newestLocal as Record<string, unknown>,
      record.data,
    );

    const existed = all.some((p) => String(p.id) === keepId);
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

  private async applyTombstone(
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
  ): Promise<'created' | 'updated' | 'skipped' | 'deleted'> {
    const entityName = String(
      record.data?.entity_name || '',
    ) as SyncEntityName;
    const entityId = String(record.data?.entity_id || '');
    if (!entityName || !entityId || entityName === 'SyncTombstone') {
      throw new Error('tombstone invalide (entity_name / entity_id)');
    }

    const deletedAtRaw =
      record.data?.deleted_at ?? record.deletedAt ?? record.updatedAt;
    const deletedAt = this.parseTime(deletedAtRaw);

    const liveAt = await this.liveRowUpdatedAt(entityName, entityId);
    if (liveAt && !this.shouldApply(deletedAt, liveAt, sourceNodeId)) {
      // Ligne vivante plus récente (ex. nouveau parent local après purge) :
      // un vieux delete distant ne doit pas réinstaller le veto.
      await this.forgetDeleted(entityName, entityId);
      return 'skipped';
    }

    let existing = await repo.findOne({
      where: { entity_name: entityName, entity_id: entityId } as any,
    });
    if (!existing) {
      existing = await repo.findOne({
        where: { id: record.uuid } as any,
      });
    }

    if (existing) {
      const existingAt = this.parseTime(
        existing.deleted_at ?? existing[timeField],
      );
      if (!this.shouldApply(deletedAt, existingAt, sourceNodeId)) {
        await this.deleteTargetIfStale(
          entityName,
          entityId,
          existingAt,
          sourceNodeId,
        );
        return 'skipped';
      }
    }

    const payload = {
      entity_name: entityName,
      entity_id: entityId,
      deleted_at: deletedAt.toISOString(),
      updated_at: deletedAt.toISOString(),
      created_at: existing?.created_at
        ? this.toIso(existing.created_at)
        : deletedAt.toISOString(),
    };

    const tombId = existing ? existing.id : record.uuid;
    await this.persist(repo, meta, tombId, payload, record.updatedAt, timeField);
    await this.dataSource.query(
      `UPDATE sync_tombstone
       SET deleted_at = $2::timestamptz,
           updated_at = $2::timestamptz
       WHERE id = $1::uuid`,
      [tombId, deletedAt.toISOString()],
    );

    const removed = await this.deleteTargetIfStale(
      entityName,
      entityId,
      deletedAt,
      sourceNodeId,
    );
    return removed ? 'deleted' : existing ? 'updated' : 'created';
  }

  private async deleteTargetIfStale(
    entityName: SyncEntityName,
    entityId: string,
    deletedAt: Date,
    _sourceNodeId?: string,
  ): Promise<boolean> {
    const def = SYNC_ENTITY_MAP.get(entityName);
    if (!def || entityName === 'SyncTombstone') return false;
    const targetRepo = this.dataSource.getRepository(def.target);
    const meta = targetRepo.metadata;
    let primaryId: string | number;
    try {
      primaryId = this.coercePrimaryId(meta, entityId);
    } catch {
      return false;
    }
    const existing = await targetRepo.findOne({
      where: { id: primaryId } as any,
    });
    if (!existing) return false;
    const existingAt = this.parseTime(existing[def.timeField]);
    // Tombstone explicite : delete si deleted_at >= updated_at cible.
    if (deletedAt.getTime() < existingAt.getTime()) return false;

    this.applyingRemoteTombstone += 1;
    try {
      // Nettoyage dépendances avant delete (schémas sans CASCADE / anciennes FK).
      if (entityName === 'User') {
        try {
          await this.dataSource.query(
            `DELETE FROM user_linked_student WHERE user_id = $1`,
            [primaryId],
          );
        } catch {
          /* table absente */
        }
        try {
          await this.dataSource.query(
            `DELETE FROM student_parent WHERE user_id = $1`,
            [primaryId],
          );
        } catch {
          /* table absente */
        }
      }
      await targetRepo.delete(primaryId as any);
    } catch {
      // Ne pas faire échouer tout le batch SyncTombstone (bloque le curseur agent).
      return false;
    } finally {
      this.applyingRemoteTombstone -= 1;
    }
    return true;
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
  ): Promise<'created' | 'updated' | 'skipped' | 'deleted'> {
    let primaryId = this.coercePrimaryId(meta, record.uuid);
    let existing = await repo.findOne({
      where: { id: primaryId } as any,
      loadRelationIds: true,
    });
    let data = record.data;
    if (entityName === 'User') {
      data = await this.mapUserRoleForLocal(data);
      const localId = await this.redirectUserToLocalEmail(primaryId, data);
      if (localId != null) {
        primaryId = localId;
        existing = await repo.findOne({
          where: { id: primaryId } as any,
          loadRelationIds: true,
        });
      }
    }
    if (USER_FK_SPECS[entityName]) {
      data = await this.mapTeacherUserFkForLocal(entityName, data);
    }
    if (entityName === 'JournalEntry') {
      data = await this.mapJournalEntryExerciceForLocal(data);
    }
    if (entityName === 'JournalEntryLine') {
      data = await this.mapJournalLineAccountForLocal(data);
    }
    const incomingAt = this.parseTime(record.updatedAt);
    const tombAt = await this.loadTombstoneDeletedAt(
      entityName,
      String(record.uuid),
    );

    if (tombAt && !this.shouldApply(incomingAt, tombAt, sourceNodeId)) {
      // Ce write a perdu contre un delete plus récent — anti-rebond.
      if (existing) {
        const existingAt = this.parseTime(existing[timeField]);
        if (existingAt.getTime() > tombAt.getTime()) {
          return 'skipped';
        }
        this.applyingRemoteTombstone += 1;
        try {
          if (entityName === 'User') {
            try {
              await this.dataSource.query(
                `DELETE FROM user_linked_student WHERE user_id = $1`,
                [primaryId],
              );
            } catch {
              /* ignore */
            }
            try {
              await this.dataSource.query(
                `DELETE FROM student_parent WHERE user_id = $1`,
                [primaryId],
              );
            } catch {
              /* ignore */
            }
          }
          await repo.delete(primaryId as any);
        } catch {
          return 'skipped';
        } finally {
          this.applyingRemoteTombstone -= 1;
        }
        return 'deleted';
      }
      return 'skipped';
    }

    if (tombAt) {
      await this.forgetDeleted(entityName, String(record.uuid));
    }

    if (APPEND_ONLY_ENTITIES.has(entityName)) {
      if (existing) return 'skipped';
      const wrote = await this.persistSyncedRow(
        entityName,
        repo,
        meta,
        primaryId,
        data,
        record.updatedAt,
        timeField,
        sourceNodeId,
      );
      return wrote === 'skipped' ? 'skipped' : 'created';
    }

    if (!existing) {
      const wrote = await this.persistSyncedRow(
        entityName,
        repo,
        meta,
        primaryId,
        data,
        record.updatedAt,
        timeField,
        sourceNodeId,
      );
      return wrote === 'skipped' ? 'skipped' : 'created';
    }

    const existingAt = this.parseTime(existing[timeField]);

    if (!this.shouldApply(incomingAt, existingAt, sourceNodeId)) {
      if (entityName === 'User') {
        await this.healUserRoleId(primaryId, record.data);
      }
      return 'skipped';
    }

    if (entityName === 'SchoolSignature') {
      data = this.mergeSchoolSignatureData(
        existing as Record<string, unknown>,
        data,
      );
    }

    const wrote = await this.persistSyncedRow(
      entityName,
      repo,
      meta,
      primaryId,
      data,
      record.updatedAt,
      timeField,
      sourceNodeId,
    );
    return wrote === 'skipped' ? 'skipped' : 'updated';
  }

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

  private toWireData(
    entity: any,
    meta: EntityMetadata,
  ): Record<string, unknown> {
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
    normalizeMediaFieldsInPlace(incoming);

    for (const rel of meta.relations) {
      if (!(rel.isManyToOne || (rel.isOneToOne && rel.isOwning))) continue;
      const prop = rel.propertyName;
      if (Object.prototype.hasOwnProperty.call(incoming, prop)) continue;
      const joinProp = rel.joinColumns?.[0]?.propertyName;
      const joinDb = rel.joinColumns?.[0]?.databaseName;
      if (joinProp && Object.prototype.hasOwnProperty.call(incoming, joinProp)) {
        incoming = { ...incoming, [prop]: incoming[joinProp] };
      } else if (
        joinDb &&
        Object.prototype.hasOwnProperty.call(incoming, joinDb)
      ) {
        incoming = { ...incoming, [prop]: incoming[joinDb] };
      }
    }

    for (const col of meta.columns) {
      if (col.relationMetadata) continue;
      const prop = col.propertyName;
      if (prop === 'id') continue;
      if (Object.prototype.hasOwnProperty.call(incoming, prop)) {
        const v = incoming[prop];
        payload[prop] =
          typeof v === 'string' && v.trim() === '' && col.isNullable
            ? null
            : v;
      }
    }

    for (const rel of meta.relations) {
      if (!(rel.isManyToOne || (rel.isOneToOne && rel.isOwning))) continue;
      const prop = rel.propertyName;
      if (!Object.prototype.hasOwnProperty.call(incoming, prop)) continue;
      const fk = incoming[prop];
      if (fk == null || fk === '') {
        payload[prop] = null;
        continue;
      }
      const fkId = this.coerceRelationId(fk);
      if (fkId == null) {
        payload[prop] = null;
        continue;
      }
      if (this.isOptionalRelation(rel)) {
        const exists = await this.relationTargetExists(rel, fkId);
        if (!exists) {
          payload[prop] = null;
          continue;
        }
      }
      payload[prop] = { id: fkId };
    }

    if (updatedAt && timeField === 'updated_at') {
      payload.updated_at = new Date(updatedAt);
    }

    const entity = repo.create(payload as any);
    try {
      await repo.save(entity, { listeners: false });
    } catch (err) {
      if (!this.isForeignKeyViolation(err)) throw err;
      let dropped = false;
      for (const rel of meta.relations) {
        if (!(rel.isManyToOne || (rel.isOneToOne && rel.isOwning))) continue;
        if (!this.isOptionalRelation(rel)) continue;
        if (payload[rel.propertyName] != null) {
          payload[rel.propertyName] = null;
          dropped = true;
        }
      }
      if (!dropped) throw err;
      await repo.save(repo.create(payload as any), { listeners: false });
    }

    if (typeof primaryId === 'number') {
      await this.bumpSerialForward(meta);
    }
  }

  private coerceRelationId(fk: unknown): string | number | null {
    if (fk == null || fk === '') return null;
    if (typeof fk === 'number' && Number.isFinite(fk)) return fk;
    if (typeof fk === 'string') {
      const t = fk.trim();
      if (!t) return null;
      if (/^\d+$/.test(t)) return Number(t);
      return t;
    }
    if (typeof fk === 'object' && fk !== null && 'id' in (fk as { id?: unknown })) {
      return this.coerceRelationId((fk as { id: unknown }).id);
    }
    return null;
  }

  private isOptionalRelation(
    rel: EntityMetadata['relations'][number],
  ): boolean {
    if (rel.isNullable === true) return true;
    if (rel.isNullable === false) return false;
    return rel.joinColumns?.some((c) => c.isNullable) ?? false;
  }

  /**
   * persist + fusion de la clé naturelle school_week_duty
   * (une dévotion par année / jour : éviter 23505 et un curseur qui saute).
   */
  private async persistSyncedRow(
    entityName: SyncEntityName,
    repo: Repository<any>,
    meta: EntityMetadata,
    primaryId: string | number,
    data: Record<string, unknown>,
    updatedAt: string | undefined,
    timeField: 'updated_at' | 'created_at',
    sourceNodeId?: string,
  ): Promise<'ok' | 'skipped'> {
    try {
      await this.persist(repo, meta, primaryId, data, updatedAt, timeField);
      await this.alignSyncedStudentClass(entityName, primaryId, data);
      return 'ok';
    } catch (err) {
      if (entityName === 'SchoolWeekDuty' && this.isUniqueViolation(err)) {
        return this.reconcileSchoolWeekDutyUnique(
          repo,
          meta,
          primaryId,
          data,
          updatedAt,
          timeField,
          sourceNodeId,
        );
      }
      if (
        (entityName === 'TeacherClassSubject' ||
          entityName === 'ClassTeacher' ||
          entityName === 'TeacherSubject' ||
          entityName === 'ClassSubject') &&
        this.isUniqueViolation(err)
      ) {
        return 'skipped';
      }
      if (entityName === 'Account' && this.isUniqueViolation(err)) {
        return 'skipped';
      }
      if (entityName === 'User' && this.isUniqueViolation(err)) {
        const localId = await this.redirectUserToLocalEmail(primaryId, data);
        await this.healUserRoleId(localId ?? primaryId, data);
        return 'skipped';
      }
      throw err;
    }
  }

  private async alignSyncedStudentClass(
    entityName: SyncEntityName,
    primaryId: string | number,
    data: Record<string, unknown>,
  ): Promise<void> {
    if (entityName === 'Student' && typeof primaryId === 'string') {
      await alignCurrentYearClass(this.dataSource, primaryId);
      return;
    }
    if (entityName !== 'StudentClassAssignment') return;
    const rel = data.student;
    const studentId =
      (typeof data.student_id === 'string' && data.student_id) ||
      (typeof rel === 'string' && rel) ||
      (rel && typeof rel === 'object' && 'id' in rel
        ? String((rel as { id: unknown }).id)
        : '');
    if (studentId) await alignCurrentYearClass(this.dataSource, studentId);
  }

  private isUniqueViolation(err: unknown): boolean {
    const e = err as { code?: string; driverError?: { code?: string } };
    return e?.code === '23505' || e?.driverError?.code === '23505';
  }

  /**
   * `role_id` est local (seed / TEACHER renommé). Le filaire porte `role_name`.
   * Sans ça, un Server frais voit les profs comme un autre rôle → annuaire vide,
   * alors que Remote affiche les mêmes personnes sur les classes.
   */
  private async attachUserRoleNames(records: SyncWireRecord[]): Promise<void> {
    if (records.length === 0) return;
    const roles = await this.dataSource.getRepository(Role).find();
    const byId = new Map(roles.map((r) => [Number(r.id), r.name]));
    for (const rec of records) {
      const raw = rec.data.role;
      const id =
        typeof raw === 'number'
          ? raw
          : typeof raw === 'string' && /^\d+$/.test(raw)
            ? Number(raw)
            : null;
      const name = id != null ? byId.get(id) : undefined;
      if (name) rec.data.role_name = name;
    }
  }

  private async mapUserRoleForLocal(
    data: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const name =
      typeof data.role_name === 'string' ? data.role_name.trim() : '';
    if (!name) return data;
    const roleId = await this.resolveSyncedRoleId(name);
    if (roleId == null) return data;
    return { ...data, role: roleId };
  }

  private async healUserRoleId(
    userId: string | number,
    data: Record<string, unknown>,
  ): Promise<void> {
    const name =
      typeof data.role_name === 'string' ? data.role_name.trim() : '';
    if (!name) return;
    const roleId = await this.resolveSyncedRoleId(name);
    if (roleId == null) return;
    const id = typeof userId === 'number' ? userId : Number(userId);
    const email =
      typeof data.email === 'string' ? data.email.trim() : '';
    if (Number.isFinite(id) && email) {
      await this.dataSource.query(
        `UPDATE users SET role_id = $1
         WHERE role_id IS DISTINCT FROM $1
           AND (id = $2 OR LOWER(email) = LOWER($3))`,
        [roleId, id, email],
      );
      return;
    }
    if (Number.isFinite(id)) {
      await this.dataSource.query(
        `UPDATE users SET role_id = $1 WHERE id = $2 AND role_id IS DISTINCT FROM $1`,
        [roleId, id],
      );
      return;
    }
    if (email) {
      await this.dataSource.query(
        `UPDATE users SET role_id = $1
         WHERE LOWER(email) = LOWER($2) AND role_id IS DISTINCT FROM $1`,
        [roleId, email],
      );
    }
  }

  /**
   * Même personne, ids serial différents (compte créé des deux côtés).
   * Sans ça, teacher_class_subject.teacher_id pointe vers un id GCP
   * absent du Server → FK, curseur avance, classes vides.
   */
  private async redirectUserToLocalEmail(
    incomingId: string | number,
    data: Record<string, unknown>,
  ): Promise<number | null> {
    const email =
      typeof data.email === 'string' ? data.email.trim() : '';
    const n = typeof incomingId === 'number' ? incomingId : Number(incomingId);
    if (!email || !Number.isFinite(n)) return null;
    const aliased = this.userIdAlias.get(n);
    if (aliased != null) return aliased;
    const local = await this.dataSource.getRepository(User).findOne({
      where: { email },
    });
    if (!local || local.id === n) return null;
    this.userIdAlias.set(n, local.id);
    return local.id;
  }

  private async attachTeacherEmails(
    entityName: SyncEntityName,
    records: SyncWireRecord[],
  ): Promise<void> {
    const spec = USER_FK_SPECS[entityName];
    if (!spec) return;
    const ids = new Set<number>();
    for (const rec of records) {
      const id = this.coerceRelationId(rec.data[spec.rel] ?? rec.data[spec.col]);
      if (typeof id === 'number') ids.add(id);
    }
    if (ids.size === 0) return;
    const rows: Array<{ id: number; email: string | null }> =
      await this.dataSource.query(
        `SELECT id, email FROM users WHERE id = ANY($1::int[])`,
        [Array.from(ids)],
      );
    const byId = new Map(rows.map((r) => [Number(r.id), r.email]));
    for (const rec of records) {
      const id = this.coerceRelationId(rec.data[spec.rel] ?? rec.data[spec.col]);
      if (typeof id !== 'number') continue;
      const email = byId.get(id);
      if (email) rec.data[spec.emailKey] = email;
    }
  }

  private async mapTeacherUserFkForLocal(
    entityName: SyncEntityName,
    data: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const spec = USER_FK_SPECS[entityName];
    if (!spec) return data;
    let incoming = this.coerceRelationId(data[spec.rel] ?? data[spec.col]);
    if (typeof incoming === 'number' && this.userIdAlias.has(incoming)) {
      incoming = this.userIdAlias.get(incoming) ?? incoming;
    }
    const email =
      typeof data[spec.emailKey] === 'string'
        ? String(data[spec.emailKey]).trim()
        : '';

    let localId: number | null = null;
    if (typeof incoming === 'number') {
      const hit: Array<{ id: number }> = await this.dataSource.query(
        `SELECT id FROM users WHERE id = $1 LIMIT 1`,
        [incoming],
      );
      if (hit.length) localId = incoming;
    }
    if (localId == null && email) {
      const local = await this.dataSource.getRepository(User).findOne({
        where: { email },
      });
      if (local) {
        localId = local.id;
        if (typeof incoming === 'number') this.userIdAlias.set(incoming, localId);
      }
    }
    if (localId == null) return data;
    return { ...data, [spec.rel]: localId, [spec.col]: localId };
  }

  private async resolveSyncedRoleId(name: string): Promise<number | null> {
    const key = name.toUpperCase().trim();
    if (!key) return null;
    if (this.roleByNameCache.has(key)) {
      return this.roleByNameCache.get(key) ?? null;
    }
    const repo = this.dataSource.getRepository(Role);
    const exact = await repo.findOne({ where: { name: key } });
    if (exact) {
      this.roleByNameCache.set(key, exact.id);
      return exact.id;
    }
    if (isTeacherRoleName(key)) {
      const alias = await repo.findOne({
        where: { name: In(TEACHER_ROLE_NAMES) },
      });
      const id = alias?.id ?? null;
      this.roleByNameCache.set(key, id);
      return id;
    }
    this.roleByNameCache.set(key, null);
    return null;
  }

  private async attachJournalEntryExerciceKeys(
    records: SyncWireRecord[],
  ): Promise<void> {
    if (records.length === 0) return;
    const exercices = await this.dataSource.getRepository(Exercice).find();
    const byId = new Map(exercices.map((e) => [e.id, e]));
    for (const rec of records) {
      const id = typeof rec.data.exercice === 'string' ? rec.data.exercice : null;
      const ex = id ? byId.get(id) : undefined;
      if (ex) {
        rec.data.exercice_date_debut = ex.date_debut;
        rec.data.exercice_date_fin = ex.date_fin;
      }
    }
  }

  private async mapJournalEntryExerciceForLocal(
    data: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const incomingId =
      typeof data.exercice === 'string' ? data.exercice.trim() : '';
    if (incomingId) {
      const hit = await this.dataSource.getRepository(Exercice).findOne({
        where: { id: incomingId },
      });
      if (hit) return data;
    }
    const debut =
      typeof data.exercice_date_debut === 'string'
        ? data.exercice_date_debut
        : '';
    const fin =
      typeof data.exercice_date_fin === 'string' ? data.exercice_date_fin : '';
    if (!debut || !fin) return data;
    const local = await this.dataSource.getRepository(Exercice).findOne({
      where: { date_debut: debut, date_fin: fin },
    });
    if (!local) return data;
    return { ...data, exercice: local.id };
  }

  private async attachJournalLineAccountCodes(
    records: SyncWireRecord[],
  ): Promise<void> {
    if (records.length === 0) return;
    const accounts = await this.dataSource.getRepository(Account).find();
    const byId = new Map(accounts.map((a) => [a.id, a.code]));
    for (const rec of records) {
      const id = typeof rec.data.account === 'string' ? rec.data.account : null;
      const code = id ? byId.get(id) : undefined;
      if (code) rec.data.account_code = code;
    }
  }

  private async mapJournalLineAccountForLocal(
    data: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const incomingId =
      typeof data.account === 'string' ? data.account.trim() : '';
    if (incomingId) {
      const hit = await this.dataSource.getRepository(Account).findOne({
        where: { id: incomingId },
      });
      if (hit) return data;
    }
    const code =
      typeof data.account_code === 'string' ? data.account_code.trim() : '';
    if (!code) return data;
    const local = await this.dataSource.getRepository(Account).findOne({
      where: { code },
    });
    if (!local) return data;
    return { ...data, account: local.id };
  }

  /**
   * FLAG : même (année, jour). RENTREE : même (année, cycle, jour, professeur).
   */
  private async reconcileSchoolWeekDutyUnique(
    repo: Repository<any>,
    meta: EntityMetadata,
    primaryId: string | number,
    data: Record<string, unknown>,
    updatedAt: string | undefined,
    timeField: 'updated_at' | 'created_at',
    sourceNodeId?: string,
  ): Promise<'ok' | 'skipped'> {
    const academic_year = String(data.academic_year ?? '').trim();
    const kind = String(data.kind ?? 'RENTREE').trim();
    const day_of_week = Number(data.day_of_week);
    if (!academic_year || !Number.isInteger(day_of_week)) {
      throw new BadRequestException(
        'school_week_duty: clé naturelle incomplète (unique)',
      );
    }
    const where =
      kind === 'FLAG' && String(data.cycle ?? '') === 'PRIMAIRE'
        ? { academic_year, kind: 'FLAG', cycle: 'PRIMAIRE', day_of_week }
        : data.manual_name
          ? {
              academic_year,
              kind,
              day_of_week,
              cycle: data.cycle ?? null,
              manual_name: data.manual_name,
            }
          : {
              academic_year,
              kind,
              day_of_week,
              cycle: data.cycle ?? null,
              responsible_user_id: data.responsible_user_id ?? null,
            };
    const other = await repo.findOne({
      where: where as any,
    });
    if (!other || String(other.id) === String(primaryId)) {
      throw new BadRequestException(
        'school_week_duty: conflit unique sans ligne existante',
      );
    }
    const incomingAt = this.parseTime(updatedAt);
    const otherAt = this.parseTime(other[timeField]);
    if (!this.shouldApply(incomingAt, otherAt, sourceNodeId)) {
      await this.markDeleted('SchoolWeekDuty', primaryId);
      return 'skipped';
    }
    await this.markDeleted('SchoolWeekDuty', other.id);
    this.applyingRemoteTombstone += 1;
    try {
      await repo.delete(other.id);
    } finally {
      this.applyingRemoteTombstone -= 1;
    }
    await this.persist(repo, meta, primaryId, data, updatedAt, timeField);
    return 'ok';
  }

  private isForeignKeyViolation(err: unknown): boolean {
    const e = err as { code?: string; driverError?: { code?: string } };
    return e?.code === '23503' || e?.driverError?.code === '23503';
  }

  private async relationTargetExists(
    rel: EntityMetadata['relations'][number],
    fkId: string | number,
  ): Promise<boolean> {
    const target = rel.inverseEntityMetadata;
    const table = (target.tableName || '').replace(/"/g, '');
    const schema = (target.schema || 'public').replace(/"/g, '');
    const pk = target.primaryColumns[0]?.databaseName || 'id';
    const cacheKey = `${schema}.${table}`;
    const idText = String(fkId);
    if (this.fkExistCache.get(cacheKey)?.has(idText)) return true;
    if (this.fkMissCache.get(cacheKey)?.has(idText)) return false;
    const rows: Array<{ ok: number }> = await this.dataSource.query(
      `SELECT 1 AS ok FROM "${schema}"."${table}" WHERE "${pk}"::text = $1 LIMIT 1`,
      [idText],
    );
    const exists = rows.length > 0;
    const bucket = exists ? this.fkExistCache : this.fkMissCache;
    if (!bucket.has(cacheKey)) bucket.set(cacheKey, new Set());
    bucket.get(cacheKey)!.add(idText);
    return exists;
  }

  /** Avancer la séquence jusqu’au MAX(id), jamais la rembobiner après un delete. */
  private async bumpSerialForward(meta: EntityMetadata): Promise<void> {
    const tableName = meta.tableName.replace(/"/g, '');
    const schema = (meta.schema || 'public').replace(/"/g, '');
    const seqRows: Array<{ seq: string | null }> = await this.dataSource.query(
      `SELECT pg_get_serial_sequence($1, 'id') AS seq`,
      [`${schema}.${tableName}`],
    );
    const seq = seqRows[0]?.seq;
    if (!seq) return;
    await this.dataSource.query(
      `SELECT setval(
         $1::regclass,
         GREATEST(
           COALESCE(
             (SELECT s.last_value FROM pg_sequences s
              WHERE (s.schemaname || '.' || s.sequencename)::regclass = $1::regclass),
             1
           ),
           (SELECT COALESCE(MAX(id), 1) FROM "${schema}"."${tableName}")
         )
       )`,
      [seq],
    );
  }
}
