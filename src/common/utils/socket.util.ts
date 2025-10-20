import {
  DefaultEventsMap,
  Server as IOServer,
  Socket as IOSocket,
} from 'socket.io';
import { createServer } from 'http';
import type { Server as HttpServer } from 'http';
import { Logger } from '@nestjs/common';

type TypedSocket = IOSocket<DefaultEventsMap>;
type TypedServer = IOServer<DefaultEventsMap>;

export class HotelVoIPManager {
  private readonly logger: Logger = new Logger(HotelVoIPManager.name);

  private io: TypedServer;
  private receptionistSocket: string | null = null;
  private callDeviceSocket: Record<string, string> = {};
  private activeCalls: Map<
    string,
    { roomSocket: string; receptionistSocket: string; roomNumber: string }
  > = new Map();

  constructor(server?: HttpServer) {
    const httpServer = server ?? createServer();
    this.io = new IOServer(httpServer, {
      cors: {
        origin: process.env.ALLOWED_HOST
          ? (JSON.parse(process.env.ALLOWED_HOST) as string[])
          : ['http://localhost:5173'],
      },
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.io.on('connection', (socket: TypedSocket) => {
      this.logger.log(`Client connected: ${socket.id}`);

      socket.on('register', (username: string) => {
        this.callDeviceSocket[socket.id] = username;
        this.logger.log(
          `Device registered: ${username} with socket ${socket.id}`,
        );
      });

      socket.on(
        'call',
        ({ to, offer }: { to: string; offer: RTCSessionDescriptionInit }) => {
          const targetSocketId = Object.keys(this.callDeviceSocket).find(
            (key) => this.callDeviceSocket[key] === to,
          );
          if (targetSocketId) {
            this.io.to(targetSocketId).emit('incomingCall', {
              from: this.callDeviceSocket[socket.id],
              offer,
            });
            this.logger.log(
              `Call initiated from ${this.callDeviceSocket[socket.id]} to ${to}`,
            );
          } else {
            socket.emit('call_error', { message: 'User not available' });
            this.logger.warn(
              `Call from ${this.callDeviceSocket[socket.id]} to ${to} failed: User not available`,
            );
          }
        },
      );

      socket.on(
        'answer',
        (data: { to: string; answer: RTCSessionDescriptionInit }) => {
          const targetSocketId = Object.keys(this.callDeviceSocket).find(
            (key) => this.callDeviceSocket[key] === data.to,
          );
          if (targetSocketId) {
            this.io.to(targetSocketId).emit('callAnswered', {
              from: this.callDeviceSocket[socket.id],
              answer: data.answer,
            });
            this.logger.log(
              `Call answered by ${this.callDeviceSocket[socket.id]} to ${data.to}`,
            );
          }
        },
      );

      socket.on(
        'iceCandidate',
        (data: { to: string; candidate: RTCIceCandidateInit }) => {
          const targetSocketId = Object.keys(this.callDeviceSocket).find(
            (key) => this.callDeviceSocket[key] === data.to,
          );
          if (targetSocketId) {
            this.io.to(targetSocketId).emit('iceCandidate', {
              from: this.callDeviceSocket[socket.id],
              candidate: data.candidate,
            });
            this.logger.log(
              `ICE candidate sent from ${this.callDeviceSocket[socket.id]} to ${data.to}`,
            );
          }
        },
      );

      socket.on('disconnect', () => {
        this.logger.log(`Client disconnected: ${socket.id}`);
        for (const [user, id] of Object.entries(this.callDeviceSocket)) {
          if (id === socket.id) delete this.callDeviceSocket[user];
        }
      });

      // // Register as receptionist
      // socket.on('register_receptionist', () => {
      //   this.receptionistSocket = socket.id;
      //   this.logger.log(`Receptionist registered: ${socket.id}`);
      // });

      // // Room starts a call to reception
      // socket.on(
      //   'start_call',
      //   (data: { roomNumber: string; guestName?: string }) => {
      //     if (!this.receptionistSocket) {
      //       socket.emit('call_failed', {
      //         reason: 'Receptionist not available',
      //       });
      //       return;
      //     }

      //     const callId = `call_${Date.now()}_${data.roomNumber}`;
      //     this.activeCalls.set(callId, {
      //       roomSocket: socket.id,
      //       receptionistSocket: this.receptionistSocket,
      //       roomNumber: data.roomNumber,
      //     });

      //     // Notify receptionist of incoming call
      //     this.io.to(this.receptionistSocket).emit('incoming_call', {
      //       roomNumber: data.roomNumber,
      //       guestName: data.guestName,
      //       callId,
      //     });
      //   },
      // );

      // // Receptionist accepts call
      // socket.on('accept_call', (data: { callId: string }) => {
      //   const call = this.activeCalls.get(data.callId);
      //   if (call) {
      //     this.io
      //       .to(call.roomSocket)
      //       .emit('call_accepted', { callId: data.callId });
      //   }
      // });

      // // Receptionist rejects call
      // socket.on('reject_call', (data: { callId: string }) => {
      //   const call = this.activeCalls.get(data.callId);
      //   if (call) {
      //     this.io
      //       .to(call.roomSocket)
      //       .emit('call_rejected', { callId: data.callId });
      //     this.activeCalls.delete(data.callId);
      //   }
      // });

      // // End call
      // socket.on('end_call', (data: { callId: string }) => {
      //   const call = this.activeCalls.get(data.callId);
      //   if (call) {
      //     // Notify both parties
      //     this.io
      //       .to(call.roomSocket)
      //       .emit('call_ended', { callId: data.callId });
      //     this.io
      //       .to(call.receptionistSocket)
      //       .emit('call_ended', { callId: data.callId });
      //     this.activeCalls.delete(data.callId);
      //   }
      // });

      // // WebRTC signaling
      // socket.on(
      //   'offer',
      //   (data: { offer: RTCSessionDescriptionInit; callId: string }) => {
      //     const call = this.activeCalls.get(data.callId);
      //     if (call) {
      //       const targetSocket =
      //         socket.id === call.roomSocket
      //           ? call.receptionistSocket
      //           : call.roomSocket;
      //       this.io.to(targetSocket).emit('offer', data);
      //     }
      //   },
      // );

      // socket.on(
      //   'answer',
      //   (data: { answer: RTCSessionDescriptionInit; callId: string }) => {
      //     const call = this.activeCalls.get(data.callId);
      //     if (call) {
      //       const targetSocket =
      //         socket.id === call.roomSocket
      //           ? call.receptionistSocket
      //           : call.roomSocket;
      //       this.io.to(targetSocket).emit('answer', data);
      //     }
      //   },
      // );

      // socket.on(
      //   'ice_candidate',
      //   (data: { candidate: RTCIceCandidateInit; callId: string }) => {
      //     const call = this.activeCalls.get(data.callId);
      //     if (call) {
      //       const targetSocket =
      //         socket.id === call.roomSocket
      //           ? call.receptionistSocket
      //           : call.roomSocket;
      //       this.io.to(targetSocket).emit('ice_candidate', data);
      //     }
      //   },
      // );

      // socket.on('disconnect', () => {
      //   this.logger.log(`Client disconnected: ${socket.id}`);

      //   // If receptionist disconnects
      //   if (socket.id === this.receptionistSocket) {
      //     this.receptionistSocket = null;
      //     // End all active calls
      //     for (const [callId, call] of this.activeCalls.entries()) {
      //       this.io.to(call.roomSocket).emit('call_ended', { callId });
      //     }
      //     this.activeCalls.clear();
      //   } else {
      //     // If room disconnects, end their active call
      //     for (const [callId, call] of this.activeCalls.entries()) {
      //       if (call.roomSocket === socket.id) {
      //         this.io
      //           .to(call.receptionistSocket)
      //           .emit('call_ended', { callId });
      //         this.activeCalls.delete(callId);
      //         break;
      //       }
      //     }
      //   }
      // });
    });
  }

  public getIO(): TypedServer {
    return this.io;
  }

  public getActiveCalls(): Array<{ roomNumber: string; callId: string }> {
    return Array.from(this.activeCalls.entries()).map(([callId, call]) => ({
      callId,
      roomNumber: call.roomNumber,
    }));
  }

  public isReceptionistOnline(): boolean {
    return this.receptionistSocket !== null;
  }
}

export default HotelVoIPManager;
