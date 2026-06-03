import { GetRemnawaveSettingsCommand } from '@remnawave/backend-contract'
import { createQueryKeys } from '@lukemorales/query-key-factory'
import { z } from 'zod'

import { sToMs } from '@shared/utils/time-utils'

import { createGetQueryHook, errorHandler } from '../../tsq-helpers'

const RemnawaveSettingsResponseSchema = z.object({
    response: GetRemnawaveSettingsCommand.ResponseSchema.shape.response.extend({
        hostBalancerGlobalEnabled: z.boolean().default(true),
        hostBalancerEnvEnabled: z.boolean().default(false)
    })
})

export type RemnawaveSettings = z.infer<typeof RemnawaveSettingsResponseSchema>['response']

export const remnawaveSettingsQueryKeys = createQueryKeys('remnawaveSettings', {
    getRemnawaveSettings: {
        queryKey: null
    }
})

export const useGetRemnawaveSettings = createGetQueryHook({
    endpoint: GetRemnawaveSettingsCommand.TSQ_url,
    responseSchema: RemnawaveSettingsResponseSchema,
    getQueryKey: () => remnawaveSettingsQueryKeys.getRemnawaveSettings.queryKey,
    rQueryParams: {
        refetchOnMount: false,
        staleTime: sToMs(30)
    },
    errorHandler: (error) => errorHandler(error, 'Get Remnawave Settings')
})
