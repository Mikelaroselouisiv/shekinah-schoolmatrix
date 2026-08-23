import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/user.entity';
import { Class } from '../classes/class.entity';
import { LevelScopeService } from './level-scope.service';

@Module({
  imports: [TypeOrmModule.forFeature([User, Class])],
  providers: [LevelScopeService],
  exports: [LevelScopeService],
})
export class LevelScopeModule {}
