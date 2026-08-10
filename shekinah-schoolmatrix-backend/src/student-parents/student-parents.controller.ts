import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { StudentParentsService } from './student-parents.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('student-parents')
@UseGuards(JwtAuthGuard)
export class StudentParentsController {
  constructor(private readonly studentParentsService: StudentParentsService) {}

  @Get('my-children')
  async myChildren(@Req() req: { user?: { userId?: number; sub?: number; id?: number } }) {
    const userId = req.user?.userId ?? req.user?.sub ?? req.user?.id;
    if (!userId) return { ok: true, students: [] };
    const students = await this.studentParentsService.getChildrenForParent(userId as number);
    return { ok: true, students };
  }
}
