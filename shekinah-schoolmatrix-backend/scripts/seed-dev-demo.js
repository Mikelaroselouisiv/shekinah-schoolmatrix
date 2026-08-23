/**
 * Jeu de données fictif pour Postgres DEV (shekinah-db-dev :5436 uniquement).
 *
 * Usage (depuis shekinah-schoolmatrix-backend) :
 *   node scripts/seed-dev-demo.js
 *
 * Mot de passe de tous les comptes fictifs : systeme12
 * Ne touche pas au SUPER_ADMIN existant (larosemikelson@gmail.com).
 * Ne pousse rien vers GCP. Pour voir ces données « côté Remote » :
 *   npm run dev:backend:cloud  puis  npm run dev:sync-lab
 */
'use strict';

const path = require('path');
const bcrypt = require('bcrypt');
const { Client } = require('pg');

const DEMO_PASSWORD = 'systeme12';
const YEAR = '2026-2027';
const YEAR_PREV = '2025-2026';
const DOMAIN = 'institutionmixteshekinah.com';
const PROTECTED_EMAILS = new Set(['larosemikelson@gmail.com']);

const FIRST_F = [
  'Mirlande', 'Woodline', 'Christelle', 'Natacha', 'Darline', 'Fabiola',
  'Sherley', 'Vanessa', 'Mikerlande', 'Roseline', 'Widline', 'Guerda',
  'Dieunane', 'Claudia', 'Stephanie', 'Johanne', 'Magdala', 'Emmanuella',
  'Ketia', 'Nadine', 'Carline', 'Judith', 'Sabrina', 'Melissa',
];
const FIRST_M = [
  'Widler', 'Mackenson', 'Junior', 'Rubens', 'Stevenson', 'Woodjy',
  'Ricardo', 'Peterson', 'Jameson', 'Frantz', 'Evens', 'Moise',
  'Duckens', 'James', 'Peterson', 'Samuel', 'Jean-Pierre', 'Widens',
  'Roodly', 'Luckner', 'Davidson', 'Jeff', 'Stanley', 'Ralph',
];
const LAST = [
  'JEAN', 'PIERRE', 'LOUIS', 'JOSEPH', 'CHARLES', 'FRANCOIS', 'AUGUSTIN',
  'DESTINE', 'EXANTUS', 'SAINT-FLEUR', 'CADET', 'METELLUS', 'DORCELY',
  'PAUL', 'MICHEL', 'ETIENNE', 'GUILLAUME', 'CELESTIN', 'ALEXIS',
  'SAINT-LOUIS', 'JEAN-BAPTISTE', 'DORVIL', 'LAFORTUNE', 'BEAUBRUN',
];
const CITIES = [
  'Port-au-Prince', 'Pétion-Ville', 'Delmas', 'Tabarre', 'Carrefour',
  'Croix-des-Bouquets', 'Jacmel', 'Cap-Haïtien',
];
const STREETS = [
  'Delmas 33', 'Rue Capois', 'Tabarre 27', 'Route de Frères',
  'Boulevard 15 octobre', 'Rue Pavée', 'Pétion-Ville, rue Faubert',
];

function slug(raw) {
  return String(raw ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 40) || 'user';
}

function emailFor(first, last, suffix) {
  const base = `${slug(first)}.${slug(last)}`;
  return `${suffix ? `${base}.${suffix}` : base}@${DOMAIN}`;
}

function pick(arr, i) {
  return arr[i % arr.length];
}

