import {
  DefaultEventsMap,
  Server as IOServer,
  Socket as IOSocket,
} from 'socket.io';
import { createServer } from 'http';
import type { Server as HttpServer } from 'http';
import { Logger } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs';
import { ReceptionistDataDTO } from '../dto/receptionist.dto';
import { RoomDataDTO } from '../dto';
import { GuestDataDTO } from '../dto/guest.dto';

type TypedSocket = IOSocket<DefaultEventsMap>;
type TypedServer = IOServer<DefaultEventsMap>;
type CallbackResponse = {
  name: string;
  status: string;
  message: string;
  socket?: { id: string; user: string; type: 'guest' | 'receptionist' };
};

export class HotelVoIPManager {
  private readonly logger: Logger = new Logger(HotelVoIPManager.name);

  private io: TypedServer;
  // private receptionistSocket: Record<
  //   string,
  //   { socket_id: string; type: 'guest' | 'receptionist' }
  // > = {};
  // private guestSocket: Record<
  //   string,
  //   { socket_id: string; type: 'guest' | 'receptionist' }
  // > = {};
  private callDeviceSocket: Record<
    string,
    { socket_id: string; type: 'guest' | 'receptionist'; name: string }
  > = {};
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

      socket.on(
        'register',
        (
          slug: string,
          type: 'receptionist' | 'guest',
          callback?: (response: CallbackResponse) => void,
        ) => {
          this.logger.log(
            `Device registered: ${slug} with socket ${socket.id}`,
          );

          if (type === 'receptionist') {
            const receptionistsPath = path.join(
              __dirname,
              '../../../database/receptionist.json',
            );

            const receptionists = JSON.parse(
              fs.readFileSync(receptionistsPath, 'utf-8'),
            ) as Array<ReceptionistDataDTO>;

            const receptionistIndex = receptionists.findIndex(
              (r) => r.slug === slug,
            );

            if (receptionistIndex !== -1) {
              receptionists[receptionistIndex] = {
                ...receptionists[receptionistIndex],
                socket: socket.id,
                updatedAt: new Date().toISOString(),
              };

              fs.writeFileSync(
                receptionistsPath,
                JSON.stringify(receptionists, null, 2),
                'utf-8',
              );

              this.callDeviceSocket[slug] = {
                name: receptionists[receptionistIndex].name,
                type: type,
                socket_id: socket.id,
              };
            } else {
              this.logger.debug(`Receptionist with slug ${slug} not found`);
            }
          } else {
            const guestPath = path.join(
              __dirname,
              '../../../database/guest.json',
            );

            const guests = JSON.parse(
              fs.readFileSync(guestPath, 'utf-8'),
            ) as Array<GuestDataDTO>;

            const guestIndex = guests.findIndex((r) => r.slug === slug);

            if (guestIndex !== -1) {
              guests[guestIndex] = {
                ...guests[guestIndex],
                socket: socket.id,
                updatedAt: new Date().toISOString(),
              };

              fs.writeFileSync(
                guestPath,
                JSON.stringify(guests, null, 2),
                'utf-8',
              );

              this.callDeviceSocket[slug] = {
                name: guests[guestIndex].room,
                socket_id: socket.id,
                type: type,
              };
            } else {
              const roomsPath = path.join(
                __dirname,
                '../../../database/rooms.json',
              );

              const rooms = JSON.parse(
                fs.readFileSync(roomsPath, 'utf-8'),
              ) as Array<RoomDataDTO>;

              const roomIndex = rooms.findIndex((r) => r.slug === slug);
              if (roomIndex !== -1) {
                this.callDeviceSocket[slug] = {
                  name: rooms[roomIndex].name,
                  socket_id: socket.id,
                  type: type,
                };

                const newGuest = [
                  ...guests,
                  {
                    room: rooms[roomIndex].name,
                    socket: socket.id,
                    slug: slug,
                  },
                ];

                fs.writeFileSync(
                  guestPath,
                  JSON.stringify(newGuest, null, 2),
                  'utf-8',
                );
              }
            }
          }

          if (callback) {
            callback({
              name: 'register',
              status: 'REGISTERED',
              message: `Successfully registered as ${slug}`,
              socket: {
                id: socket.id,
                user: slug,
                type: type,
              },
            });
          }
        },
      );

