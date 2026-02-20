import { ServiceUnavailableException } from '@nestjs/common';
import { HealthService } from '../../src/health/health.service';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('HealthService', () => {
  it('returns an up status when database check succeeds', async () => {
    const prismaService = {
      $queryRawUnsafe: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    } as unknown as PrismaService;

    const service = new HealthService(prismaService);
    const health = await service.getHealth();

    expect(prismaService.$queryRawUnsafe).toHaveBeenCalledWith('SELECT 1');
    expect(health.status).toBe('ok');
    expect(health.database).toBe('up');
    expect(health.service).toBe('api');
  });

  it('throws ServiceUnavailableException when database check fails', async () => {
    const prismaService = {
      $queryRawUnsafe: jest.fn().mockRejectedValue(new Error('db down')),
    } as unknown as PrismaService;

    const service = new HealthService(prismaService);

    await expect(service.getHealth()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});

