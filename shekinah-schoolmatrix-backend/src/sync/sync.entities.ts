import { EntityTarget } from 'typeorm';
import { SchoolProfile } from '../school-profile/school-profile.entity';
import { SchoolSignature } from '../school-profile/school-signature.entity';
import { AcademicYear } from '../academic-year/academic-year.entity';
import { Period } from '../period/period.entity';
import { Room } from '../rooms/room.entity';
import { Subject } from '../subjects/subject.entity';
import { Class } from '../classes/class.entity';
import { Student } from '../students/student.entity';
import { StudentPhoto } from '../students/student-photo.entity';
import { FeeService } from '../economat/fee-service.entity';
import { ClassFee } from '../economat/class-fee.entity';
import { PaymentTransaction } from '../economat/payment-transaction.entity';
import { Grade } from '../grades/grade.entity';
import { PreschoolGrade } from '../grades/preschool-grade.entity';
import { ClassSubjectCoefficient } from '../grades/class-subject-coefficient.entity';
import { ExamSchedule } from '../exam-schedule/exam-schedule.entity';
import { ScheduleSlot } from '../teachers/schedule-slot.entity';
import { ExtracurricularActivity } from '../extracurricular-activity/extracurricular-activity.entity';
import { Expense } from '../finance/expense.entity';
import { Bank } from '../finance/bank.entity';
import { BankAccount } from '../finance/bank-account.entity';
import { StudentClassAssignment } from '../formation-classe/student-class-assignment.entity';
import { ClassDecisionThreshold } from '../formation-classe/class-decision-threshold.entity';
import { Attendance } from '../discipline/attendance.entity';
import { FileMetadata } from '../file-metadata/file-metadata.entity';
import { ClassSubject } from '../classes/class-subject.entity';
import { User } from '../users/user.entity';

export type SyncEntityName =
  | 'SchoolProfile'
  | 'SchoolSignature'
  | 'User'
  | 'AcademicYear'
  | 'Period'
  | 'Room'
  | 'Subject'
  | 'Class'
  | 'ClassSubject'
  | 'Student'
  | 'StudentPhoto'
  | 'FeeService'
  | 'ClassFee'
  | 'PaymentTransaction'
  | 'Grade'
  | 'PreschoolGrade'
  | 'ClassSubjectCoefficient'
  | 'ExamSchedule'
  | 'ScheduleSlot'
  | 'ExtracurricularActivity'
  | 'Expense'
  | 'Bank'
  | 'BankAccount'
  | 'StudentClassAssignment'
  | 'ClassDecisionThreshold'
  | 'Attendance'
  | 'FileMetadata';

export type SyncEntityDef = {
  name: SyncEntityName;
  target: EntityTarget<any>;
  /** Colonne temporelle pour curseur pull (propriété TypeORM). */
  timeField: 'updated_at' | 'created_at';
};

/** Ordre parents → enfants (agent + doc). */
export const SYNC_ENTITY_DEFS: SyncEntityDef[] = [
  { name: 'SchoolProfile', target: SchoolProfile, timeField: 'updated_at' },
  { name: 'SchoolSignature', target: SchoolSignature, timeField: 'updated_at' },
  /** Comptes login Server → Remote (PK int acceptée comme uuid filaire). Roles seedés identiques des deux côtés. */
  { name: 'User', target: User, timeField: 'updated_at' },
  { name: 'AcademicYear', target: AcademicYear, timeField: 'updated_at' },
  { name: 'Period', target: Period, timeField: 'created_at' },
  { name: 'Subject', target: Subject, timeField: 'updated_at' },
  /** Class avant Room : room.class_id → class (plusieurs salles / classe). */
  { name: 'Class', target: Class, timeField: 'updated_at' },
  { name: 'Room', target: Room, timeField: 'updated_at' },
  { name: 'ClassSubject', target: ClassSubject, timeField: 'created_at' },
  { name: 'Student', target: Student, timeField: 'updated_at' },
  { name: 'StudentPhoto', target: StudentPhoto, timeField: 'updated_at' },
  { name: 'FeeService', target: FeeService, timeField: 'updated_at' },
  { name: 'ClassFee', target: ClassFee, timeField: 'updated_at' },
  { name: 'ClassSubjectCoefficient', target: ClassSubjectCoefficient, timeField: 'updated_at' },
  { name: 'ExamSchedule', target: ExamSchedule, timeField: 'updated_at' },
  { name: 'ScheduleSlot', target: ScheduleSlot, timeField: 'updated_at' },
  { name: 'ExtracurricularActivity', target: ExtracurricularActivity, timeField: 'updated_at' },
  { name: 'StudentClassAssignment', target: StudentClassAssignment, timeField: 'updated_at' },
  { name: 'ClassDecisionThreshold', target: ClassDecisionThreshold, timeField: 'updated_at' },
  { name: 'Grade', target: Grade, timeField: 'updated_at' },
  { name: 'PreschoolGrade', target: PreschoolGrade, timeField: 'updated_at' },
  { name: 'Bank', target: Bank, timeField: 'updated_at' },
  { name: 'BankAccount', target: BankAccount, timeField: 'updated_at' },
  { name: 'Expense', target: Expense, timeField: 'updated_at' },
  { name: 'FileMetadata', target: FileMetadata, timeField: 'updated_at' },
  { name: 'Attendance', target: Attendance, timeField: 'created_at' },
  { name: 'PaymentTransaction', target: PaymentTransaction, timeField: 'created_at' },
];

/** Insert-only : jamais d’écrasement si uuid déjà présent. */
export const APPEND_ONLY_ENTITIES = new Set<SyncEntityName>([
  'PaymentTransaction',
  'Attendance',
]);

export const SYNC_ENTITY_MAP = new Map(
  SYNC_ENTITY_DEFS.map((d) => [d.name, d] as const),
);

export function listSyncEntityNames(): SyncEntityName[] {
  return SYNC_ENTITY_DEFS.map((d) => d.name);
}
