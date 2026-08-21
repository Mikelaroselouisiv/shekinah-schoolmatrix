import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExtracurricularActivity } from './extracurricular-activity.entity';
import { ExtracurricularActivityService } from './extracurricular-activity.service';
import { ExtracurricularActivityController } from './extracurricular-activity.controller';
import { ParentScopeModule } from '../auth/parent-scope.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ExtracurricularActivity]),
    ParentScopeModule,
  ],
  controllers: [ExtracurricularActivityController],
  providers: [ExtracurricularActivityService],
  exports: [ExtracurricularActivityService],
})
export class ExtracurricularActivityModule {}
