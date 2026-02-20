import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class HealthService {
  constructor(private readonly prismaService: PrismaService) {}

  async getHealth(): Promise<{ status: string; service: string; database: string; timestamp: string }> {
    try {
      await this.prismaService.$queryRawUnsafe('SELECT 1');
    } catch {
      throw new ServiceUnavailableException({
        code: 'DEPENDENCY_UNAVAILABLE',
        message: 'Database is unavailable',
      });
    }

    return {
      status: 'ok',
      service: 'api',
      database: 'up',
      timestamp: new Date().toISOString(),
    };
  }
}

