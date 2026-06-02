import { createZodDto } from 'nestjs-zod';

import { GetSubscriptionRequestHistoryStatsCommand } from '@contract/commands';

export class GetSubscriptionRequestHistoryStatsResponseDto extends createZodDto(
    GetSubscriptionRequestHistoryStatsCommand.ResponseSchema,
) {}
