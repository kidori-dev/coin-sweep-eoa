import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import { Request } from 'express';

import { Admin } from '../../modules/admins/entities/admin.entity';

export const CurrentAdmin = createParamDecorator(
  (_data: unknown, context: ExecutionContext): Admin | undefined =>
    context.switchToHttp().getRequest<Request>().user,
);
