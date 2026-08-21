import type { HostBalancingDraft } from './host-balancing-draft.ts'

import { sanitizeHostBalancingDraft } from './host-balancing-draft.ts'

type SaveHostBalancingDraftParams = {
    draft: HostBalancingDraft
    hostUuid: string
    notifySuccess: () => void
    refetchSettings: (hostUuid: string) => Promise<unknown>
    setDraft: (draft: HostBalancingDraft) => void
    updateSettings: (params: {
        route: { hostUuid: string }
        variables: ReturnType<typeof sanitizeHostBalancingDraft>['settings']
    }) => Promise<unknown>
    updateTargets: (params: {
        route: { hostUuid: string }
        variables: { targets: ReturnType<typeof sanitizeHostBalancingDraft>['targets'] }
    }) => Promise<unknown>
}

export async function saveHostBalancingDraft({
    draft,
    hostUuid,
    notifySuccess,
    refetchSettings,
    setDraft,
    updateSettings,
    updateTargets
}: SaveHostBalancingDraftParams) {
    if (!draft.touched) {
        return false
    }

    const { settings, targets } = sanitizeHostBalancingDraft(draft)

    await updateSettings({
        route: { hostUuid },
        variables: settings
    })
    await updateTargets({
        route: { hostUuid },
        variables: { targets }
    })
    await refetchSettings(hostUuid)
    setDraft({
        ...draft,
        touched: false
    })
    notifySuccess()

    return true
}
