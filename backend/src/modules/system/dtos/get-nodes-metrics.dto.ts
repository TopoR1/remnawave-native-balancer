import { createZodDto } from 'nestjs-zod';

import { GetNodesMetricsCommand } from '@contract/commands';

export class GetNodesMetricsResponseDto extends createZodDto(
    GetNodesMetricsCommand.ResponseSchema,
) {}
