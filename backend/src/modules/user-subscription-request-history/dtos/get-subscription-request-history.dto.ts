import { createZodDto } from 'nestjs-zod';

import { GetSubscriptionRequestHistoryCommand } from '@contract/commands';

export class GetSubscriptionRequestHistoryRequestQueryDto extends createZodDto(
    GetSubscriptionRequestHistoryCommand.RequestQuerySchema,
) {}

export class GetSubscriptionRequestHistoryResponseDto extends createZodDto(
    GetSubscriptionRequestHistoryCommand.ResponseSchema,
) {}