      socket.on(
        'call:initiate',
        (data: { to: string; type: 'receptionist' | 'guest' }) => {
          const targetSocketKey = Object.keys(this.callDeviceSocket).find(
            (key) =>
              key === data.to && this.callDeviceSocket[key].type === data.type,
          );

          const targetSocket = targetSocketKey
            ? this.callDeviceSocket[targetSocketKey]
            : undefined;

          const fromSocketKey = Object.keys(this.callDeviceSocket).find(
            (key) => this.callDeviceSocket[key].socket_id === socket.id,
          );

          const fromSocket = fromSocketKey
            ? this.callDeviceSocket[fromSocketKey]
            : undefined;

          if (targetSocket && fromSocket) {
            this.io.to(targetSocket.socket_id).emit('call:initiate', {
              message: `Incoming Call From ${fromSocket.name}`,
              status: 'initiate',
              from: fromSocket,
              to: targetSocket,
              type: targetSocket.type,
            });
            this.logger.log(
              `Call initiated from ${fromSocket.name} to ${targetSocket.name}`,
            );
          } else {
            socket.emit('call_error', { message: 'User not available' });
            this.logger.warn(`Call offer failed: User not available`);
          }
        },
      );

      socket.on(
        'call:offer',
        (data: { to: string; offer: RTCSessionDescriptionInit }) => {
          const targetSocketKey = Object.keys(this.callDeviceSocket).find(
            (key) => this.callDeviceSocket[key].socket_id === data.to,
          );

          const targetSocket = targetSocketKey
            ? this.callDeviceSocket[targetSocketKey]
            : undefined;

          const fromSocketKey = Object.keys(this.callDeviceSocket).find(
            (key) => this.callDeviceSocket[key].socket_id === socket.id,
          );

          const fromSocket = fromSocketKey
            ? this.callDeviceSocket[fromSocketKey]
            : undefined;

          if (targetSocket && fromSocket && data.offer) {
            this.io.to(targetSocket.socket_id).emit('call:offer', {
              message: null,
              status: 'offer',
              from: fromSocket,
              to: targetSocket,
              type: targetSocket.type,
              offer: data.offer,
            });
            this.logger.log(`Call Accepted by ${fromSocket.name} `);
          } else {
            socket.emit('call_error', { message: 'User not available' });
            this.logger.warn(`Call accepted failed: User not available`);
          }
        },
      );

      socket.on('call:reject', (data: { to: string }) => {
        const targetSocketKey = Object.keys(this.callDeviceSocket).find(
          (key) => this.callDeviceSocket[key].socket_id === data.to,
        );

        const targetSocket = targetSocketKey
          ? this.callDeviceSocket[targetSocketKey]
          : undefined;

        const fromSocketKey = Object.keys(this.callDeviceSocket).find(
          (key) => this.callDeviceSocket[key].socket_id === socket.id,
        );

        const fromSocket = fromSocketKey
          ? this.callDeviceSocket[fromSocketKey]
          : undefined;

        if (targetSocket && fromSocket) {
          this.io.to(targetSocket.socket_id).emit('call:reject', {
            message: `Call Rejected by ${fromSocket.name}`,
            status: 'reject',
            from: fromSocket,
            to: targetSocket,
            type: targetSocket.type,
          });
          this.logger.log(`Call Rejected by ${fromSocket.name} `);
        } else {
          socket.emit('call_error', { message: 'User not available' });
          this.logger.warn(`Call reject failed: User not available`);
        }
      });

      socket.on(
        'call:stop',
        (data: { to: string; type: 'receptionist' | 'guest' }) => {
          const targetSocketKey = Object.keys(this.callDeviceSocket).find(
            (key) =>
              key === data.to && this.callDeviceSocket[key].type === data.type,
          );

          const targetSocket = targetSocketKey
            ? this.callDeviceSocket[targetSocketKey]
            : undefined;

          const fromSocketKey = Object.keys(this.callDeviceSocket).find(
            (key) => this.callDeviceSocket[key].socket_id === socket.id,
          );

          const fromSocket = fromSocketKey
            ? this.callDeviceSocket[fromSocketKey]
            : undefined;

          if (targetSocket && fromSocket) {
            this.io.to(targetSocket.socket_id).emit('call:stop', {
              message: `Call Stopped by ${fromSocket.name}`,
              status: 'stop',
              from: fromSocket,
              to: targetSocket,
              type: targetSocket.type,
            });
            this.logger.log(`Call Stopped by ${fromSocket.name} `);
          } else {
            socket.emit('call_error', { message: 'User not available' });
            this.logger.warn(`Call stop failed: User not available`);
          }
        },
      );

