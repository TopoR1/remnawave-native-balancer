import { createZodDto } from 'nestjs-zod';

import { RestartAllNodesCommand } from '@contract/commands';

export class RestartAllNodesResponseDto extends createZodDto(
    RestartAllNodesCommand.ResponseSchema,
) {}

export class RestartAllNodesRequestBodyDto extends createZodDto(
    RestartAllNodesCommand.RequestBodySchema,
) {}
