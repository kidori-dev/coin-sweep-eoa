import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('user_wallet')
export class UserWallet {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64 })
  address!: string;

  @Index({ unique: true })
  @Column({ name: 'derivation_index', type: 'integer' })
  derivationIndex!: number;

  @Column({ name: 'user_ref', type: 'varchar', length: 128, nullable: true })
  userRef!: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ name: 'usdt_amount', type: 'numeric', precision: 38, scale: 0, default: 0 })
  usdtAmount!: string;

  @Column({ name: 'last_swept_at', type: 'timestamptz', nullable: true })
  lastSweptAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
