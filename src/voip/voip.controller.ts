import { Controller, Get } from '@nestjs/common';
import { VoipService } from './voip.service';
import { type RoomDataDTO } from 'src/common';
import { ReceptionistDataDTO } from 'src/common/dto/receptionist.dto';

@Controller('/api/voip')
export class AppController {
  constructor(private readonly voipService: VoipService) {}

  @Get('/status')
  getVoIPStatus(): { message: string; status: string } {
    return this.voipService.getStatus();
  }

  @Get('/rooms')
  getVoIPRooms(): Array<RoomDataDTO> {
    return this.voipService.getRooms();
  }

  @Get('/receptionists')
  getVoIPReceptionists(): Array<ReceptionistDataDTO> {
    return this.voipService.getReceptionists();
  }
}
