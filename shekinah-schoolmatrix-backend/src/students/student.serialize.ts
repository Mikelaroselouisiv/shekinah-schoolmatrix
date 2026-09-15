import { Student } from './student.entity';

export type ArchiveReason = 'REMOVED' | 'GRADUATED';

export function isAlumniStudent(s: Pick<Student, 'active' | 'archived_at'>): boolean {
  return s.active === false || s.archived_at != null;
}

export function serializeStudent(s: Student) {
  const alumni = isAlumniStudent(s);
  return {
    id: s.id,
    order_number: s.order_number,
    management_code: s.management_code,
    first_name: s.first_name,
    last_name: s.last_name,
    email: s.email,
    phone: s.phone,
    address: s.address,
    birth_date: s.birth_date,
    birth_place: s.birth_place,
    gender: s.gender,
    photo_identity_student: s.photo_identity_student,
    photo_identity_mother: s.photo_identity_mother,
    photo_identity_father: s.photo_identity_father,
    photo_identity_responsible: s.photo_identity_responsible,
    mother_name: s.mother_name,
    mother_phone: s.mother_phone,
    father_name: s.father_name,
    father_phone: s.father_phone,
    responsible_name: s.responsible_name,
    responsible_phone: s.responsible_phone,
    class_id: s.class?.id ?? null,
    class_name: s.class?.name ?? null,
    class_level: s.class?.level ?? null,
    room_id: s.room?.id ?? null,
    room_name: s.room?.name ?? null,
    active: s.active && !alumni,
    archived_at: s.archived_at ?? null,
    archive_reason: s.archive_reason ?? null,
    is_alumni: alumni,
    created_at: s.created_at,
    updated_at: s.updated_at,
  };
}
