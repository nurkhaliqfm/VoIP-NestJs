import { Module } from '@nestjs/common';
import { VoipService } from './voip.service';
import { AppController } from './voip.controller';

@Module({
  providers: [VoipService],
  controllers: [AppController],
  exports: [VoipService],
})
export class VoipModule {}
