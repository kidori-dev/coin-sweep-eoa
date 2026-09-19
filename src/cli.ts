import { Logger } from '@nestjs/common';
import { CommandFactory } from 'nest-commander';

import { CliModule } from './commands/cli.module';

async function bootstrap(): Promise<void> {
  await CommandFactory.run(CliModule, {
    logger: ['error', 'warn', 'log'],
    errorHandler: (err) => {
      Logger.error(err.message, err.stack, 'CLI');
      process.exitCode = 1;
    },
  });
}

void bootstrap();
