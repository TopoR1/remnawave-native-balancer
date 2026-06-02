import {
    CreateHostCommand,
    GetAllNodesCommand,
    GetConfigProfilesCommand,
    GetInternalSquadsCommand,
    GetSubscriptionTemplatesCommand,
    UpdateHostCommand
} from '@remnawave/backend-contract'
import { UseFormReturnType } from '@mantine/form'

import { HostBalancingDraft } from '../host-balancing-form'

export interface IProps<T extends CreateHostCommand.Request | UpdateHostCommand.Request> {
    advancedOpened: boolean
    configProfiles: GetConfigProfilesCommand.Response['response']['configProfiles']
    form: UseFormReturnType<T>
    hostBalancingDraft: HostBalancingDraft
    hostUuid?: string
    handleCloneHost?: () => void
    handleSubmit: () => void
    internalSquads: GetInternalSquadsCommand.Response['response']['internalSquads']
    isSubmitting: boolean
    nodes: GetAllNodesCommand.Response['response']
    onHostBalancingDraftChange: (draft: HostBalancingDraft) => void
    setAdvancedOpened: (value: boolean) => void
    subscriptionTemplates: GetSubscriptionTemplatesCommand.Response['response']['templates']
}
