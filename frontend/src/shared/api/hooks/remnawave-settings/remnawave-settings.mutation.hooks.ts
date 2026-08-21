import { notifications } from '@mantine/notifications'
import { UpdateRemnawaveSettingsCommand } from '@remnawave/backend-contract'
import { z } from 'zod'

import { createMutationHook } from '../../tsq-helpers'

const UpdateRemnawaveSettingsRequestBodySchema =
    UpdateRemnawaveSettingsCommand.RequestBodySchema.extend({
        hostBalancerGlobalEnabled: z.boolean().optional()
    })

export const useUpdateRemnawaveSettings = createMutationHook({
    endpoint: UpdateRemnawaveSettingsCommand.TSQ_url,
    bodySchema: UpdateRemnawaveSettingsRequestBodySchema,
    responseSchema: UpdateRemnawaveSettingsCommand.ResponseSchema,
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
