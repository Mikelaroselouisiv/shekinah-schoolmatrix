import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExtracurricularActivity } from './extracurricular-activity.entity';
import { ExtracurricularActivityService } from './extracurricular-activity.service';
import { ExtracurricularActivityController } from './extracurricular-activity.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([ExtracurricularActivity]),
  ],
  controllers: [ExtracurricularActivityController],
  providers: [ExtracurricularActivityService],
  exports: [ExtracurricularActivityService],
})
export class ExtracurricularActivityModule {}
