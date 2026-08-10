import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SchoolProfileModule } from './school-profile/school-profile.module';
import { RoomsModule } from './rooms/rooms.module';
import { SubjectsModule } from './subjects/subjects.module';
import { ClassesModule } from './classes/classes.module';
import { StudentsModule } from './students/students.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { TeachersModule } from './teachers/teachers.module';
import { ExamScheduleModule } from './exam-schedule/exam-schedule.module';
import { ExtracurricularActivityModule } from './extracurricular-activity/extracurricular-activity.module';
import { EconomatModule } from './economat/economat.module';
import { FinanceModule } from './finance/finance.module';
import { AcademicYearModule } from './academic-year/academic-year.module';
import { PeriodModule } from './period/period.module';
import { GradesModule } from './grades/grades.module';
import { UploadsModule } from './uploads/uploads.module';
import { DisciplineModule } from './discipline/discipline.module';
import { FormationClasseModule } from './formation-classe/formation-classe.module';
import { StudentParentsModule } from './student-parents/student-parents.module';
import { RolesModule } from './roles/roles.module';
import { SetupModule } from './setup/setup.module';
import { SystemSeedModule } from './system-seed/system-seed.module';
import { SystemSeedService } from './system-seed/system-seed.service';
import { S3Module } from './s3/s3.module';
import { GcsModule } from './gcs/gcs.module';
import { StorageModule } from './storage/storage.module';
import { FileMetadataModule } from './file-metadata/file-metadata.module';
import { SyncModule } from './sync/sync.module';
import { StatisticsModule } from './statistics/statistics.module';
import { migrations } from './migrations';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: process.env.NODE_ENV === 'production' ? '.env.prod' : '.env.dev',
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get('DB_HOST'),
        port: parseInt(config.get('DB_PORT') ?? '5432', 10),
        username: config.get('DB_USER'),
        password: config.get('DB_PASS'),
        database: config.get('DB_NAME'),
        autoLoadEntities: true,
        synchronize: process.env.NODE_ENV !== 'production',
        migrations,
        migrationsRun: true,
        migrationsTableName: 'typeorm_migrations',
      }),
    }),
    StorageModule,
    GcsModule,
    S3Module,
    FileMetadataModule,
    SyncModule,
    SystemSeedModule,
    RolesModule,
    SetupModule,
    SchoolProfileModule,
    RoomsModule,
    SubjectsModule,
    ClassesModule,
    StudentsModule,
    UsersModule,
    TeachersModule,
    ExamScheduleModule,
    ExtracurricularActivityModule,
    EconomatModule,
    FinanceModule,
    AcademicYearModule,
    PeriodModule,
    GradesModule,
    UploadsModule,
    DisciplineModule,
    FormationClasseModule,
    StudentParentsModule,
    StatisticsModule,
    AuthModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {
  constructor(private readonly systemSeedService: SystemSeedService) {}

  async onModuleInit() {
    await this.systemSeedService.run();
  }
}
