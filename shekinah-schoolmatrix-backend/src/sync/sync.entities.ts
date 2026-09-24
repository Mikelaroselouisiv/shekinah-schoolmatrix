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
import { ClassDayMoment } from '../teachers/class-day-moment.entity';
import { SchoolWeekDuty } from '../teachers/school-week-duty.entity';
import { SchoolOpeningInstruction } from '../teachers/school-opening-instruction.entity';
import { ClassBringItem } from '../teachers/class-bring-item.entity';
import { BringItemCatalog } from '../teachers/bring-item-catalog.entity';
import { ClassDaySubject } from '../teachers/class-day-subject.entity';
import { SchoolMaterial } from '../teachers/school-material.entity';
import { ExtracurricularActivity } from '../extracurricular-activity/extracurricular-activity.entity';
import { SchoolVacation } from '../school-vacation/school-vacation.entity';
import { ParentMeeting } from '../parent-meeting/parent-meeting.entity';
import { ExamPeriod } from '../exam-period/exam-period.entity';
import { Expense } from '../finance/expense.entity';
import { Bank } from '../finance/bank.entity';
import { BankAccount } from '../finance/bank-account.entity';
import { StudentClassAssignment } from '../formation-classe/student-class-assignment.entity';
import { ClassDecisionThreshold } from '../formation-classe/class-decision-threshold.entity';
import { Attendance } from '../discipline/attendance.entity';
import { FileMetadata } from '../file-metadata/file-metadata.entity';
import { ClassSubject } from '../classes/class-subject.entity';
import { User } from '../users/user.entity';
import { UserLinkedStudent } from '../users/user-linked-student.entity';
import { StudentParent } from '../student-parents/student-parent.entity';
import { HomeworkAssignment } from '../homework/homework-assignment.entity';
import { HomeworkGrade } from '../homework/homework-grade.entity';
import { SyncTombstone } from './sync-tombstone.entity';
import { ClassTeacher } from '../teachers/class-teacher.entity';
import { TeacherSubject } from '../teachers/teacher-subject.entity';
import { TeacherClassSubject } from '../teachers/teacher-class-subject.entity';
import { Lateness } from '../discipline/lateness.entity';
import { DisciplinaryMeasure } from '../discipline/disciplinary-measure.entity';
import { DisciplinaryDeduction } from '../discipline/disciplinary-deduction.entity';
import { StudentServiceExemption } from '../economat/student-service-exemption.entity';
import { Exercice } from '../finance/exercice.entity';
import { Account } from '../finance/account.entity';
import { JournalEntry } from '../finance/journal-entry.entity';
import { JournalEntryLine } from '../finance/journal-entry-line.entity';
import { OtherRevenue } from '../finance/other-revenue.entity';

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
  | 'ClassTeacher'
  | 'TeacherSubject'
  | 'TeacherClassSubject'
  | 'Student'
  | 'UserLinkedStudent'
  | 'StudentParent'
  | 'StudentPhoto'
  | 'FeeService'
  | 'ClassFee'
  | 'PaymentTransaction'
  | 'Grade'
  | 'PreschoolGrade'
  | 'ClassSubjectCoefficient'
  | 'ExamSchedule'
  | 'ScheduleSlot'
  | 'ClassDayMoment'
  | 'SchoolWeekDuty'
  | 'SchoolOpeningInstruction'
  | 'ClassBringItem'
  | 'BringItemCatalog'
  | 'ClassDaySubject'
  | 'SchoolMaterial'
  | 'ExtracurricularActivity'
  | 'SchoolVacation'
  | 'ParentMeeting'
  | 'ExamPeriod'
  | 'Expense'
  | 'Bank'
  | 'BankAccount'
  | 'StudentClassAssignment'
  | 'ClassDecisionThreshold'
  | 'Attendance'
  | 'FileMetadata'
  | 'HomeworkAssignment'
  | 'HomeworkGrade'
  | 'Lateness'
  | 'DisciplinaryMeasure'
  | 'DisciplinaryDeduction'
  | 'StudentServiceExemption'
  | 'Account'
  | 'Exercice'
  | 'OtherRevenue'
  | 'JournalEntry'
  | 'JournalEntryLine'
  /** Toujours en premier dans ENTITY_ORDER : deletes avant upserts. */
  | 'SyncTombstone';

export type SyncEntityDef = {
  name: SyncEntityName;
  target: EntityTarget<any>;
  /** Colonne temporelle pour curseur pull (propriété TypeORM). */
  timeField: 'updated_at' | 'created_at';
};

