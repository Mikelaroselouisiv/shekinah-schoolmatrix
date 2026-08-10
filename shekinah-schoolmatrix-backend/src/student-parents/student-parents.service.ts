import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StudentParent } from './student-parent.entity';
import { User } from '../users/user.entity';

@Injectable()
export class StudentParentsService {
  constructor(
    @InjectRepository(StudentParent)
    private readonly studentParentRepo: Repository<StudentParent>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async getChildrenForParent(parentUserId: number): Promise<any[]> {
    const user = await this.userRepo.findOne({
      where: { id: parentUserId },
      relations: ['role'],
    });
    if (!user) return [];
    const roleName = user.role?.name ?? (typeof user.role === 'string' ? user.role : '');
    if (roleName !== 'PARENT') return [];
    const links = await this.studentParentRepo
      .createQueryBuilder('sp')
      .innerJoinAndSelect('sp.student', 's')
      .leftJoinAndSelect('s.class', 'c')
      .where('sp.user_id = :uid', { uid: parentUserId })
      .orderBy('sp.created_at', 'ASC')
      .getMany();
    return links.map((sp) => {
      const s = sp.student;
      return {
        id: s?.id,
        first_name: s?.first_name,
        last_name: s?.last_name,
        class_id: s?.class?.id,
        class_name: s?.class?.name,
        photo_identity_student: s?.photo_identity_student,
      };
    });
  }
}
