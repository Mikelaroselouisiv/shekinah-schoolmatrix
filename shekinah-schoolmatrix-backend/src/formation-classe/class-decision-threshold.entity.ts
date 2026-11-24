import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
} from 'typeorm';
import { Class } from '../classes/class.entity';
import { AcademicYear } from '../academic-year/academic-year.entity';

/** Seuils de moyenne pour les décisions de fin d'année par classe et année */
@Entity('class_decision_threshold')
@Unique(['class', 'academic_year'])
export class ClassDecisionThreshold {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Class, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'class_id' })
  class: Class;

  @ManyToOne(() => AcademicYear, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'academic_year_id' })
  academic_year: AcademicYear;

  /** Moyenne minimale /10 pour ADMIS. */
  @Column({ type: 'decimal', precision: 6, scale: 2, default: '5' })
  min_average_admis: string;

  /** Moyenne minimale /10 du cas spécial, sous le seuil d'admission. */
  @Column({ type: 'decimal', precision: 6, scale: 2, default: '4' })
  min_average_cas_special: string;

  /** Ancien seuil, conservé pour les lignes déjà enregistrées. */
  @Column({ type: 'decimal', precision: 6, scale: 2, default: '4' })
  min_average_admis_ailleurs: string;

  /** Moyenne minimale /10 pour REDOUBLER. En dessous : expulsé. */
  @Column({ type: 'decimal', precision: 6, scale: 2, default: '3' })
  min_average_redoubler: string;

  /** Ancien seuil, conservé pour les lignes déjà enregistrées. */
  @Column({ type: 'decimal', precision: 6, scale: 2, default: '0' })
  min_average_ajourne: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
