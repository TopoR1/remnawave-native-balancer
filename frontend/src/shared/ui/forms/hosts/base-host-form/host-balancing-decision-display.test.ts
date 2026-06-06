import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
    decisionCandidatesCount,
    decisionExcludedCount,
    decisionFinalAddress,
    decisionReasonTranslation,
    decisionSelectedTargetLabel,
    decisionTargetAddressPort
} from './host-balancing-decision-display.ts'

const translations = {
    'base-host-form.decision-reason-missing-inbound':
        'На ноде нет inbound, который использует этот Host',
    'base-host-form.decision-reason-selected-created': 'Создано назначение: {{strategy}}',
    'base-host-form.decision-reason-selected-reused': 'Использовано существующее назначение'
}

function t(key: string, values?: Record<string, string>) {
    const template = translations[key as keyof typeof translations] ?? key

    return Object.entries(values ?? {}).reduce(
        (result, [name, value]) => result.replace(`{{${name}}}`, value),
        template
    )
}

describe('host balancing decision display', () => {
    it('renders selected target label and subscription address', () => {
        const decision = {
            targetUuid: 'target-uuid',
            selectedTarget: {
                targetUuid: 'target-uuid',
                nodeName: 'Node A',
                address: 'edge.example.com',
                port: 443
            },
            finalHostOverrides: {
                address: 'edge.example.com',
                port: 443
            }
        }

        assert.equal(decisionSelectedTargetLabel(decision), 'Node A')
        assert.equal(decisionTargetAddressPort(decision.selectedTarget), 'edge.example.com:443')
        assert.equal(decisionFinalAddress(decision), 'edge.example.com:443')
    })

    it('renders excluded target reason in Russian', () => {
        const translated = decisionReasonTranslation(
            'target node lacks required inbound',
            t,
            (strategy) => strategy,
            (action) => action
        )

        assert.equal(translated, 'На ноде нет inbound, который использует этот Host')
    })

    it('renders selected created reason in Russian', () => {
        const translated = decisionReasonTranslation(
            'selected:LEAST_ASSIGNED:created',
            t,
            () => 'наименьшее число назначений',
            (action) => action
        )

        assert.equal(translated, 'Создано назначение: наименьшее число назначений')
    })

    it('does not crash on malformed diagnostics collections', () => {
        const decision = {
            candidates: null,
            excludedTargets: { malformed: true },
            finalHostOverrides: null,
            selectedTarget: null,
            targetUuid: null
        }

        assert.equal(decisionSelectedTargetLabel(decision), '-')
        assert.equal(decisionFinalAddress(decision), '-')
        assert.equal(decisionCandidatesCount(decision), 0)
        assert.equal(decisionExcludedCount(decision), 0)
    })
})
