import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { User } from '../users/user.entity';

/**
 * Session renouvelable d'un utilisateur.
 *
 * Le jeton brut n'est JAMAIS stocké : seul son SHA-256 l'est, comme un mot de
 * passe. Une fuite de la base ne donne donc pas de session utilisable.
 *
 * `family_id` regroupe les jetons issus d'une même connexion : à chaque
 * renouvellement l'ancien est révoqué et un nouveau naît dans la même famille.
 * Si un jeton déjà révoqué est rejoué, c'est qu'il a été volé — toute la
 * famille est alors révoquée.
 *
 * Table volontairement absente de sync.entities.ts : une session appartient au
 * nœud qui l'a émise et n'a pas à être répliquée entre l'école et le cloud.
 */
@Entity('refresh_token')
export class RefreshToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'int' })
  user_id: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64 })
  token_hash: string;

  @Index()
  @Column({ type: 'uuid' })
  family_id: string;

  @Column({ type: 'timestamp' })
  expires_at: Date;

  @Column({ type: 'timestamp', nullable: true })
  revoked_at: Date | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  revoked_reason: string | null;

  @Column({ type: 'timestamp', nullable: true })
  last_used_at: Date | null;

  @CreateDateColumn()
  created_at: Date;
}
