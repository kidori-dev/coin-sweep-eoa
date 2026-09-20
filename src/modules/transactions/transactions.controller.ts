import { Controller, Get, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';

import { SESSION_AUTH } from '../../swagger.setup';
import { ContractsService } from '../contracts/contracts.service';
import { TransactionResponseDto } from './dto/transaction.response.dto';
import { TransactionType } from './entities/transaction.entity';
import { TransactionsService } from './transactions.service';

@ApiTags('transactions')
@ApiCookieAuth(SESSION_AUTH)
@Controller('transactions')
export class TransactionsController {
  constructor(
    private readonly transactions: TransactionsService,
    private readonly contracts: ContractsService,
  ) {}

  @Get()
  @ApiOperation({
    summary: '트랜잭션 목록',
    description:
      '입금(와쳐)과 집금(sweep) 트랜잭션을 함께 담는다. 컨트랙트, 보낸 주소, 받은 주소, 금액.',
  })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'userWalletId', required: false })
  @ApiQuery({ name: 'type', required: false, enum: TransactionType })
  @ApiQuery({
    name: 'contract',
    required: false,
    description: '컨트랙트 주소. 네이티브 TRX 는 "TRX"',
  })
  @ApiOkResponse({ type: [TransactionResponseDto] })
  async findAll(
    @Query('limit') limit?: string,
    @Query('userWalletId') userWalletId?: string,
    @Query('type') type?: TransactionType,
    @Query('contract') contract?: string,
  ): Promise<TransactionResponseDto[]> {
    const resolved = contract ? await this.contracts.resolveOrFail(contract) : null;
    return this.transactions.findAll({
      limit: limit ? parseInt(limit, 10) : 50,
      userWalletId,
      contractId: resolved?.id,
      type,
    });
  }
}
