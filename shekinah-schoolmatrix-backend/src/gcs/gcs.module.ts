import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GcsService } from './gcs.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [GcsService],
  exports: [GcsService],
})
export class GcsModule {}
