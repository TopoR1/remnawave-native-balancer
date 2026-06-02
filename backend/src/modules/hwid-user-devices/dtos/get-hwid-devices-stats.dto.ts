import { createZodDto } from 'nestjs-zod';

import { GetHwidDevicesStatsCommand } from '@contract/commands';

export class GetHwidDevicesStatsResponseDto extends createZodDto(
    GetHwidDevicesStatsCommand.ResponseSchema,
) {}
