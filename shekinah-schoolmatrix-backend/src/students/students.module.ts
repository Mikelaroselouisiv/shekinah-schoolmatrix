import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Student } from './student.entity';
import { StudentPhoto } from './student-photo.entity';
import { StudentsService } from './students.service';
import { StudentsController } from './students.controller';
import { StudentPhotosService } from './student-photos.service';
import { StudentPhotosController } from './student-photos.controller';
import { StudentAiImportService } from './student-ai-import.service';
import { FormationClasseModule } from '../formation-classe/formation-classe.module';
import { ClassesModule } from '../classes/classes.module';
import { RoomsModule } from '../rooms/rooms.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Student, StudentPhoto]),
    forwardRef(() => FormationClasseModule),
    ClassesModule,
    RoomsModule,
  ],
  controllers: [StudentsController, StudentPhotosController],
  providers: [StudentsService, StudentPhotosService, StudentAiImportService],
  exports: [StudentsService, StudentPhotosService, StudentAiImportService],
})
export class StudentsModule {}
