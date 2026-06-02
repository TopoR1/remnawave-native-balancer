import { z } from 'zod';

export const InfraProviderSchema = z.object({
    uuid: z.string().uuid(),
    name: z.string(),
    faviconLink: z.nullable(z.string()),
    loginUrl: z.nullable(z.string()),

    createdAt: z
        .string()
        .datetime()
        .transform((str) => new Date(str)),
    updatedAt: z
        .string()
        .datetime()
        .transform((str) => new Date(str)),

    billingHistory: z.object({
        totalAmount: z.number(),
        totalBills: z.number(),
    }),
    billingNodes: z.array(
        z.object({
            nodeUuid: z.string().uuid(),
            name: z.string(),
            countryCode: z.string(),
        }),
    ),
});

export const PartialInfraProviderSchema = z.object({
    uuid: z.string().uuid(),
    name: z.string(),
    faviconLink: z.nullable(z.string()),
    loginUrl: z.nullable(z.string()),

    createdAt: z
        .string()
        .datetime()
        .transform((str) => new Date(str)),
    updatedAt: z
        .string()
        .datetime()
        .transform((str) => new Date(str)),
});
