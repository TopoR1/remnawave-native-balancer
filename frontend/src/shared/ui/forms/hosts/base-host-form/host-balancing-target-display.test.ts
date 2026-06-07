import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import type { TFunction } from 'i18next'

import { hostBalancerToDraft } from './host-balancing-draft.ts'
import { formatTargetAssignments, formatTargetTraffic } from './host-balancing-target-display.ts'

const HOST_UUID = '11111111-1111-4111-8111-111111111111'
const BALANCER_UUID = '22222222-2222-4222-8222-222222222222'
const TARGET_UUID = '33333333-3333-4333-8333-333333333333'
const NODE_UUID = '44444444-4444-4444-8444-444444444444'

const t = ((key: string) =>
    key === 'base-host-form.no-diagnostic-data' ? 'нет данных' : key) as TFunction

describe('host balancing target display', () => {
    it('maps enriched target stats into draft and formats assignments count', () => {
        const draft = hostBalancerToDraft({
            uuid: BALANCER_UUID,
            hostUuid: HOST_UUID,
            enabled: true,
            strategy: 'LEAST_ASSIGNED',
            unavailablePolicy: 'HIDE_HOST',
            stickyEnabled: true,
            rebalanceExistingAssignmentsByTraffic: false,
            trafficMetric: 'CURRENT_PERIOD',
            createdAt: new Date(),
            updatedAt: new Date(),
            targets: [
                {
                    uuid: TARGET_UUID,
                    balancerUuid: BALANCER_UUID,
                    nodeUuid: NODE_UUID,
                    enabled: true,
                    status: 'ACTIVE',
                    weight: 1,
                    priority: 100,
                    maxAssignedUsers: null,
                    overrideAddress: 'node-a.example.com',
                    overridePort: 443,
                    overrideSni: null,
                    overrideHost: null,
                    overridePath: null,
                    assignmentsCount: 3,
                    trafficBytes: '1073741824',
                    profileName: 'Vless_Reality_Samsung',
                    inboundName: 'vless/raw',
                    createdAt: new Date(),
                    updatedAt: new Date()
                }
            ]
        })

        assert.equal(draft.targets[0].assignmentsCount, 3)
        assert.equal(formatTargetAssignments(draft.targets[0], t), '3')
    })

    it('formats traffic when bytes are present', () => {
        assert.equal(
            formatTargetTraffic({ trafficBytes: '1073741824' }, t),
            '1.00 GiB'
        )
    })

    it('shows no data when traffic bytes are absent', () => {
        assert.equal(formatTargetTraffic({ trafficBytes: null }, t), 'нет данных')
        assert.equal(formatTargetTraffic({}, t), 'нет данных')
    })
})
