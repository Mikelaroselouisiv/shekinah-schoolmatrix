import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Student } from './student.entity';
import { StudentClassAssignment } from '../formation-classe/student-class-assignment.entity';
import { GradesService } from '../grades/grades.service';
import { PreschoolGradesService } from '../grades/preschool-grades.service';
import { EconomatService } from '../economat/economat.service';
import { DisciplineService } from '../discipline/discipline.service';
import { serializeStudent } from './student.serialize';
import { isPreschoolClass } from '../utils/preschool';
import { SchoolProfile } from '../school-profile/school-profile.entity';

@Injectable()
export class StudentsDossierService {
  constructor(
    @InjectRepository(Student)
    private readonly studentRepo: Repository<Student>,
    @InjectRepository(StudentClassAssignment)
    private readonly assignmentRepo: Repository<StudentClassAssignment>,
    @InjectRepository(SchoolProfile)
    private readonly schoolProfileRepo: Repository<SchoolProfile>,
    private readonly gradesService: GradesService,
    private readonly preschoolGradesService: PreschoolGradesService,
    private readonly economatService: EconomatService,
    private readonly disciplineService: DisciplineService,
  ) {}

  async getDossier(studentId: string) {
    const student = await this.studentRepo.findOne({
      where: { id: studentId },
      relations: ['class', 'room'],
    });
    if (!student) throw new NotFoundException('Student not found');

    const assignments = await this.assignmentRepo.find({
      where: { student: { id: studentId } },
      relations: ['class', 'academic_year'],
    });
    assignments.sort((a, b) =>
      (b.academic_year?.name ?? '').localeCompare(a.academic_year?.name ?? ''),
    );
    const currentYearId =
      (await this.schoolProfileRepo.find({ take: 1 }))[0]
        ?.current_academic_year_id ?? null;

    const years = [];
    for (const a of assignments) {
      const yearId = a.academic_year?.id;
      const yearName = a.academic_year?.name ?? '';
      const liveClass = yearId && currentYearId && yearId === currentYearId
        ? student.class
        : a.class;
      const classId = liveClass?.id ?? a.class?.id;
      if (!yearId) continue;
      const preschool = isPreschoolClass(liveClass?.description ?? a.class?.description, liveClass?.level ?? a.class?.level);
      const [exam_results, preschool_results, payment] = await Promise.all([
        preschool
          ? Promise.resolve(null)
          : this.gradesService.getStudentExamResults(studentId, yearId, classId),
        preschool
          ? this.preschoolGradesService.getStudentPreschoolResults(studentId, yearId)
          : Promise.resolve(null),
        this.economatService.getStudentPaymentStatus(studentId, yearName || undefined, classId),
      ]);
      years.push({
        academic_year_id: yearId,
        academic_year_name: yearName,
        class_id: classId ?? null,
        class_name: liveClass?.name ?? a.class?.name ?? null,
        class_level: liveClass?.level ?? a.class?.level ?? null,
        is_preschool: preschool,
        decision: a.decision,
        average: a.average != null ? Number(a.average) : null,
        exam_results,
        preschool_results,
        payment,
      });
    }

    let discipline = null;
    try {
      discipline = await this.disciplineService.getStudentDisciplineSummary(studentId);
    } catch {
      discipline = null;
    }

    return {
      student: serializeStudent(student),
      years,
      discipline,
    };
  }
}