function birthForLevel(level, i) {
  const y =
    level === 'Préscolaire' ? 2022 - (i % 3)
    : level === 'Fondamental' ? 2018 - (i % 8)
    : 2010 - (i % 5);
  const m = String((i % 12) + 1).padStart(2, '0');
  const d = String((i % 27) + 1).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function nisu(n) {
  return `SHK${String(n).padStart(6, '0')}`;
}

async function main() {
  const host = process.env.DB_HOST || 'localhost';
  const port = Number(process.env.DB_PORT || 5436);
  if (!['localhost', '127.0.0.1'].includes(host) || ![5435, 5436].includes(port)) {
    throw new Error(`Refus : ce script ne cible que Postgres DEV local (reçu ${host}:${port}).`);
  }

  const client = new Client({
    host,
    port,
    user: process.env.DB_USER || 'schooluser',
    password: process.env.DB_PASS || 'schoolpass',
    database: process.env.DB_NAME || 'schoolmatrix',
  });
  await client.connect();

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const usedEmails = new Set();
  const usedPhones = new Set();
  let phoneSeq = 37120001;
  let nisuSeq = 100;

  function nextPhone() {
    let digits;
    do {
      digits = String(phoneSeq++);
    } while (usedPhones.has(digits));
    usedPhones.add(digits);
    return `+509 ${digits.slice(0, 4)}-${digits.slice(4)}`;
  }

  function uniqueEmail(first, last) {
    let suffix = 0;
    let em = emailFor(first, last);
    while (usedEmails.has(em)) {
      suffix += 1;
      em = emailFor(first, last, String(suffix));
    }
    usedEmails.add(em);
    return em;
  }

  try {
    await client.query('BEGIN');

    const existingPhones = await client.query(
      `SELECT REGEXP_REPLACE(COALESCE(phone, ''), '[^0-9]', '', 'g') AS d FROM users`,
    );
    for (const r of existingPhones.rows) {
      if (r.d) usedPhones.add(r.d);
    }
    const existingEmails = await client.query('SELECT lower(email) AS e FROM users');
    for (const r of existingEmails.rows) usedEmails.add(r.e);

    const roleRows = (await client.query('SELECT id, name FROM role')).rows;
    const roleId = Object.fromEntries(roleRows.map((r) => [r.name, r.id]));
    for (const needed of [
      'SUPER_ADMIN', 'DIRECTEUR_GENERAL', 'SCHOOL_ADMIN', 'DIRECTEUR_PEDAGOGIQUE',
      'CENSEUR', 'ADMIN_PRESCOLAIRE', 'ADMIN_FONDAMENTAL', 'ADMIN_SECONDAIRE',
      'ECONOME', 'COMPTABLE', 'DISCIPLINE', 'STAFF', 'TEACHER', 'PARENT', 'PHOTOGRAPHER',
    ]) {
      if (!roleId[needed]) throw new Error(`Rôle manquant : ${needed}`);
    }

    await client.query(
      `INSERT INTO academic_year (name, start_date, end_date, active)
       VALUES ($1, '2025-09-01', '2026-07-31', true)
       ON CONFLICT (name) DO NOTHING`,
      [YEAR_PREV],
    );
    await client.query(
      `UPDATE academic_year
       SET start_date = '2026-09-01', end_date = '2027-07-31', active = true, updated_at = now()
       WHERE name = $1`,
      [YEAR],
    );
    const yearId = (await client.query('SELECT id FROM academic_year WHERE name = $1', [YEAR])).rows[0].id;
    const yearPrevId = (await client.query('SELECT id FROM academic_year WHERE name = $1', [YEAR_PREV])).rows[0].id;

    const periodDefs = [
      ['1er Trimestre', 1],
      ['2e Trimestre', 2],
      ['3e Trimestre', 3],
    ];
    for (const [name, order] of periodDefs) {
      await client.query(
        `INSERT INTO period (academic_year_id, name, order_index)
         SELECT $1::uuid, $2::varchar, $3::smallint
         WHERE NOT EXISTS (
           SELECT 1 FROM period p WHERE p.academic_year_id = $1::uuid AND p.name = $2::varchar
         )`,
        [yearId, name, order],
      );
    }
    const periods = (await client.query(
      'SELECT id, name, order_index FROM period WHERE academic_year_id = $1 ORDER BY order_index',
      [yearId],
    )).rows;
    const t1 = periods[0];

    await client.query(
      `UPDATE school_profile SET
         slogan = COALESCE(NULLIF(slogan, ''), 'Former pour servir'),
         address = COALESCE(NULLIF(address, ''), 'Delmas 33, Port-au-Prince, Haïti'),
         phone = COALESCE(NULLIF(phone, ''), '+509 2812-4500'),
         email = COALESCE(NULLIF(email, ''), 'contact@' || $2),
         current_academic_year_id = $1,
         current_period_id = $3,
         updated_at = now()`,
      [yearId, DOMAIN, t1.id],
    );

    const classDefs = [
      { name: 'Petite Section', level: 'Préscolaire', section: 'PRESCOLAIRE', rooms: ['1', '2'] },
      { name: 'Moyenne Section', level: 'Préscolaire', section: 'PRESCOLAIRE', rooms: ['1', '2'] },
      { name: 'Grande Section', level: 'Préscolaire', section: 'PRESCOLAIRE', rooms: ['1', '2'] },
      { name: 'CP', level: 'Fondamental', section: 'FONDAMENTAL', rooms: ['1', '2'] },
      { name: '1ere Annee Fondamentale', level: 'Fondamental', section: 'FONDAMENTAL', rooms: ['1', '2'] },
      { name: '2eme Annee Fondamentale', level: 'Fondamental', section: 'FONDAMENTAL', rooms: ['1', '2'] },
      { name: '3eme Annee Fondamentale', level: 'Fondamental', section: 'FONDAMENTAL', rooms: ['1', '2'] },
      { name: '4eme Annee Fondamentale', level: 'Fondamental', section: 'FONDAMENTAL', rooms: ['1', '2'] },
      { name: '5eme Annee Fondamentale', level: 'Fondamental', section: 'FONDAMENTAL', rooms: ['1', '2'] },
      { name: '6eme Annee Fondamentale', level: 'Fondamental', section: 'FONDAMENTAL', rooms: ['1', '2'] },
      { name: '7eme Annee Fondamentale', level: 'Fondamental', section: 'FONDAMENTAL', rooms: ['1', '2'] },
      { name: '8eme Annee Fondamentale', level: 'Fondamental', section: 'FONDAMENTAL', rooms: ['1', '2'] },
      { name: '9eme Annee Fondamentale', level: 'Fondamental', section: 'FONDAMENTAL', rooms: ['1', '2'] },
      { name: 'NS1', level: 'Secondaire', section: 'SECONDAIRE', rooms: ['1'] },
      { name: 'NS2', level: 'Secondaire', section: 'SECONDAIRE', rooms: ['1'] },
      { name: 'NS3', level: 'Secondaire', section: 'SECONDAIRE', rooms: ['1'] },
      { name: 'NS4', level: 'Secondaire', section: 'SECONDAIRE', rooms: ['1'] },
    ];

    for (const c of classDefs) {
      await client.query(
        `INSERT INTO class (name, description, level, section, active)
         SELECT $1::varchar, $2::varchar, $3::varchar, $4::varchar, true
         WHERE NOT EXISTS (SELECT 1 FROM class WHERE name = $1::varchar)`,
        [c.name, c.level, c.level, c.section],
      );
      await client.query(
        `UPDATE class SET level = $2, section = $3, description = $2, updated_at = now() WHERE name = $1`,
        [c.name, c.level, c.section],
      );
    }
    const classes = (await client.query('SELECT id, name, level, section FROM class')).rows;
    const classByName = Object.fromEntries(classes.map((c) => [c.name, c]));

    for (const c of classDefs) {
      const cls = classByName[c.name];
      const cap = c.level === 'Préscolaire' ? 20 : c.level === 'Secondaire' ? 35 : 25;
      for (const roomName of c.rooms) {
        await client.query(
          `INSERT INTO room (name, description, capacity, class_id, active)
           SELECT $1::varchar, $2::varchar, $3::int, $4::uuid, true
           WHERE NOT EXISTS (SELECT 1 FROM room WHERE class_id = $4::uuid AND name = $1::varchar)`,
          [roomName, `Salle ${roomName} — ${c.name}`, cap, cls.id],
        );
      }
    }
    const rooms = (await client.query('SELECT id, name, class_id FROM room')).rows;

    const subjectDefs = [
      ['Francais', 'FR'],
      ['Mathematiques', 'MATH'],
      ['Creole', 'CR'],
      ['Anglais', 'ANG'],
      ['Sciences', 'SCI'],
      ['Histoire', 'HIST'],
      ['Geographie', 'GEO'],
      ['Education civique', 'CIV'],
      ['Education religieuse', 'REL'],
      ['EPS', 'EPS'],
      ['Informatique', 'INFO'],
      ['Physique', 'PHY'],
      ['Chimie', 'CHIM'],
      ['SVT', 'SVT'],
      ['Philosophie', 'PHILO'],
      ['Espagnol', 'ESP'],
    ];
    for (const [name, code] of subjectDefs) {
      await client.query(
        `INSERT INTO subject (name, code, active)
         SELECT $1::varchar, $2::varchar, true
         WHERE NOT EXISTS (SELECT 1 FROM subject WHERE name = $1::varchar OR code = $2::varchar)`,
        [name, code],
      );
    }
    const subjects = (await client.query('SELECT id, name, code FROM subject')).rows;
    const subjectByCode = Object.fromEntries(subjects.map((s) => [s.code, s]));

    function subjectsFor(level) {
      if (level === 'Préscolaire') return ['FR', 'MATH', 'CR', 'EPS', 'REL'];
      if (level === 'Fondamental') return ['FR', 'MATH', 'CR', 'ANG', 'SCI', 'HIST', 'GEO', 'CIV', 'EPS'];
      return ['FR', 'MATH', 'ANG', 'PHY', 'CHIM', 'SVT', 'HIST', 'PHILO', 'ESP', 'EPS'];
    }
    const coeffFor = {
      FR: '3', MATH: '3', CR: '2', ANG: '2', SCI: '2', HIST: '2', GEO: '2',
      CIV: '1', REL: '1', EPS: '1', INFO: '1', PHY: '3', CHIM: '3', SVT: '2',
      PHILO: '2', ESP: '2',
    };

    for (const c of classes) {
      for (const code of subjectsFor(c.level)) {
        const sub = subjectByCode[code];
        if (!sub) continue;
        await client.query(
          `INSERT INTO class_subject (class_id, subject_id)
           SELECT $1::uuid, $2::uuid
           WHERE NOT EXISTS (SELECT 1 FROM class_subject WHERE class_id = $1::uuid AND subject_id = $2::uuid)`,
          [c.id, sub.id],
        );
        await client.query(
          `INSERT INTO class_subject_coefficient (academic_year_id, class_id, subject_id, coefficient)
           SELECT $1::uuid, $2::uuid, $3::uuid, $4::numeric
           WHERE NOT EXISTS (
             SELECT 1 FROM class_subject_coefficient
             WHERE academic_year_id = $1::uuid AND class_id = $2::uuid AND subject_id = $3::uuid
           )`,
          [yearId, c.id, sub.id, coeffFor[code] || '1'],
        );
      }
      await client.query(
        `INSERT INTO class_decision_threshold (class_id, academic_year_id)
         SELECT $1::uuid, $2::uuid
         WHERE NOT EXISTS (
           SELECT 1 FROM class_decision_threshold WHERE class_id = $1::uuid AND academic_year_id = $2::uuid
         )`,
        [c.id, yearId],
      );
    }

    const staff = [
      { role: 'SUPER_ADMIN', first: 'Marc', last: 'DORVAL', email: `superadmin.demo@${DOMAIN}` },
      { role: 'DIRECTEUR_GENERAL', first: 'Josué', last: 'SAINT-FLEUR', email: `directeur.general@${DOMAIN}` },
      { role: 'SCHOOL_ADMIN', first: 'Nadège', last: 'LOUIS', email: `admin.ecole@${DOMAIN}` },
      { role: 'DIRECTEUR_PEDAGOGIQUE', first: 'Carine', last: 'METELLUS', email: `directeur.pedagogique@${DOMAIN}` },
      { role: 'CENSEUR', first: 'Hervé', last: 'AUGUSTIN', email: `censeur@${DOMAIN}` },
      { role: 'ADMIN_PRESCOLAIRE', first: 'Farah', last: 'JEAN', email: `admin.prescolaire@${DOMAIN}` },
      { role: 'ADMIN_FONDAMENTAL', first: 'Wideline', last: 'CHARLES', email: `admin.fondamental@${DOMAIN}` },
      { role: 'ADMIN_SECONDAIRE', first: 'Peterson', last: 'EXANTUS', email: `admin.secondaire@${DOMAIN}` },
      { role: 'ECONOME', first: 'Mireille', last: 'CADET', email: `econome@${DOMAIN}` },
      { role: 'COMPTABLE', first: 'Ronald', last: 'GUILLAUME', email: `comptable@${DOMAIN}` },
      { role: 'DISCIPLINE', first: 'Frantz', last: 'DORCELY', email: `discipline@${DOMAIN}` },
      { role: 'STAFF', first: 'Ketia', last: 'PAUL', email: `secretariat@${DOMAIN}` },
      { role: 'PHOTOGRAPHER', first: 'Stanley', last: 'ALEXIS', email: `photographe@${DOMAIN}` },
    ];
    const teacherDefs = [
      { first: 'Jean', last: 'BAPTISTE', codes: ['FR', 'CR'] },
      { first: 'Marie', last: 'JOSEPH', codes: ['MATH'] },
      { first: 'Samuel', last: 'PIERRE', codes: ['ANG', 'ESP'] },
      { first: 'Claudia', last: 'ETIENNE', codes: ['SCI', 'SVT'] },
      { first: 'Ricardo', last: 'CELESTIN', codes: ['HIST', 'GEO', 'CIV'] },
      { first: 'Emmanuella', last: 'DESTINE', codes: ['PHY', 'CHIM'] },
      { first: 'Luckner', last: 'BEAUBRUN', codes: ['EPS'] },
      { first: 'Johanne', last: 'SAINT-LOUIS', codes: ['REL', 'PHILO'] },
      { first: 'Davidson', last: 'LAFORTUNE', codes: ['INFO'] },
    ];

    async function upsertUser({ email, first, last, role, phone, address }) {
      const em = email.toLowerCase();
      if (PROTECTED_EMAILS.has(em)) return null;
      usedEmails.add(em);
      const ph = phone || nextPhone();
      const addr = address || pick(STREETS, phoneSeq);
      const existing = await client.query('SELECT id FROM users WHERE lower(email) = $1', [em]);
      if (existing.rows[0]) {
        await client.query(
          `UPDATE users SET
             first_name = $2, last_name = $3, phone = COALESCE(phone, $4), whatsapp = COALESCE(whatsapp, $4),
             address = COALESCE(address, $5), password_hash = $6, role_id = $7, active = true, updated_at = now()
           WHERE id = $1`,
          [existing.rows[0].id, first, last, ph, addr, passwordHash, roleId[role]],
        );
        return existing.rows[0].id;
      }
      const ins = await client.query(
        `INSERT INTO users (first_name, last_name, email, address, phone, whatsapp, password_hash, role_id, active)
         VALUES ($1, $2, $3, $4, $5, $5, $6, $7, true)
         RETURNING id`,
        [first, last, em, addr, ph, passwordHash, roleId[role]],
      );
      return ins.rows[0].id;
    }

    const staffIds = {};
    for (const s of staff) {
      staffIds[s.role] = await upsertUser(s);
    }

    const teacherIds = [];
    const teacherByCode = {};
    for (const t of teacherDefs) {
      const id = await upsertUser({
        email: emailFor(t.first, t.last),
        first: t.first,
        last: t.last,
        role: 'TEACHER',
      });
      teacherIds.push({ id, ...t });
      for (const code of t.codes) {
        teacherByCode[code] = id;
        await client.query(
          `INSERT INTO teacher_subject (teacher_id, subject_id)
           SELECT $1::int, $2::uuid
           WHERE NOT EXISTS (SELECT 1 FROM teacher_subject WHERE teacher_id = $1::int AND subject_id = $2::uuid)`,
          [id, subjectByCode[code].id],
        );
      }
    }

    const mainTeacherCycle = teacherIds.map((t) => t.id);
    for (const [i, c] of classes.entries()) {
      const tid = mainTeacherCycle[i % mainTeacherCycle.length];
      await client.query(
        `INSERT INTO class_teacher (class_id, user_id, is_main)
         SELECT $1::uuid, $2::int, true
         WHERE NOT EXISTS (SELECT 1 FROM class_teacher WHERE class_id = $1::uuid AND user_id = $2::int)`,
        [c.id, tid],
      );
      const codes = subjectsFor(c.level);
      const classRooms = rooms.filter((r) => r.class_id === c.id);
      for (const code of codes) {
        const teacherId = teacherByCode[code] || tid;
        const sub = subjectByCode[code];
        for (const room of classRooms) {
          await client.query(
            `INSERT INTO teacher_class_subject (teacher_id, class_id, subject_id, room_id)
             SELECT $1::int, $2::uuid, $3::uuid, $4::uuid
             WHERE NOT EXISTS (
               SELECT 1 FROM teacher_class_subject
               WHERE teacher_id = $1::int AND class_id = $2::uuid AND subject_id = $3::uuid
                 AND room_id = $4::uuid
             )`,
            [teacherId, c.id, sub.id, room.id],
          );
        }
      }
    }

    const slotHours = [
      ['08:00', '09:00'],
      ['09:00', '10:00'],
      ['10:15', '11:15'],
      ['11:15', '12:15'],
    ];
    for (const c of classes) {
      const codes = subjectsFor(c.level);
      const classRooms = rooms.filter((r) => r.class_id === c.id);
      const room = classRooms[0];
      for (let d = 1; d <= 5; d++) {
        for (let h = 0; h < slotHours.length; h++) {
          const code = codes[(d + h) % codes.length];
          const sub = subjectByCode[code];
          const teacherId = teacherByCode[code] || teacherIds[0].id;
          await client.query(
            `INSERT INTO schedule_slot (class_id, subject_id, teacher_id, room_id, academic_year, day_of_week, start_time, end_time)
             SELECT $1::uuid, $2::uuid, $3::int, $4::uuid, $5::varchar, $6::smallint, $7::varchar, $8::varchar
             WHERE NOT EXISTS (
               SELECT 1 FROM schedule_slot
               WHERE class_id = $1::uuid AND day_of_week = $6::smallint AND start_time = $7::varchar AND academic_year = $5::varchar
             )`,
            [c.id, sub.id, teacherId, room?.id || null, YEAR, d, slotHours[h][0], slotHours[h][1]],
          );
        }
      }
    }

    const feeDefs = [
      { name: 'Inscription', code: 'INSCR', nature: 'OBLIGATOIRE' },
      { name: '1ere Tranche', code: 'T1', nature: 'OBLIGATOIRE' },
      { name: '2eme Tranche', code: 'T2', nature: 'OBLIGATOIRE' },
      { name: '3eme Tranche', code: 'T3', nature: 'OBLIGATOIRE' },
      { name: '4eme Tranche', code: 'T4', nature: 'OBLIGATOIRE' },
      { name: 'Cantine', code: 'CANT', nature: 'PARASCOLAIRE' },
      { name: 'Transport', code: 'TRANS', nature: 'PARASCOLAIRE' },
      { name: 'Club football', code: 'FOOT', nature: 'PARASCOLAIRE' },
    ];
    for (const f of feeDefs) {
      await client.query(
        `INSERT INTO fee_service (name, code, active, nature)
         SELECT $1::varchar, $2::varchar, true, $3::varchar
         WHERE NOT EXISTS (SELECT 1 FROM fee_service WHERE code = $2::varchar OR name = $1::varchar)`,
        [f.name, f.code, f.nature],
      );
    }
    const fees = (await client.query('SELECT id, code FROM fee_service')).rows;
    const feeByCode = Object.fromEntries(fees.map((f) => [f.code, f]));

    function feeGrid(level) {
      if (level === 'Préscolaire') {
        return { INSCR: 1000, T1: 20000, T2: 10000, T3: 10000, T4: 8000, CANT: 2500, TRANS: 2000, FOOT: 500 };
      }
      if (level === 'Secondaire') {
        return { INSCR: 1000, T1: 25000, T2: 15000, T3: 15000, T4: 10000, CANT: 3000, TRANS: 2500, FOOT: 800 };
      }
      return { INSCR: 1000, T1: 25000, T2: 12500, T3: 12500, T4: 10000, CANT: 2500, TRANS: 2000, FOOT: 500 };
    }
    const dueByCode = {
      INSCR: '2026-07-31',
      T1: '2026-08-14',
      T2: '2026-10-16',
      T3: '2027-01-14',
      T4: '2027-04-15',
      CANT: '2026-09-30',
      TRANS: '2026-09-30',
      FOOT: '2026-10-01',
    };
    for (const c of classes) {
      const grid = feeGrid(c.level);
      for (const [code, amount] of Object.entries(grid)) {
        await client.query(
          `INSERT INTO class_fee (academic_year, class_id, service_id, amount, due_date)
           SELECT $1::varchar, $2::uuid, $3::uuid, $4::numeric, $5::date
           WHERE NOT EXISTS (
             SELECT 1 FROM class_fee
             WHERE academic_year = $1::varchar AND class_id = $2::uuid AND service_id = $3::uuid
           )`,
          [YEAR, c.id, feeByCode[code].id, amount, dueByCode[code]],
        );
      }
    }

    async function ensureStudent({
      first, last, gender, level, classId, roomId, mother, father, motherPhone, fatherPhone, orderNumber,
    }) {
      const existing = await client.query('SELECT id FROM student WHERE order_number = $1', [orderNumber]);
      if (existing.rows[0]) return existing.rows[0].id;
      const city = pick(CITIES, nisuSeq);
      const addr = pick(STREETS, nisuSeq);
      const ins = await client.query(
        `INSERT INTO student (
           first_name, last_name, gender, birth_date, birth_place, address,
           mother_name, mother_phone, father_name, father_phone,
           class_id, room_id, order_number, active
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,true)
         RETURNING id`,
        [
          first, last, gender, birthForLevel(level, nisuSeq), city, addr,
          mother, motherPhone, father, fatherPhone, classId, roomId, orderNumber,
        ],
      );
      return ins.rows[0].id;
    }

    async function assignYear(studentId, classId, average, decision) {
      await client.query(
        `INSERT INTO student_class_assignment (student_id, academic_year_id, class_id, average, decision)
         SELECT $1::uuid, $2::uuid, $3::uuid, $4::numeric, $5::varchar
         WHERE NOT EXISTS (
           SELECT 1 FROM student_class_assignment WHERE student_id = $1::uuid AND academic_year_id = $2::uuid
         )`,
        [studentId, yearId, classId, average, decision],
      );
    }

    async function linkParent(userId, studentId, relationship) {
      await client.query(
        `INSERT INTO user_linked_student (user_id, student_id)
         SELECT $1::int, $2::uuid
         WHERE NOT EXISTS (SELECT 1 FROM user_linked_student WHERE user_id = $1::int AND student_id = $2::uuid)`,
        [userId, studentId],
      );
      await client.query(
        `INSERT INTO student_parent (student_id, user_id, relationship)
         SELECT $2::uuid, $1::int, $3::varchar
         WHERE NOT EXISTS (SELECT 1 FROM student_parent WHERE student_id = $2::uuid AND user_id = $1::int)`,
        [userId, studentId, relationship],
      );
    }

    const parentByKey = new Map();
    async function parentAccount(first, last, phone, relationshipHint) {
      const key = `${slug(first)}|${slug(last)}|${phone.replace(/\D/g, '')}`;
      if (parentByKey.has(key)) return parentByKey.get(key);
      const id = await upsertUser({
        email: uniqueEmail(first, last),
        first,
        last,
        role: 'PARENT',
        phone,
      });
      parentByKey.set(key, id);
      return id;
    }

    const newStudents = [];
    let createdStudents = 0;

    for (const [ci, c] of classes.entries()) {
      const classRooms = rooms.filter((r) => r.class_id === c.id);
      const already = Number(
        (await client.query('SELECT COUNT(*)::int AS n FROM student WHERE class_id = $1', [c.id])).rows[0].n,
      );
      const target = 5;
      const toCreate = Math.max(0, target - already);
      for (let i = 0; i < toCreate; i++) {
        const idx = ci * 10 + i + already;
        const girl = (i + ci) % 2 === 0;
        const first = girl ? pick(FIRST_F, idx) : pick(FIRST_M, idx);
        const last = pick(LAST, idx + 3);
        const motherFirst = pick(FIRST_F, idx + 7);
        const fatherFirst = pick(FIRST_M, idx + 9);
        const mother = `${motherFirst} ${last}`;
        const father = `${fatherFirst} ${last}`;
        const motherPhone = nextPhone();
        const fatherPhone = nextPhone();
        const room = classRooms[i % classRooms.length];
        const orderNumber = nisu(nisuSeq++);
        const studentId = await ensureStudent({
          first, last, gender: girl ? 'F' : 'M', level: c.level,
          classId: c.id, roomId: room?.id || null,
          mother, father, motherPhone, fatherPhone, orderNumber,
        });
        const avg = (8 + ((i * 3 + ci) % 10) + (i % 3) * 0.25).toFixed(2);
        const decision = Number(avg) >= 10 ? null : Number(avg) >= 8 ? null : null;
        await assignYear(studentId, c.id, avg, decision);
        const momId = await parentAccount(motherFirst, last, motherPhone);
        const dadId = await parentAccount(fatherFirst, last, fatherPhone);
        await linkParent(momId, studentId, 'mother');
        await linkParent(dadId, studentId, 'father');
        newStudents.push({ id: studentId, classId: c.id, level: c.level, avg: Number(avg), i });
        createdStudents += 1;
      }
    }

    const existingStudents = (await client.query(
      `SELECT s.id, s.first_name, s.last_name, s.class_id, s.room_id, s.mother_name, s.father_name,
              s.mother_phone, s.father_phone, c.level
       FROM student s JOIN class c ON c.id = s.class_id`,
    )).rows;

    for (const [i, s] of existingStudents.entries()) {
      const classRooms = rooms.filter((r) => r.class_id === s.class_id);
      if (!s.room_id && classRooms[0]) {
        await client.query('UPDATE student SET room_id = $2, updated_at = now() WHERE id = $1', [s.id, classRooms[i % classRooms.length].id]);
      }
      const last = s.last_name;
      const motherFirst = s.mother_name?.split(/\s+/)[0] || pick(FIRST_F, i + 11);
      const fatherFirst = s.father_name?.split(/\s+/)[0] || pick(FIRST_M, i + 13);
      const motherPhone = s.mother_phone || nextPhone();
      const fatherPhone = s.father_phone || nextPhone();
      if (!s.mother_name || !s.father_name) {
        await client.query(
          `UPDATE student SET
             mother_name = COALESCE(NULLIF(mother_name, ''), $2),
             father_name = COALESCE(NULLIF(father_name, ''), $3),
             mother_phone = COALESCE(NULLIF(mother_phone, ''), $4),
             father_phone = COALESCE(NULLIF(father_phone, ''), $5),
             address = COALESCE(NULLIF(address, ''), $6),
             birth_place = COALESCE(NULLIF(birth_place, ''), $7),
             updated_at = now()
           WHERE id = $1`,
          [s.id, `${motherFirst} ${last}`, `${fatherFirst} ${last}`, motherPhone, fatherPhone, pick(STREETS, i), pick(CITIES, i)],
        );
      }
      const momId = await parentAccount(motherFirst, last, motherPhone);
      const dadId = await parentAccount(fatherFirst, last, fatherPhone);
      await linkParent(momId, s.id, 'mother');
      await linkParent(dadId, s.id, 'father');
      await assignYear(s.id, s.class_id, (9 + (i % 7) + 0.5).toFixed(2), null);
      if (!newStudents.find((x) => x.id === s.id)) {
        newStudents.push({
          id: s.id, classId: s.class_id, level: s.level, avg: 9 + (i % 7), i,
        });
      }
    }

    // Deux fratries : même parents pour 2 élèves de classes différentes
    const siblingPairs = [
      [existingStudents[0], existingStudents[1]],
    ].filter((p) => p[0] && p[1]);
    for (const [a, b] of siblingPairs) {
      const links = (await client.query(
        'SELECT user_id FROM student_parent WHERE student_id = $1',
        [a.id],
      )).rows;
      for (const l of links) {
        const rel = (await client.query(
          'SELECT relationship FROM student_parent WHERE student_id = $1 AND user_id = $2',
          [a.id, l.user_id],
        )).rows[0]?.relationship || 'responsible';
        await linkParent(l.user_id, b.id, rel);
      }
    }

    const allStudents = (await client.query(
      `SELECT s.id, s.class_id, c.level, c.name AS class_name
       FROM student s JOIN class c ON c.id = s.class_id WHERE s.active = true`,
    )).rows;

    for (const [si, s] of allStudents.entries()) {
      const codes = subjectsFor(s.level);
      if (s.level === 'Préscolaire') {
        const levels = ['A', 'EA', 'NA'];
        const freqs = ['Régulier', 'Occasionnel', 'En progrès'];
        for (const code of codes) {
          const sub = subjectByCode[code];
          await client.query(
            `INSERT INTO preschool_grade (student_id, academic_year_id, class_id, subject_id, period_id, level, frequency, observation)
             SELECT $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6::varchar, $7::varchar, $8::text
             WHERE NOT EXISTS (
               SELECT 1 FROM preschool_grade
               WHERE student_id = $1::uuid AND academic_year_id = $2::uuid AND subject_id = $4::uuid AND period_id = $5::uuid
             )`,
            [
              s.id, yearId, s.class_id, sub.id, t1.id,
              pick(levels, si + code.length),
              pick(freqs, si),
              si % 4 === 0 ? 'Participe bien aux activités.' : null,
            ],
          );
        }
      } else {
        for (const per of periods) {
          for (const code of codes) {
            const sub = subjectByCode[code];
            const base = 7 + ((si * 3 + code.length + per.order_index) % 11);
            const val = Math.min(20, Math.max(4, base + (si % 3) * 0.5)).toFixed(2);
            await client.query(
              `INSERT INTO grade (student_id, academic_year_id, class_id, subject_id, period_id, coefficient, grade_value)
               SELECT $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6::numeric, $7::numeric
               WHERE NOT EXISTS (
                 SELECT 1 FROM grade
                 WHERE student_id = $1::uuid AND academic_year_id = $2::uuid AND subject_id = $4::uuid AND period_id = $5::uuid
               )`,
              [s.id, yearId, s.class_id, sub.id, per.id, coeffFor[code] || '1', val],
            );
          }
        }
      }

      const grid = feeGrid(s.level);
      const payPattern = si % 5;
      for (const [code, amount] of Object.entries(grid)) {
        if (code === 'FOOT' && si % 3 !== 0) continue;
        if (code === 'TRANS' && si % 4 === 0) continue;
        let paid = 0;
        if (code === 'INSCR') paid = amount;
        else if (code === 'T1') paid = payPattern === 0 ? 0 : payPattern === 1 ? Math.round(amount / 2) : amount;
        else if (code === 'T2') paid = payPattern >= 3 ? amount : payPattern === 2 ? Math.round(amount / 2) : 0;
        else if (['CANT', 'TRANS', 'FOOT'].includes(code)) paid = si % 2 === 0 ? amount : 0;
        if (paid <= 0) continue;
        await client.query(
          `INSERT INTO payment_transaction (student_id, class_id, academic_year, service_id, amount_due, amount_paid, payment_date)
           SELECT $1::uuid, $2::uuid, $3::varchar, $4::uuid, $5::numeric, $6::numeric, $7::date
           WHERE NOT EXISTS (
             SELECT 1 FROM payment_transaction
             WHERE student_id = $1::uuid AND academic_year = $3::varchar AND service_id = $4::uuid AND amount_paid = $6::numeric
           )`,
          [s.id, s.class_id, YEAR, feeByCode[code].id, amount, paid, '2026-08-10'],
        );
      }
      if (si % 11 === 0) {
        await client.query(
          `INSERT INTO student_service_exemption (student_id, academic_year, service_id, exemption_type)
           SELECT $1::uuid, $2::varchar, $3::uuid, 'HALF'
           WHERE NOT EXISTS (
             SELECT 1 FROM student_service_exemption
             WHERE student_id = $1::uuid AND academic_year = $2::varchar AND service_id = $3::uuid
           )`,
          [s.id, YEAR, feeByCode.T4.id],
        );
      }
      if (si % 17 === 0) {
        await client.query(
          `INSERT INTO student_service_exemption (student_id, academic_year, service_id, exemption_type)
           SELECT $1::uuid, $2::varchar, $3::uuid, 'FULL'
           WHERE NOT EXISTS (
             SELECT 1 FROM student_service_exemption
             WHERE student_id = $1::uuid AND academic_year = $2::varchar AND service_id = $3::uuid
           )`,
          [s.id, YEAR, feeByCode.CANT.id],
        );
      }
    }

    const attDates = ['2026-08-17', '2026-08-18', '2026-08-19', '2026-08-20', '2026-08-21'];
    for (const s of allStudents) {
      for (const [di, date] of attDates.entries()) {
        const status = (s.id.charCodeAt(0) + di) % 7 === 0 ? 'ABSENT' : 'PRESENT';
        await client.query(
          `INSERT INTO attendance (class_id, student_id, date, status)
           SELECT $1::uuid, $2::uuid, $3::date, $4::varchar
           WHERE NOT EXISTS (
             SELECT 1 FROM attendance WHERE class_id = $1::uuid AND student_id = $2::uuid AND date = $3::date
           )`,
          [s.class_id, s.id, date, status],
        );
      }
    }
    for (const [i, s] of allStudents.slice(0, 12).entries()) {
      await client.query(
        `INSERT INTO lateness (student_id, class_id, date, arrival_time)
         SELECT $1::uuid, $2::uuid, $3::date, $4::varchar
         WHERE NOT EXISTS (SELECT 1 FROM lateness WHERE student_id = $1::uuid AND date = $3::date)`,
        [s.id, s.class_id, attDates[i % attDates.length], `08:${String(10 + i).padStart(2, '0')}`],
      );
    }
    const measures = [
      ['SOUS_SURVEILLANCE', 'Bavardages répétés en classe'],
      ['EN_RETENUE', 'Devoir non fait plusieurs fois'],
      ['RENVOYE_TEMPORAIREMENT', 'Altercation dans la cour'],
    ];
    for (const [i, s] of allStudents.slice(3, 9).entries()) {
      const [type, reason] = measures[i % measures.length];
      await client.query(
        `INSERT INTO disciplinary_measure (student_id, measure_type, reason, expires_at)
         SELECT $1::uuid, $2::varchar, $3::varchar, $4::timestamptz
         WHERE NOT EXISTS (
           SELECT 1 FROM disciplinary_measure WHERE student_id = $1::uuid AND measure_type = $2::varchar
         )`,
        [s.id, type, reason, type === 'RENVOYE_TEMPORAIREMENT' ? '2026-08-28 16:00:00+00' : null],
      );
      await client.query(
        `INSERT INTO disciplinary_deduction (student_id, points_deducted, reason)
         SELECT $1::uuid, $2::int, $3::varchar
         WHERE NOT EXISTS (SELECT 1 FROM disciplinary_deduction WHERE student_id = $1::uuid AND reason = $3::varchar)`,
        [s.id, 5 + i, reason],
      );
    }

    for (const c of classes.filter((x) => x.level !== 'Préscolaire')) {
      const codes = subjectsFor(c.level).slice(0, 4);
      for (const [i, code] of codes.entries()) {
        await client.query(
          `INSERT INTO exam_schedule (class_id, subject_id, period_id, period, exam_date, start_time, end_time)
           SELECT $1::uuid, $2::uuid, $3::uuid, $4::varchar, $5::date, $6::varchar, $7::varchar
           WHERE NOT EXISTS (
             SELECT 1 FROM exam_schedule
             WHERE class_id = $1::uuid AND subject_id = $2::uuid AND period_id = $3::uuid
           )`,
          [
            c.id, subjectByCode[code].id, t1.id, t1.name,
            `2026-10-${String(12 + i).padStart(2, '0')}`, '08:00', '10:00',
          ],
        );
      }
    }
    for (const c of classes) {
      await client.query(
        `INSERT INTO extracurricular_activity (academic_year_id, activity_date, start_time, end_time, class_id, occasion, participation_fee, dress_code)
         SELECT $1::uuid, $2::date, '09:00', '13:00', $3::uuid, $4::varchar, $5::varchar, $6::varchar
         WHERE NOT EXISTS (
           SELECT 1 FROM extracurricular_activity
           WHERE academic_year_id = $1::uuid AND class_id = $3::uuid AND occasion = $4::varchar
         )`,
        [yearId, '2026-11-20', c.id, 'Journée culturelle', '200', 'Tenue civile correcte'],
      );
    }

    const accountDefs = [
      ['512000', 'Banque', 'ACTIF'],
      ['530000', 'Caisse', 'ACTIF'],
      ['411000', 'Parents / clients', 'ACTIF'],
      ['401000', 'Fournisseurs', 'PASSIF'],
      ['701000', 'Scolarité', 'PRODUIT'],
      ['706000', 'Autres produits', 'PRODUIT'],
      ['601000', 'Achats', 'CHARGE'],
      ['606000', 'Fournitures', 'CHARGE'],
      ['641000', 'Salaires', 'CHARGE'],
    ];
    for (const [code, label, type] of accountDefs) {
      await client.query(
        `INSERT INTO account (code, label, type)
         SELECT $1::varchar, $2::varchar, $3::varchar
         WHERE NOT EXISTS (SELECT 1 FROM account WHERE code = $1::varchar)`,
        [code, label, type],
      );
    }
    const accounts = (await client.query('SELECT id, code FROM account')).rows;
    const acc = Object.fromEntries(accounts.map((a) => [a.code, a.id]));

    await client.query(
      `INSERT INTO bank (name, active)
       SELECT 'Sogebank', true WHERE NOT EXISTS (SELECT 1 FROM bank WHERE name = 'Sogebank')`,
    );
    await client.query(
      `INSERT INTO bank (name, active)
       SELECT 'Unibank', true WHERE NOT EXISTS (SELECT 1 FROM bank WHERE name = 'Unibank')`,
    );
    const banks = (await client.query('SELECT id, name FROM bank')).rows;
    for (const b of banks) {
      await client.query(
        `INSERT INTO bank_account (bank_id, name, account_number, opening_balance, active)
         SELECT $1::uuid, $2::varchar, $3::varchar, 150000, true
         WHERE NOT EXISTS (SELECT 1 FROM bank_account WHERE bank_id = $1::uuid AND name = $2::varchar)`,
        [b.id, `Compte courant ${b.name}`, b.name === 'Sogebank' ? '001-458210-11' : '002-781903-04'],
      );
    }
    const sogeAcc = (await client.query(
      `SELECT ba.id FROM bank_account ba JOIN bank b ON b.id = ba.bank_id WHERE b.name = 'Sogebank' LIMIT 1`,
    )).rows[0];

    await client.query(
      `INSERT INTO exercice (date_debut, date_fin, statut)
       SELECT '2026-09-01', '2027-08-31', 'OUVERT'
       WHERE NOT EXISTS (SELECT 1 FROM exercice WHERE date_debut = '2026-09-01' AND date_fin = '2027-08-31')`,
    );
    const exerciceId = (await client.query(
      `SELECT id FROM exercice WHERE date_debut = '2026-09-01' ORDER BY created_at DESC LIMIT 1`,
    )).rows[0].id;

    await client.query(
      `INSERT INTO expense (expense_date, amount, label, beneficiary, category, document_ref, statut, bank_account_id)
       SELECT '2026-08-05', 45000, 'Fournitures de bureau rentrée', 'Papeterie Delmas', '606', 'FAC-2026-001', 'VALIDEE', $1
       WHERE NOT EXISTS (SELECT 1 FROM expense WHERE document_ref = 'FAC-2026-001')`,
      [sogeAcc?.id || null],
    );
    await client.query(
      `INSERT INTO expense (expense_date, amount, label, beneficiary, category, document_ref, statut)
       SELECT '2026-08-12', 120000, 'Acompte salaires enseignants', 'Personnel enseignant', '641', 'SAL-2026-08', 'VALIDEE'
       WHERE NOT EXISTS (SELECT 1 FROM expense WHERE document_ref = 'SAL-2026-08')`,
    );
    await client.query(
      `INSERT INTO other_revenue (revenue_date, amount, label, category)
       SELECT '2026-08-08', 25000, 'Don Association des parents', 'don'
       WHERE NOT EXISTS (SELECT 1 FROM other_revenue WHERE label = 'Don Association des parents')`,
    );

    const je = await client.query(
      `INSERT INTO journal_entry (exercice_id, entry_date, label, source)
       SELECT $1::uuid, '2026-08-08', 'Don Association des parents', 'AUTRE_REVENU'
       WHERE NOT EXISTS (SELECT 1 FROM journal_entry WHERE label = 'Don Association des parents' AND exercice_id = $1::uuid)
       RETURNING id`,
      [exerciceId],
    );
    let jeId = je.rows[0]?.id;
    if (!jeId) {
      jeId = (await client.query(
        `SELECT id FROM journal_entry WHERE label = 'Don Association des parents' AND exercice_id = $1`,
        [exerciceId],
      )).rows[0].id;
    }
    await client.query(
      `INSERT INTO journal_entry_line (entry_id, account_id, debit, credit, line_label)
       SELECT $1::uuid, $2::uuid, 25000, 0, 'Encaissement don'
       WHERE NOT EXISTS (SELECT 1 FROM journal_entry_line WHERE entry_id = $1::uuid AND account_id = $2::uuid)`,
      [jeId, acc['530000']],
    );
    await client.query(
      `INSERT INTO journal_entry_line (entry_id, account_id, debit, credit, line_label)
       SELECT $1::uuid, $2::uuid, 0, 25000, 'Produit don'
       WHERE NOT EXISTS (SELECT 1 FROM journal_entry_line WHERE entry_id = $1::uuid AND account_id = $2::uuid)`,
      [jeId, acc['706000']],
    );

    await client.query('COMMIT');

    const counts = await client.query(`
      SELECT
        (SELECT COUNT(*) FROM users) AS users,
        (SELECT COUNT(*) FROM student) AS students,
        (SELECT COUNT(*) FROM class) AS classes,
        (SELECT COUNT(*) FROM room) AS rooms,
        (SELECT COUNT(*) FROM subject) AS subjects,
        (SELECT COUNT(*) FROM student_parent) AS parent_links,
        (SELECT COUNT(*) FROM grade) AS grades,
        (SELECT COUNT(*) FROM preschool_grade) AS preschool_grades,
        (SELECT COUNT(*) FROM payment_transaction) AS payments,
        (SELECT COUNT(*) FROM attendance) AS attendance,
        (SELECT COUNT(*) FROM schedule_slot) AS slots
    `);

    console.log('\n=== Seed DEV Shekinah terminé ===');
    console.log(counts.rows[0]);
    console.log(`\nMot de passe de TOUS les comptes fictifs : ${DEMO_PASSWORD}`);
    console.log('\nComptes staff (email ou téléphone) :');
    for (const s of staff) {
      console.log(`  ${s.role.padEnd(24)} ${s.email}`);
    }
    console.log('\nProfesseurs : prenom.nom@' + DOMAIN + '  (ex. jean.baptiste@' + DOMAIN + ')');
    console.log('Parents     : prenom.nom@' + DOMAIN + '  (même convention que l’app)');
    console.log(`\nÉlèves créés dans ce passage : ${createdStudents}`);
    console.log('Le compte existant larosemikelson@gmail.com n’a PAS été modifié.\n');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
