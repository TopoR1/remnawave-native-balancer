import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
    DEFAULT_HOST_BALANCING_DRAFT,
    HostBalancingDraft,
    shouldEnableHostSave
} from './host-balancing-form'

import { saveHostBalancingDraft } from './host-balancing-save-flow'

const HOST_UUID = '11111111-1111-4111-8111-111111111111'
const NODE_UUID = '22222222-2222-4222-8222-222222222222'

function draftWithTarget(patch: Partial<HostBalancingDraft> = {}): HostBalancingDraft {
    return {
        ...DEFAULT_HOST_BALANCING_DRAFT,
        enabled: true,
        touched: true,
        targets: [
            {
                localId: 'local-target',
                nodeUuid: NODE_UUID,
                enabled: true,
                status: 'ACTIVE',
                weight: 1,
                priority: 100,
                maxAssignedUsers: null,
                overrideAddress: null,
                overridePort: null,
                overrideSni: null,
                overrideHost: null,
                overridePath: null
            }
        ],
        ...patch
    }
}

describe('host balancing save flow', () => {
    it('enables Save when strategy changes', () => {
        const draft = draftWithTarget({ strategy: 'WEIGHTED', touched: true })

        assert.equal(shouldEnableHostSave(false, draft.touched), true)
    })

    it('enables Save when a target is added', () => {
        const draft = draftWithTarget({ touched: true })

        assert.equal(shouldEnableHostSave(false, draft.touched), true)
    })

    it('enables Save when target weight, priority, or status changes', () => {
        const draft = draftWithTarget({
            touched: true,
            targets: [
                {
                    ...draftWithTarget().targets[0],
                    weight: 10,
                    priority: 5,
                    status: 'DRAINING'
                }
            ]
        })

        assert.equal(shouldEnableHostSave(false, draft.touched), true)
    })

    it('saves only balancing through settings and targets PUT flow', async () => {
        const calls: string[] = []

        await saveHostBalancingDraft({
            draft: draftWithTarget({ strategy: 'WEIGHTED' }),
            hostUuid: HOST_UUID,
            notifySuccess: () => calls.push('notify'),
            refetchSettings: async () => calls.push('refetch'),
            setDraft: () => calls.push('setDraft'),
            updateSettings: async ({ route, variables }) => {
                calls.push(`settings:${route.hostUuid}:${variables.strategy}`)
            },
            updateTargets: async ({ route, variables }) => {
                calls.push(`targets:${route.hostUuid}:${variables.targets.length}`)
            }
        })

        assert.deepEqual(calls, [
            `settings:${HOST_UUID}:WEIGHTED`,
            `targets:${HOST_UUID}:1`,
            'refetch',
            'setDraft',
            'notify'
        ])
    })

    it('keeps touched and skips success notification when targets PUT fails', async () => {
        const calls: string[] = []
        let nextDraft = draftWithTarget()

        await assert.rejects(
            saveHostBalancingDraft({
                draft: nextDraft,
                hostUuid: HOST_UUID,
                notifySuccess: () => calls.push('notify'),
                refetchSettings: async () => calls.push('refetch'),
                setDraft: (draft) => {
                    nextDraft = draft
                    calls.push('setDraft')
                },
                updateSettings: async () => calls.push('settings'),
                updateTargets: async () => {
                    calls.push('targets')
                    throw new Error('targets failed')
                }
            }),
            /targets failed/
        )

        assert.equal(nextDraft.touched, true)
        assert.deepEqual(calls, ['settings', 'targets'])
    })

    it('resets touched after successful balancing save', async () => {
        let nextDraft = draftWithTarget()

        await saveHostBalancingDraft({
            draft: nextDraft,
            hostUuid: HOST_UUID,
            notifySuccess: async () => {},
            refetchSettings: async () => {},
            setDraft: (draft) => {
                nextDraft = draft
            },
            updateSettings: async () => {},
            updateTargets: async () => {}
        })

        assert.equal(nextDraft.touched, false)
    })
})