/** Ordre parents → enfants (agent + doc). SyncTombstone en premier. */
export const SYNC_ENTITY_DEFS: SyncEntityDef[] = [
  /** Premier : deletes avant upserts (anti-résurrection dans le même cycle). */
  { name: 'SyncTombstone', target: SyncTombstone, timeField: 'updated_at' },
  { name: 'SchoolProfile', target: SchoolProfile, timeField: 'updated_at' },
  { name: 'SchoolSignature', target: SchoolSignature, timeField: 'updated_at' },
  /** Comptes login Server → Remote (PK int). `role_id` est local ; le filaire porte `role_name`. */
  { name: 'User', target: User, timeField: 'updated_at' },
  { name: 'AcademicYear', target: AcademicYear, timeField: 'updated_at' },
  { name: 'Period', target: Period, timeField: 'updated_at' },
  { name: 'Subject', target: Subject, timeField: 'updated_at' },
  /** Class avant Room : room.class_id → class (plusieurs salles / classe). */
  { name: 'Class', target: Class, timeField: 'updated_at' },
  { name: 'Room', target: Room, timeField: 'updated_at' },
  { name: 'ClassSubject', target: ClassSubject, timeField: 'created_at' },
  { name: 'ClassTeacher', target: ClassTeacher, timeField: 'updated_at' },
  { name: 'TeacherSubject', target: TeacherSubject, timeField: 'updated_at' },
  { name: 'TeacherClassSubject', target: TeacherClassSubject, timeField: 'updated_at' },
  { name: 'Student', target: Student, timeField: 'updated_at' },
  { name: 'UserLinkedStudent', target: UserLinkedStudent, timeField: 'created_at' },
  { name: 'StudentParent', target: StudentParent, timeField: 'created_at' },
  { name: 'StudentPhoto', target: StudentPhoto, timeField: 'updated_at' },
  { name: 'FeeService', target: FeeService, timeField: 'updated_at' },
  { name: 'ClassFee', target: ClassFee, timeField: 'updated_at' },
  { name: 'StudentServiceExemption', target: StudentServiceExemption, timeField: 'updated_at' },
  { name: 'ClassSubjectCoefficient', target: ClassSubjectCoefficient, timeField: 'updated_at' },
  { name: 'ExamSchedule', target: ExamSchedule, timeField: 'updated_at' },
  { name: 'ScheduleSlot', target: ScheduleSlot, timeField: 'updated_at' },
  { name: 'ClassDayMoment', target: ClassDayMoment, timeField: 'updated_at' },
  { name: 'SchoolWeekDuty', target: SchoolWeekDuty, timeField: 'updated_at' },
  { name: 'SchoolOpeningInstruction', target: SchoolOpeningInstruction, timeField: 'updated_at' },
  { name: 'ClassBringItem', target: ClassBringItem, timeField: 'updated_at' },
  { name: 'BringItemCatalog', target: BringItemCatalog, timeField: 'updated_at' },
  { name: 'ClassDaySubject', target: ClassDaySubject, timeField: 'updated_at' },
  { name: 'SchoolMaterial', target: SchoolMaterial, timeField: 'updated_at' },
  { name: 'ExtracurricularActivity', target: ExtracurricularActivity, timeField: 'updated_at' },
  { name: 'SchoolVacation', target: SchoolVacation, timeField: 'updated_at' },
  { name: 'ParentMeeting', target: ParentMeeting, timeField: 'updated_at' },
  { name: 'ExamPeriod', target: ExamPeriod, timeField: 'updated_at' },
  { name: 'StudentClassAssignment', target: StudentClassAssignment, timeField: 'updated_at' },
  { name: 'ClassDecisionThreshold', target: ClassDecisionThreshold, timeField: 'updated_at' },
  { name: 'Grade', target: Grade, timeField: 'updated_at' },
  { name: 'PreschoolGrade', target: PreschoolGrade, timeField: 'updated_at' },
  { name: 'Bank', target: Bank, timeField: 'updated_at' },
  { name: 'BankAccount', target: BankAccount, timeField: 'updated_at' },
  { name: 'Expense', target: Expense, timeField: 'updated_at' },
  { name: 'Account', target: Account, timeField: 'created_at' },
  { name: 'Exercice', target: Exercice, timeField: 'updated_at' },
  { name: 'OtherRevenue', target: OtherRevenue, timeField: 'created_at' },
  { name: 'JournalEntry', target: JournalEntry, timeField: 'created_at' },
  { name: 'JournalEntryLine', target: JournalEntryLine, timeField: 'created_at' },
  { name: 'FileMetadata', target: FileMetadata, timeField: 'updated_at' },
  { name: 'Attendance', target: Attendance, timeField: 'created_at' },
  { name: 'Lateness', target: Lateness, timeField: 'created_at' },
  { name: 'DisciplinaryMeasure', target: DisciplinaryMeasure, timeField: 'updated_at' },
  { name: 'DisciplinaryDeduction', target: DisciplinaryDeduction, timeField: 'created_at' },
  { name: 'HomeworkAssignment', target: HomeworkAssignment, timeField: 'updated_at' },
  { name: 'HomeworkGrade', target: HomeworkGrade, timeField: 'updated_at' },
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
