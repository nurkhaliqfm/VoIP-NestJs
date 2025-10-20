import { Controller, Get } from '@nestjs/common';
import { VoipService } from './voip.service';

@Controller('/api/voip')
export class AppController {
  constructor(private readonly voipService: VoipService) {}

  @Get('/status')
  getVoIPStatus(): { message: string; status: string } {
    return this.voipService.getStatus();
  }
}
