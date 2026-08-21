import axios from 'axios';
import { ENTITY_ORDER } from './entities.js';

export function createApiClient(baseURL, syncKey) {
  return axios.create({
    baseURL: baseURL.replace(/\/$/, ''),
    timeout: 120_000,
    maxBodyLength: 12 * 1024 * 1024,
    maxContentLength: 12 * 1024 * 1024,
    headers: {
      'X-Sync-Key': syncKey,
      'Content-Type': 'application/json',
    },
  });
}

function readCursor(cursors, entity) {
  const cur = cursors[entity];
  if (!cur) return { t: '1970-01-01T00:00:00.000000Z', id: null };
  if (typeof cur === 'string') return { t: cur, id: null };
  return {
    t: cur.t || '1970-01-01T00:00:00.000000Z',
    id: cur.id || null,
  };
}

/**
 * Pull deltas from `from` and push them to `to`.
 * Curseur avancé même si certaines lignes échouent (une salle / un NISU
 * ne doit pas geler 1000 élèves). Les erreurs sont loguées.
 * Curseur composite { t, id } pour éviter le blocage µs.
 *
 * @param {object} opts
 * @param {string[]} [opts.entities] sous-ensemble (ex. ['SyncTombstone'])
 */
export async function replicateDirection({
  from,
  to,
  cursors,
  sourceNodeId,
  label,
  entities = ENTITY_ORDER,
}) {
  const summary = { label, entities: {} };
  const list = entities?.length ? entities : ENTITY_ORDER;

  for (const entity of list) {
    let cursor = readCursor(cursors, entity);
    let pulled = 0;
    let applied = 0;
    let skipped = 0;
    let errors = 0;
    const errorSamples = [];
    let pages = 0;
    let blocked = false;

    for (;;) {
      pages += 1;
      const params = {
        entity,
        since: cursor.t,
        take: 50,
      };
      if (cursor.id) params.afterId = cursor.id;

      const { data } = await from.get('/sync/pull', { params });
      const records = data.records || [];
      if (records.length === 0) {
        if (data.nextCursor) {
          cursors[entity] = {
            t: data.nextCursor,
            id: data.nextAfterId || null,
          };
        }
        break;
      }

      pulled += records.length;
      let pushRes;
      try {
        pushRes = await to.post('/sync/push', {
          entity,
          sourceNodeId,
          records,
        });
      } catch (err) {
        const status = err?.response?.status;
        const detail = err?.response?.data
          ? JSON.stringify(err.response.data)
          : err?.message || String(err);
        if (status === 413 || /too large|entity\.too\.large/i.test(detail)) {
          throw new Error(
            `${entity}: lot sync trop gros (${records.length} lignes, HTTP 413). ${detail}`,
          );
        }
        throw err;
      }
      const batchApplied = pushRes.data?.applied ?? 0;
      const batchSkipped = pushRes.data?.skipped ?? 0;
      const batchErrors = pushRes.data?.errors ?? 0;
      applied += batchApplied;
      skipped += batchSkipped;
      errors += batchErrors;

      if (batchErrors > 0) {
        blocked = true;
        const failed = (pushRes.data?.results || [])
          .filter((r) => r.action === 'error')
          .slice(0, 5)
          .map((r) => `${r.uuid}: ${r.error || 'error'}`);
        errorSamples.push(...failed);
      }

      cursor = {
        t:
          data.nextCursor ||
          records[records.length - 1]?.updatedAt ||
          cursor.t,
        id:
          data.nextAfterId ||
          records[records.length - 1]?.uuid ||
          cursor.id,
      };
      cursors[entity] = cursor;

      if (records.length < 50 || pages > 80) break;
    }

    summary.entities[entity] = {
      pulled,
      applied,
      skipped,
      errors,
      blocked,
      cursor: cursors[entity],
      ...(errorSamples.length ? { errorSamples } : {}),
    };
  }

  return summary;
}
