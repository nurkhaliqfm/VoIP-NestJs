import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import type { Server as HttpServer } from 'http';
import HotelVoIPManager from 'src/common/utils/socket.util';

@Injectable()
export class VoipService implements OnModuleDestroy {
  private readonly logger = new Logger(VoipService.name);
  private manager?: HotelVoIPManager;

  getStatus(): { message: string; status: string } {
    return { message: 'VoIP Server is running!', status: 'ok' };
  }

  /**
   * Initialize the HotelVoIPManager once the Nest HTTP server exists.
   * Safe to call multiple times; initialization is idempotent.
   */
  init(server?: HttpServer): void {
    if (!this.manager) {
      this.manager = new HotelVoIPManager(server);
    }
  }

  getManager(): HotelVoIPManager | undefined {
    return this.manager;
  }

  getIO() {
    return this.manager?.getIO();
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
