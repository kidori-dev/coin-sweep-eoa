import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { Contract } from '../../contracts/entities/contract.entity';
import { UserWallet } from './user-wallet.entity';

/**
 * 지갑 하나가 자산별로 들고 있는 잔고. EOA 주소는 토큰과 무관하게 여러 자산을 동시에 담으므로
 * user_wallet 에 금액 컬럼을 두면 지갑 행이 곧 (지갑 × 토큰) 이 되어 주소·파생인덱스 유니크가 깨진다.
 *
 * deposit_amount 와 sweep_amount 는 둘 다 **단조 증가**하는 누계다. 미집금 잔액은 그 차이고,
 * 이 값으로 집금 대상을 고르므로 지갑마다 balanceOf 를 쏠 필요가 없다.
 */
@Entity('user_wallet_balance')
@Index('UQ_user_wallet_balance', ['userWalletId', 'contractId'], { unique: true })
export class UserWalletBalance {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_wallet_id', type: 'uuid' })
  userWalletId!: string;

  @ManyToOne(() => UserWallet, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_wallet_id' })
  userWallet!: UserWallet;

  @Index()
  @Column({ name: 'contract_id', type: 'uuid' })
  contractId!: string;

  @ManyToOne(() => Contract, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'contract_id' })
  contract!: Contract;

  /** 입금 와쳐가 감지할 때마다 더한다. 줄지 않는다 */
  @Column({ name: 'deposit_amount', type: 'numeric', precision: 38, scale: 0, default: 0 })
  depositAmount!: string;

  /** 집금에 성공할 때마다 더한다. 줄지 않는다 */
  @Column({ name: 'sweep_amount', type: 'numeric', precision: 38, scale: 0, default: 0 })
  sweepAmount!: string;

  @Column({ name: 'last_swept_at', type: 'timestamptz', nullable: true })
  lastSweptAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  /** 우리가 아는 미집금 잔액 */
  get pendingAmount(): string {
    return (BigInt(this.depositAmount) - BigInt(this.sweepAmount)).toString();
  }
}
