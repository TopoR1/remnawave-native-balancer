import { createZodDto } from 'nestjs-zod';

import { GetAllHwidDevicesCommand } from '@contract/commands';

export class GetAllHwidDevicesRequestQueryDto extends createZodDto(
    GetAllHwidDevicesCommand.RequestQuerySchema,
) {}

export class GetAllHwidDevicesResponseDto extends createZodDto(
    GetAllHwidDevicesCommand.ResponseSchema,
) {}
