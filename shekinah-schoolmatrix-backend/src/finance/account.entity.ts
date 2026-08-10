import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';

/** Plan comptable : compte (ex. 512000 Caisse, 411000 Clients). */
@Entity('account')
export class Account {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 20, unique: true })
  code: string;

  @Column()
  label: string;

  @Column({ type: 'varchar', length: 20 })
  type: string; // ACTIF | PASSIF | CHARGE | PRODUIT

  @Column({ type: 'uuid', nullable: true })
  parent_id: string | null;

  @ManyToOne(() => Account, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'parent_id' })
  parent: Account | null;

  @CreateDateColumn()
  created_at: Date;
}
