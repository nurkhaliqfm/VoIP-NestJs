import { Module } from '@nestjs/common';
import { VoipModule } from './voip/voip.module';
import { CommonModule } from './common/common.module';

@Module({
  imports: [VoipModule, CommonModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
