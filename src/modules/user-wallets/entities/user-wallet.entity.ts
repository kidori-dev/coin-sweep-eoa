import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * HD 파생으로 뽑은 입금용 EOA. 주소 자체는 자산과 무관하므로 금액을 들고 있지 않는다.
 * 자산별 잔고는 user_wallet_balance 에 있다.
 */
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

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