      socket.on(
        'call:end',
        (data: { to: string; type: 'receptionist' | 'guest' }) => {
          const targetSocketKey = Object.keys(this.callDeviceSocket).find(
            (key) => this.callDeviceSocket[key].socket_id === data.to,
          );

          const targetSocket = targetSocketKey
            ? this.callDeviceSocket[targetSocketKey]
            : undefined;

          const fromSocketKey = Object.keys(this.callDeviceSocket).find(
            (key) => this.callDeviceSocket[key].socket_id === socket.id,
          );

          const fromSocket = fromSocketKey
            ? this.callDeviceSocket[fromSocketKey]
            : undefined;

          if (targetSocket && fromSocket) {
            this.io.to(targetSocket.socket_id).emit('call:end', {
              message: `Call Ended by ${fromSocket.name}`,
              status: 'end',
              from: fromSocket,
              to: targetSocket,
              type: targetSocket.type,
            });
            this.logger.log(`Call Ended by ${fromSocket.name} `);
          } else {
            socket.emit('call_error', { message: 'User not available' });
            this.logger.warn(`Call end failed: User not available`);
          }
        },
      );

      socket.on(
        'call:answer',
        (data: { to: string; answer: RTCSessionDescriptionInit }) => {
          console.log('Call accept data:', data.to, data.answer);

          const targetSocketKey = Object.keys(this.callDeviceSocket).find(
            (key) => this.callDeviceSocket[key].socket_id === data.to,
          );

          const targetSocket = targetSocketKey
            ? this.callDeviceSocket[targetSocketKey]
            : undefined;

          const fromSocketKey = Object.keys(this.callDeviceSocket).find(
            (key) => this.callDeviceSocket[key].socket_id === socket.id,
          );

          const fromSocket = fromSocketKey
            ? this.callDeviceSocket[fromSocketKey]
            : undefined;

          if (targetSocket && fromSocket) {
            this.io.to(targetSocket.socket_id).emit('call:answer', {
              from: fromSocket.socket_id,
              answer: data.answer,
              status: 'offer',
            });
            this.logger.log(`Call answered ${targetSocket.name}`);
          }
        },
      );

      // socket.on(
      //   'makeCall',
      //   ({
      //     from,
      //     from_type,
      //     to,
      //     to_type,
      //     offer,
      //     callback,
      //   }: {
      //     from: string;
      //     from_type: 'receptionist' | 'guest';
      //     to: string;
      //     to_type: 'receptionist' | 'guest';
      //     offer: RTCSessionDescriptionInit;
      //     callback?: (response: CallbackResponse) => void;
      //   }) => {
      //     const targetSocketKey = Object.keys(this.callDeviceSocket).find(
      //       (key) => key === to && this.callDeviceSocket[key].type === to_type,
      //     );

      //     const targetSocket = targetSocketKey
      //       ? this.callDeviceSocket[targetSocketKey]
      //       : undefined;

      //     const fromSocketKey = Object.keys(this.callDeviceSocket).find(
      //       (key) =>
      //         key === from && this.callDeviceSocket[key].type === from_type,
      //     );

      //     const fromSocket = fromSocketKey
      //       ? this.callDeviceSocket[fromSocketKey]
      //       : undefined;

      //     if (targetSocket && fromSocket) {
      //       this.io.to(targetSocket.socket_id).emit('incomingCall', {
      //         status: 'INCOMING_CALL',
      //         from: fromSocket.socket_id,
      //         offer,
      //       });
      //       this.logger.log(`Call initiated from ${from} to ${to}`);
      //     } else {
      //       socket.emit('call_error', { message: 'User not available' });
      //       this.logger.warn(
      //         `Call from ${from} to ${to} failed: User not available`,
      //       );
      //     }

      //     if (callback) {
      //       callback({
      //         name: 'call',
      //         status: 'CALL_REQUESTED',
      //         message: 'Call request processed',
      //       });
      //     }
      //   },
      // );

      // socket.on(
      //   'incomingCallAnswered',
      //   ({
      //     from,
      //     from_type,
      //     to,
      //     to_type,
      //     offer,
      //     callback,
      //   }: {
      //     from: string;
      //     from_type: 'receptionist' | 'guest';
      //     to: string;
      //     to_type: 'receptionist' | 'guest';
      //     offer: RTCSessionDescriptionInit;
      //     callback?: (response: CallbackResponse) => void;
      //   }) => {
      //     const targetSocketKey = Object.keys(this.callDeviceSocket).find(
      //       (key) => key === to && this.callDeviceSocket[key].type === to_type,
      //     );

      //     const targetSocket = targetSocketKey
      //       ? this.callDeviceSocket[targetSocketKey]
      //       : undefined;

      //     const fromSocketKey = Object.keys(this.callDeviceSocket).find(
      //       (key) =>
      //         key === from && this.callDeviceSocket[key].type === from_type,
      //     );

