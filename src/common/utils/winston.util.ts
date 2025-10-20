import { ConfigService } from '@nestjs/config';
import chalk from 'chalk';
import * as winston from 'winston';

export function createWinstonFormat(configService?: ConfigService) {
  const appName = configService?.get<string>('APP_NAME') || 'Nest';
  const showPid = configService?.get<string>('LOG_SHOW_PID', 'true') === 'true';

  return winston.format.combine(
    winston.format((info) => {
      info.level = info.level.toUpperCase();
      return info;
    })(),
    winston.format.colorize({ all: true }),
    winston.format.timestamp({ format: 'MM/DD/YYYY, h:mm:ss A' }),
    winston.format.ms(),
    winston.format.printf(
      ({ level, message, timestamp, context, ms, stack }) => {
        const pidPart = showPid ? ` ${process.pid}` : '';
        const baseLog = `${chalk.green(`[${appName}] ${pidPart}  - `)}${timestamp as string}     ${level}${context ? chalk.yellow(` [${JSON.stringify(context)}]`) : chalk.yellow(` [${appName}Application]`)} ${message as string}  ${chalk.yellow(ms)}`;
        return stack ? `${baseLog}\n${JSON.stringify(stack)}` : baseLog;
      },
    ),
  );
}
