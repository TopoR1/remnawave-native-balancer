import type {
    HostBalancer,
    HostBalancerStrategy,
    HostBalancerTargetInput,
    HostBalancerTrafficMetric,
    HostBalancerUnavailablePolicy
} from '@shared/api/hooks'

export type DraftTarget = HostBalancerTargetInput & {
    localId: string
    assignments?: number
    trafficBytes?: string | null
}

export type HostBalancingDraft = {
    enabled: boolean
    strategy: HostBalancerStrategy
    stickyEnabled: boolean
    rebalanceExistingAssignmentsByTraffic: boolean
    unavailablePolicy: HostBalancerUnavailablePolicy
    trafficMetric: HostBalancerTrafficMetric | null
    targets: DraftTarget[]
    touched: boolean
}

export const DEFAULT_HOST_BALANCING_DRAFT: HostBalancingDraft = {
    enabled: false,
    strategy: 'LEAST_ASSIGNED',
    stickyEnabled: true,
    rebalanceExistingAssignmentsByTraffic: false,
    unavailablePolicy: 'HIDE_HOST',
    trafficMetric: 'CURRENT_PERIOD',
    targets: [],
    touched: false
}

const TRAFFIC_STRATEGIES: HostBalancerStrategy[] = ['LEAST_TRAFFIC', 'WEIGHTED_LEAST_TRAFFIC']

export function shouldEnableHostSave(hostFormChanged: boolean, hostBalancingTouched: boolean) {
    return hostFormChanged || hostBalancingTouched
}

export function patchHostBalancingDraft(
    draft: HostBalancingDraft,
    patch: Partial<HostBalancingDraft>
): HostBalancingDraft {
    return {
        ...draft,
        ...patch,
        touched: true
    }
}

export function updateHostBalancingTarget(
    draft: HostBalancingDraft,
    localId: string,
    patch: Partial<DraftTarget>
): HostBalancingDraft {
    return patchHostBalancingDraft(draft, {
        targets: draft.targets.map((target) =>
            target.localId === localId ? { ...target, ...patch } : target
        )
    })
}

export function hostBalancerToDraft(settings: HostBalancer | null): HostBalancingDraft {
    if (!settings) {
        return DEFAULT_HOST_BALANCING_DRAFT
    }

    return {
        enabled: settings.enabled,
        strategy: settings.strategy,
        stickyEnabled: settings.stickyEnabled,
        rebalanceExistingAssignmentsByTraffic: settings.rebalanceExistingAssignmentsByTraffic,
        unavailablePolicy: settings.unavailablePolicy,
        trafficMetric: settings.trafficMetric ?? 'CURRENT_PERIOD',
        targets:
            settings.targets?.map((target) => ({
                uuid: target.uuid,
                localId: target.uuid,
                nodeUuid: target.nodeUuid,
                enabled: target.enabled,
                status: target.status,
                weight: target.weight,
                priority: target.priority,
                maxAssignedUsers: target.maxAssignedUsers,
                overrideAddress: target.overrideAddress,
                overridePort: target.overridePort,
                overrideSni: target.overrideSni,
                overrideHost: target.overrideHost,
                overridePath: target.overridePath
            })) ?? [],
        touched: false
    }
}

export function sanitizeHostBalancingDraft(draft: HostBalancingDraft): {
    settings: Omit<HostBalancingDraft, 'targets' | 'touched'>
    targets: HostBalancerTargetInput[]
} {
    return {
        settings: {
            enabled: draft.enabled,
            strategy: draft.strategy,
            stickyEnabled: draft.stickyEnabled,
            rebalanceExistingAssignmentsByTraffic: draft.rebalanceExistingAssignmentsByTraffic,
            unavailablePolicy: draft.unavailablePolicy,
            trafficMetric: TRAFFIC_STRATEGIES.includes(draft.strategy)
                ? (draft.trafficMetric ?? 'CURRENT_PERIOD')
                : null
        },
        targets: draft.targets.map((target) => ({
            localId: target.localId,
            uuid: target.uuid,
            nodeUuid: target.nodeUuid || null,
            enabled: target.enabled ?? true,
            status: target.status ?? 'ACTIVE',
            weight: target.weight ?? 1,
            priority: target.priority ?? 100,
            maxAssignedUsers: target.maxAssignedUsers ?? null,
            overrideAddress: emptyToNull(target.overrideAddress),
            overridePort: target.overridePort ?? null,
            overrideSni: emptyToNull(target.overrideSni),
            overrideHost: emptyToNull(target.overrideHost),
            overridePath: emptyToNull(target.overridePath)
        }))
    }
}

function emptyToNull(value?: string | null) {
    return value && value.trim().length > 0 ? value : null
}