      //     const fromSocket = fromSocketKey
      //       ? this.callDeviceSocket[fromSocketKey]
      //       : undefined;

      //     if (targetSocket && fromSocket) {
      //       this.io.to(targetSocket.socket_id).emit('incomingCallAnswered', {
      //         status: 'INCOMING_CALL',
      //         from: fromSocket.socket_id,
      //         offer,
      //       });
      //       this.logger.log(`Call initiated from ${from} to ${to}`);
      //     } else {
      //       socket.emit('call_error', { message: 'User not available' });
      //       this.logger.warn(
      //         `Call from ${from} to ${to} failed: User not available`,
      //       );
      //     }

      //     if (callback) {
      //       callback({
      //         name: 'call',
      //         status: 'INCOMING_CALL_ANSWERED',
      //         message: 'Call request processed',
      //       });
      //     }
      //   },
      // );

      // socket.on(
      //   'declineCall',
      //   (
      //     data: { to: string; reason?: string },
      //     callback?: (response: CallbackResponse) => void,
      //   ) => {
      //     console.log('Call declined:', data);
      //     const targetSocketKey = Object.keys(this.callDeviceSocket).find(
      //       (key) => this.callDeviceSocket[key].socket_id === data.to,
      //     );

      //     const targetSocket = targetSocketKey
      //       ? this.callDeviceSocket[targetSocketKey]
      //       : undefined;

      //     const fromSocketKey = Object.keys(this.callDeviceSocket).find(
      //       (key) => this.callDeviceSocket[key].socket_id === socket.id,
      //     );

      //     const fromSocket = fromSocketKey
      //       ? this.callDeviceSocket[fromSocketKey]
      //       : undefined;

      //     if (targetSocket && fromSocket) {
      //       this.io.to(targetSocket.socket_id).emit('callDeclined', {
      //         from: fromSocket.socket_id,
      //         reason: data.reason || 'Call declined',
      //       });
      //       this.logger.log(`Call declined by ${fromSocketKey}`);
      //     }

      //     if (callback) {
      //       callback({
      //         name: 'declineCall',
      //         status: 'CALL_DECLINED',
      //         message: 'Call decline processed',
      //       });
      //     }
      //   },
      // );

      socket.on(
        'call:candidate',
        (data: { to: string; candidate: RTCIceCandidateInit }) => {
          const targetSocketKey = Object.keys(this.callDeviceSocket).find(
            (key) => this.callDeviceSocket[key].socket_id === data.to,
          );

          const targetSocket = targetSocketKey
            ? this.callDeviceSocket[targetSocketKey]
            : undefined;

          const fromSocketKey = Object.keys(this.callDeviceSocket).find(
            (key) => this.callDeviceSocket[key].socket_id === socket.id,
          );

          const fromSocket = fromSocketKey
            ? this.callDeviceSocket[fromSocketKey]
            : undefined;

          if (targetSocket && fromSocket) {
            this.io.to(targetSocket.socket_id).emit('call:candidate', {
              from: fromSocket.socket_id,
              candidate: data.candidate,
            });
            this.logger.log(`ICE candidate sent `);
          }
        },
      );

      socket.on('disconnect', () => {
        this.logger.log(`Client disconnected: ${socket.id}`);
        for (const [user, data] of Object.entries(this.callDeviceSocket)) {
          if (data.socket_id === socket.id) {
            if (data.type === 'receptionist') {
              const receptionistsPath = path.join(
                __dirname,
                '../../../database/receptionist.json',
              );

              const receptionists = JSON.parse(
                fs.readFileSync(receptionistsPath, 'utf-8'),
              ) as Array<ReceptionistDataDTO>;

              const receptionistIndex = receptionists.findIndex(
                (r) => r.socket === socket.id,
              );

              if (receptionistIndex !== -1) {
                receptionists[receptionistIndex] = {
                  ...receptionists[receptionistIndex],
                  socket: '',
                  updatedAt: new Date().toISOString(),
                };

                fs.writeFileSync(
                  receptionistsPath,
                  JSON.stringify(receptionists, null, 2),
                  'utf-8',
                );
              }
            }

            delete this.callDeviceSocket[user];
          }
        }
      });
    });
  }

  public getIO(): TypedServer {
    return this.io;
  }

  // public getActiveCalls(): Array<{ roomNumber: string; callId: string }> {
  //   return Array.from(this.activeCalls.entries()).map(([callId, call]) => ({
  //     callId,
  //     roomNumber: call.roomNumber,
  //   }));
  // }

  // public isReceptionistOnline(): boolean {
  //   return this.receptionistSocket !== null;
  // }
}

export default HotelVoIPManager;
