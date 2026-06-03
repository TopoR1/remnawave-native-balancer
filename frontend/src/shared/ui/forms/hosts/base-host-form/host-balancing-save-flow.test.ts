import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
    DEFAULT_HOST_BALANCING_DRAFT,
    HostBalancingDraft,
    patchHostBalancingDraft,
    updateHostBalancingTarget,
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
        const draft = patchHostBalancingDraft(draftWithTarget({ touched: false }), {
            strategy: 'WEIGHTED'
        })

        assert.equal(shouldEnableHostSave(false, draft.touched), true)
    })

    it('enables Save when unavailable policy changes', () => {
        const draft = patchHostBalancingDraft(draftWithTarget({ touched: false }), {
            unavailablePolicy: 'ORIGINAL_HOST'
        })

        assert.equal(shouldEnableHostSave(false, draft.touched), true)
    })

    it('enables Save when sticky is toggled', () => {
        const draft = patchHostBalancingDraft(draftWithTarget({ touched: false }), {
            stickyEnabled: false
        })

        assert.equal(shouldEnableHostSave(false, draft.touched), true)
    })

    it('enables Save when a target is added', () => {
        const draft = patchHostBalancingDraft(
            {
                ...DEFAULT_HOST_BALANCING_DRAFT,
                enabled: true,
                touched: false
            },
            {
                targets: draftWithTarget().targets
            }
        )

        assert.equal(shouldEnableHostSave(false, draft.touched), true)
    })

    it('enables Save when target node UUID changes', () => {
        const draft = updateHostBalancingTarget(
            draftWithTarget({ touched: false }),
            'local-target',
            {
                nodeUuid: '33333333-3333-4333-8333-333333333333'
            }
        )

        assert.equal(shouldEnableHostSave(false, draft.touched), true)
    })

    it('enables Save when target weight, priority, or status changes', () => {
        const draft = updateHostBalancingTarget(
            draftWithTarget({ touched: false }),
            'local-target',
            {
                weight: 10,
                priority: 5,
                status: 'DRAINING'
            }
        )

        assert.equal(shouldEnableHostSave(false, draft.touched), true)
    })

    it('marks every target field change as touched', () => {
        const patches = [
            { enabled: false },
            { status: 'DISABLED' as const },
            { weight: 2 },
            { priority: 10 },
            { maxAssignedUsers: 50 },
            { overrideAddress: 'edge.example.com' },
            { overridePort: 443 },
            { overrideSni: 'sni.example.com' },
            { overrideHost: 'host.example.com' },
            { overridePath: '/balancer' }
        ]

        for (const patch of patches) {
            const draft = updateHostBalancingTarget(
                draftWithTarget({ touched: false }),
                'local-target',
                patch
            )

            assert.equal(draft.touched, true)
            assert.equal(shouldEnableHostSave(false, draft.touched), true)
        }
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
