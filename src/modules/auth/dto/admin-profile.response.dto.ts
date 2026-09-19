import { ApiProperty } from '@nestjs/swagger';

import { Admin, AdminRole } from '../../admins/entities/admin.entity';

export class AdminProfileResponseDto {
  @ApiProperty({ format: 'uuid', example: '8f4a1c1e-6c1f-4f2b-9f7a-2a2f1c3d4e5f' })
  id!: string;

  @ApiProperty({ example: 'admin@example.com' })
  email!: string;

  @ApiProperty({ example: '관리자', nullable: true, type: String })
  name!: string | null;

  @ApiProperty({ enum: AdminRole, example: AdminRole.SUPER_ADMIN })
  role!: AdminRole;

  static from(admin: Admin): AdminProfileResponseDto {
    return { id: admin.id, email: admin.email, name: admin.name, role: admin.role };
  }
}
