import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Student } from './student.entity';
import { StudentPhoto } from './student-photo.entity';
import { StudentsService } from './students.service';
import { StudentsDossierService } from './students-dossier.service';
import { StudentsController } from './students.controller';
import { StudentPhotosService } from './student-photos.service';
import { StudentPhotosController } from './student-photos.controller';
import { StudentAiImportService } from './student-ai-import.service';
import { FormationClasseModule } from '../formation-classe/formation-classe.module';
import { StudentClassAssignment } from '../formation-classe/student-class-assignment.entity';
import { SchoolProfile } from '../school-profile/school-profile.entity';
import { ClassesModule } from '../classes/classes.module';
import { RoomsModule } from '../rooms/rooms.module';
import { ParentScopeModule } from '../auth/parent-scope.module';
import { UsersModule } from '../users/users.module';
import { LevelScopeModule } from '../auth/level-scope.module';
import { GradesModule } from '../grades/grades.module';
import { EconomatModule } from '../economat/economat.module';
import { DisciplineModule } from '../discipline/discipline.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Student, StudentPhoto, StudentClassAssignment, SchoolProfile]),
    forwardRef(() => FormationClasseModule),
    ClassesModule,
    RoomsModule,
    ParentScopeModule,
    UsersModule,
    LevelScopeModule,
    GradesModule,
    EconomatModule,
    DisciplineModule,
  ],
  controllers: [StudentsController, StudentPhotosController],
  providers: [StudentsService, StudentsDossierService, StudentPhotosService, StudentAiImportService],
  exports: [StudentsService, StudentsDossierService, StudentPhotosService, StudentAiImportService],
})
export class StudentsModule {}
