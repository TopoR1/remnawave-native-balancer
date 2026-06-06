type DecisionTarget = {
    targetUuid: string
    nodeName?: string | null
    countryEmoji?: string | null
    address?: string | null
    nodeAddress?: string | null
    port?: number | null
    reason?: string
}

type DecisionDisplay = {
    targetUuid?: string | null
    selectedTarget?: DecisionTarget | null
    finalHostOverrides?: {
        address: string
        port: number
    } | null
    candidates?: unknown
    excludedTargets?: unknown
}

export function decisionSelectedTargetLabel(decision: DecisionDisplay) {
    const label =
        decision.selectedTarget?.nodeName ??
        decision.selectedTarget?.nodeAddress ??
        decision.selectedTarget?.address ??
        '-'

    return decision.selectedTarget?.countryEmoji && label !== '-'
        ? `${decision.selectedTarget.countryEmoji} ${label}`
        : label
}

export function decisionTargetAddressPort(target?: DecisionTarget | null) {
    if (!target) {
        return '-'
    }

    const address = target.address ?? target.nodeAddress ?? '-'
    const port = target.port ?? '-'

    return `${address}:${port}`
}

export function decisionFinalAddress(decision: DecisionDisplay) {
    return decision.finalHostOverrides
        ? `${decision.finalHostOverrides.address}:${decision.finalHostOverrides.port}`
        : '-'
}

export function decisionCandidatesCount(decision: DecisionDisplay) {
    return Array.isArray(decision.candidates) ? decision.candidates.length : 0
}

export function decisionExcludedCount(decision: DecisionDisplay) {
    return Array.isArray(decision.excludedTargets) ? decision.excludedTargets.length : 0
}

export function decisionReasonTranslation(
    message: string,
    translate: (key: string, values?: Record<string, string>) => string,
    translateStrategy: (strategy: string) => string,
    translateAction: (action: string) => string
) {
    const selected = message.match(/^selected:([A-Z_]+):([a-z_]+)$/)
    if (selected) {
        const strategy = translateStrategy(selected[1])
        const action = selected[2]

        if (action === 'reused') {
            return translate('base-host-form.decision-reason-selected-reused')
        }
        if (action === 'created') {
            return translate('base-host-form.decision-reason-selected-created', { strategy })
        }
        if (action === 'reassigned') {
            return translate('base-host-form.decision-reason-selected-reassigned', { strategy })
        }

        return translate('base-host-form.decision-reason-selected', {
            action: translateAction(action),
            strategy
        })
    }

    const decisionKeys = {
        'target node lacks required inbound': 'base-host-form.decision-reason-missing-inbound',
        'target disabled': 'base-host-form.decision-reason-target-disabled',
        'target status DISABLED': 'base-host-form.decision-reason-target-disabled',
        'target node disconnected': 'base-host-form.decision-reason-node-disconnected',
        'node disconnected': 'base-host-form.decision-reason-node-disconnected',
        'target draining': 'base-host-form.diagnostic-target-draining',
        'target node disabled': 'base-host-form.diagnostic-target-node-disabled',
        'target node not found': 'base-host-form.diagnostic-target-node-not-found'
    } as const

    const key = decisionKeys[message as keyof typeof decisionKeys]
    return key ? translate(key) : message
}
