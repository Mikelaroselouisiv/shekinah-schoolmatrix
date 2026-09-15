import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { Class } from '../classes/class.entity';

@Entity('class_bring_item')
@Index('IDX_class_bring_item_class_year', ['class_id', 'academic_year', 'sort_order'])
export class ClassBringItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  class_id: string;

  @ManyToOne(() => Class, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'class_id' })
  class: Class;

  @Column({ type: 'varchar', length: 20, nullable: true })
  academic_year: string | null;

  @Column({ type: 'smallint', default: 1 })
  day_of_week: number;

  @Column({ type: 'smallint', default: 0 })
  sort_order: number;

  @Column({ type: 'varchar', length: 160 })
  label: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
