import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FileMetadata } from './file-metadata.entity';

@Module({
  imports: [TypeOrmModule.forFeature([FileMetadata])],
  exports: [TypeOrmModule],
})
export class FileMetadataModule {}
