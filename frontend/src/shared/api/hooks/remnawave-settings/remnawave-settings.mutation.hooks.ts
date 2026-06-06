import { UpdateRemnawaveSettingsCommand } from '@remnawave/backend-contract'
import { notifications } from '@mantine/notifications'
import { z } from 'zod'

import { createMutationHook } from '../../tsq-helpers'

const UpdateRemnawaveSettingsRequestSchema = UpdateRemnawaveSettingsCommand.RequestSchema.extend({
    hostBalancerGlobalEnabled: z.boolean().optional()
})

const UpdateRemnawaveSettingsResponseSchema = z.object({
    response: UpdateRemnawaveSettingsCommand.ResponseSchema.shape.response.extend({
        hostBalancerGlobalEnabled: z.boolean().default(true),
        hostBalancerEnvEnabled: z.boolean().default(false),
        hostBalancerSummary: z
            .object({
                enabledHosts: z.number().int().nonnegative().default(0),
                activeTargets: z.number().int().nonnegative().default(0),
                warnings: z.number().int().nonnegative().default(0),
                errors: z.number().int().nonnegative().default(0)
            })
            .default({
                enabledHosts: 0,
                activeTargets: 0,
                warnings: 0,
                errors: 0
            })
    })
})

export const useUpdateRemnawaveSettings = createMutationHook({
    endpoint: UpdateRemnawaveSettingsCommand.TSQ_url,
    bodySchema: UpdateRemnawaveSettingsRequestSchema,
    responseSchema: UpdateRemnawaveSettingsResponseSchema,
    requestMethod: UpdateRemnawaveSettingsCommand.endpointDetails.REQUEST_METHOD,
    rMutationParams: {
        onSuccess: () => {
            notifications.show({
                title: 'Success',
                message: 'Remnawave settings updated successfully',
                color: 'teal'
            })
        }
    }
})
