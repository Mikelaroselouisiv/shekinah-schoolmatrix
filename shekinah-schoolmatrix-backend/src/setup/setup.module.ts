import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { SetupController } from './setup.controller';

@Module({
  imports: [UsersModule],
  controllers: [SetupController],
})
export class SetupModule {}
