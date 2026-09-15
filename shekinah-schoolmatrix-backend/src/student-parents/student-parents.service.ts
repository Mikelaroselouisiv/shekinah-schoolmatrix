import { Injectable } from '@nestjs/common';
import { UsersService } from '../users/users.service';

export interface ParentChild {
  id: string;
  order_number: string | null;
  first_name: string;
  last_name: string;
  class_id: string | null;
  class_name: string | null;
  photo_identity_student: string | null;
}

/**
 * Rattachement parent → élève.
 *
 * Source unique : `user_linked_student`, alimentée par `linked_student_ids`
 * dans l'administration des utilisateurs. L'ancienne table `student_parent`
 * n'était écrite par aucun code : cet endpoint renvoyait donc toujours une
 * liste vide. Elle n'est plus lue.
 */
@Injectable()
export class StudentParentsService {
  constructor(private readonly users: UsersService) {}

  /** Même source que GET /users/me/linked-students (user_linked_student). */
  async getChildrenForParent(parentUserId: number): Promise<ParentChild[]> {
    const user = await this.users.findOne(parentUserId).catch(() => null);
    if (!user) return [];
    const list = await this.users.getLinkedStudentsForFiche(parentUserId);
    return list.map((s) => ({
      id: s.id,
      order_number: s.order_number ?? null,
      first_name: s.first_name,
      last_name: s.last_name,
      class_id: s.class_id ?? null,
      class_name: s.class_name ?? null,
      photo_identity_student: (s as { photo_identity_student?: string | null })
        .photo_identity_student ?? null,
    }));
  }
}
