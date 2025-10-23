export class RoomDataDTO {
  id: number;
  name: string;
  slug: string;
  floor: number;
  status: 'AVAILABLE' | 'OCCUPIED' | 'CLEANING' | 'MAINTENANCE';
  fingerprint: string;
}
