import { createZodDto } from 'nestjs-zod';

import { DeleteAllUserHwidDevicesCommand } from '@contract/commands';

export class DeleteAllUserHwidDevicesRequestDto extends createZodDto(
    DeleteAllUserHwidDevicesCommand.RequestSchema,
) {}

export class DeleteAllUserHwidDevicesResponseDto extends createZodDto(
    DeleteAllUserHwidDevicesCommand.ResponseSchema,
) {}
