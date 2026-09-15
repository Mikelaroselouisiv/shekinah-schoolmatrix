import { InitialSchema1739000000000 } from './1739000000000-InitialSchema';
import { InitialBusinessSchema1738000000000 } from './1738000000000-InitialBusinessSchema';
import { FileMetadata1739000000001 } from './1739000000001-FileMetadata';
import { FinanceAndFeeServiceNature1739000000002 } from './1739000000002-FinanceAndFeeServiceNature';
import { ClassFeeDueDate1739000000003 } from './1739000000003-ClassFeeDueDate';
import { SchoolContactAndSignatures1739000000004 } from './1739000000004-SchoolContactAndSignatures';
import { SchoolSignatureImageUrl1739000000005 } from './1739000000005-SchoolSignatureImageUrl';
import { RoomClassCapacityStudentRoom1739000000006 } from './1739000000006-RoomClassCapacityStudentRoom';
import { BanksAndBankAccounts1739000000007 } from './1739000000007-BanksAndBankAccounts';
import { TeacherClassSubjectRoom1739000000008 } from './1739000000008-TeacherClassSubjectRoom';
import { StudentPhoto1739000000009 } from './1739000000009-StudentPhoto';
import { NormalizeStudentNisuUnique1739000000010 } from './1739000000010-NormalizeStudentNisuUnique';
import { StudentManagementCode1739000000011 } from './1739000000011-StudentManagementCode';
import { SyncTombstone1739000000012 } from './1739000000012-SyncTombstone';
import { UserMustChangePassword1739000000013 } from './1739000000013-UserMustChangePassword';
import { RefreshToken1739000000014 } from './1739000000014-RefreshToken';
import { RoleEducationLevels1739000000015 } from './1739000000015-RoleEducationLevels';
import { HomeworkAndScheduleMaterials1739000000016 } from './1739000000016-HomeworkAndScheduleMaterials';
import { StudentArchive1739000000017 } from './1739000000017-StudentArchive';
import { ScheduleDayMoments1739000000018 } from './1739000000018-ScheduleDayMoments';
import { PedagogicalDirectorHaitiLevels1739000000019 } from './1739000000019-PedagogicalDirectorHaitiLevels';
import { MorningOpeningDuties1739000000020 } from './1739000000020-MorningOpeningDuties';
import { SchoolMaterialsCatalog1739000000021 } from './1739000000021-SchoolMaterialsCatalog';
import { PreschoolEvalAndScale1739000000022 } from './1739000000022-PreschoolEvalAndScale';
import { PaymentTransactionCancelled1739000000023 } from './1739000000023-PaymentTransactionCancelled';
import { MorningOpeningRubrics1739000000024 } from './1739000000024-MorningOpeningRubrics';
import { ClassDayLists1739000000025 } from './1739000000025-ClassDayLists';
import { BringItemCatalog1739000000026 } from './1739000000026-BringItemCatalog';
import { SyncScheduleAssignments1739000000027 } from './1739000000027-SyncScheduleAssignments';
import { SyncMissingBusinessEntities1739000000028 } from './1739000000028-SyncMissingBusinessEntities';
import { TeacherAssignmentUpdatedAt1739000000029 } from './1739000000029-TeacherAssignmentUpdatedAt';
import { SubjectAudiencePeriodScope1739000000030 } from './1739000000030-SubjectAudiencePeriodScope';

/** Liste des migrations (ordre d’exécution). Utilisée par l’app au démarrage (migrationsRun). */
export const migrations = [
  InitialBusinessSchema1738000000000,
  InitialSchema1739000000000,
  FileMetadata1739000000001,
  FinanceAndFeeServiceNature1739000000002,
  ClassFeeDueDate1739000000003,
  SchoolContactAndSignatures1739000000004,
  SchoolSignatureImageUrl1739000000005,
  RoomClassCapacityStudentRoom1739000000006,
  BanksAndBankAccounts1739000000007,
  TeacherClassSubjectRoom1739000000008,
  StudentPhoto1739000000009,
  NormalizeStudentNisuUnique1739000000010,
  StudentManagementCode1739000000011,
  SyncTombstone1739000000012,
  UserMustChangePassword1739000000013,
  RefreshToken1739000000014,
  RoleEducationLevels1739000000015,
  HomeworkAndScheduleMaterials1739000000016,
  StudentArchive1739000000017,
  ScheduleDayMoments1739000000018,
  PedagogicalDirectorHaitiLevels1739000000019,
  MorningOpeningDuties1739000000020,
  SchoolMaterialsCatalog1739000000021,
  PreschoolEvalAndScale1739000000022,
  PaymentTransactionCancelled1739000000023,
  MorningOpeningRubrics1739000000024,
  ClassDayLists1739000000025,
  BringItemCatalog1739000000026,
  SyncScheduleAssignments1739000000027,
  SyncMissingBusinessEntities1739000000028,
  TeacherAssignmentUpdatedAt1739000000029,
  SubjectAudiencePeriodScope1739000000030,
];
