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
import { StudentCode1739000000011 } from './1739000000011-StudentCode';
import { StudentCodeAlphanumeric1739000000012 } from './1739000000012-StudentCodeAlphanumeric';
import { SyncTombstone1739000000013 } from './1739000000013-SyncTombstone';
import { FeeBillingFrequency1739000000014 } from './1739000000014-FeeBillingFrequency';
import { UserMustChangePassword1739000000015 } from './1739000000015-UserMustChangePassword';
import { RefreshToken1739000000016 } from './1739000000016-RefreshToken';
import { SyncTombstoneV21739000000017 } from './1739000000017-SyncTombstoneV2';

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
  StudentCode1739000000011,
  StudentCodeAlphanumeric1739000000012,
  SyncTombstone1739000000013,
  FeeBillingFrequency1739000000014,
  UserMustChangePassword1739000000015,
  RefreshToken1739000000016,
  SyncTombstoneV21739000000017,
];
