import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import type { Server as HttpServer } from 'http';
import * as path from 'path';
import * as fs from 'fs';
import { HotelVoIPManager, RoomDataDTO } from 'src/common';
import { ReceptionistDataDTO } from 'src/common/dto/receptionist.dto';

@Injectable()
export class VoipService implements OnModuleDestroy {
  private readonly logger = new Logger(VoipService.name);
  private manager?: HotelVoIPManager;

  getStatus(): { message: string; status: string } {
    return { message: 'VoIP Server is running!', status: 'ok' };
  }

  getRooms(): Array<RoomDataDTO> {
    const roomsPath = path.join(__dirname, '../../database/rooms.json');
    const rooms = JSON.parse(
      fs.readFileSync(roomsPath, 'utf-8'),
    ) as Array<RoomDataDTO>;

    return rooms;
  }

  getReceptionists(): Array<ReceptionistDataDTO> {
    const receptionistsPath = path.join(
      __dirname,
      '../../database/receptionist.json',
    );
    const receptionists = JSON.parse(
      fs.readFileSync(receptionistsPath, 'utf-8'),
    ) as Array<ReceptionistDataDTO>;

    console.log(receptionists);

    return receptionists;
  }

  init(server?: HttpServer): void {
    if (!this.manager) {
      this.manager = new HotelVoIPManager(server);
    }
  }

  onModuleDestroy(): void {
    if (this.manager) {
      try {
        void this.manager.getIO().close();
      } catch (_e) {
        this.logger.warn('Error closing Socket.IO server', _e);
      }
    }
  }
}
