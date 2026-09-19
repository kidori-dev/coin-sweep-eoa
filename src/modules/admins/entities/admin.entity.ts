import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum AdminRole {
  SUPER_ADMIN = 'super_admin',
  ADMIN = 'admin',
}

@Entity('admins')
export class Admin {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 255 })
  email!: string;

  @Column({ name: 'password_hash', type: 'varchar', length: 255, select: false })
  passwordHash!: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  name!: string | null;

  @Column({ type: 'enum', enum: AdminRole, default: AdminRole.ADMIN })
  role!: AdminRole;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ name: 'last_login_at', type: 'timestamptz', nullable: true })
  lastLoginAt!: Date | null;

  @Column({ name: 'password_changed_at', type: 'timestamptz', default: () => 'now()' })
  passwordChangedAt!: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
