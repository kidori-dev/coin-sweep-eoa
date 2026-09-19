import { Controller, Get, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';

import { SESSION_AUTH } from '../../swagger.setup';
import { TransactionResponseDto } from './dto/transaction.response.dto';
import { TransactionType } from './entities/transaction.entity';
import { TransactionsService } from './transactions.service';

@ApiTags('transactions')
@ApiCookieAuth(SESSION_AUTH)
@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactions: TransactionsService) {}

  @Get()
  @ApiOperation({
    summary: '트랜잭션 목록',
    description:
      '입금(와쳐)과 집금(sweep) 트랜잭션을 함께 담는다. 컨트랙트, 보낸 주소, 받은 주소, 금액.',
  })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'userWalletId', required: false })
  @ApiQuery({ name: 'type', required: false, enum: TransactionType })
  @ApiOkResponse({ type: [TransactionResponseDto] })
  findAll(
    @Query('limit') limit?: string,
    @Query('userWalletId') userWalletId?: string,
    @Query('type') type?: TransactionType,
  ): Promise<TransactionResponseDto[]> {
    return this.transactions.findAll({
      limit: limit ? parseInt(limit, 10) : 50,
      userWalletId,
      type,
    });
  }
}
