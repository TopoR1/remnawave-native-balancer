import type { HostBalancingDraft } from '../host-balancing-draft'
import type { FormEvent } from 'react'

import { UseFormReturnType } from '@mantine/form'
import {
    CreateHostCommand,
    GetHostsTagsCommand,
    GetNodesCommand,
    GetConfigProfilesCommand,
    GetInternalSquadsCommand,
    GetSubscriptionTemplatesCommand,
    UpdateHostCommand,
    UpdateManyHostsCommand
} from '@remnawave/backend-contract'

import type { HostBalancerTargetsValidation } from '@shared/api/hooks'

export interface IProps<
    T extends
        | CreateHostCommand.RequestBody
        | UpdateHostCommand.RequestBody
        | UpdateManyHostsCommand.RequestBody
> {
    advancedOpened: boolean
    configProfiles: GetConfigProfilesCommand.Response['response']['configProfiles']
    form: UseFormReturnType<T>
    handleSubmit: (event?: FormEvent<HTMLFormElement>) => void
    hostTags: GetHostsTagsCommand.Response['response']['tags']
    internalSquads: GetInternalSquadsCommand.Response['response']['internalSquads']
    isSubmitting: boolean
    nodes: GetNodesCommand.Response['response']
    removeRequiredFields?: boolean
    setAdvancedOpened: (value: boolean) => void
    subscriptionTemplates: GetSubscriptionTemplatesCommand.Response['response']['templates']
    hostUuid?: string
    hostBalancingDraft?: HostBalancingDraft
    onHostBalancingDraftChange?: (draft: HostBalancingDraft) => void
    onHostBalancingValidationChange?: (validation: HostBalancerTargetsValidation | null) => void
}
