import { z } from 'zod';

export const SubscriptionRequestHistorySchema = z.object({
    id: z.number(),
    userUuid: z.string().uuid(),
    requestIp: z.nullable(z.string()),
    userAgent: z.nullable(z.string()),
    requestAt: z
        .string()
        .datetime()
        .transform((str) => new Date(str)),
});
