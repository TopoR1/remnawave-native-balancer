// @ts-nocheck
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    UpdateHostBalancerCommand,
    UpdateHostBalancerTargetsCommand,
} from '@libs/contracts/commands';

import { HostBalancerService } from './host-balancer.service';
import { HostWithRawInbound } from '../hosts/entities/host-with-inbound-tag.entity';

const HOST_UUID = '11111111-1111-4111-8111-111111111111';
const USER_UUID = '22222222-2222-4222-8222-222222222222';
const BALANCER_UUID = '33333333-3333-4333-8333-333333333333';
const TARGET_UUID = '44444444-4444-4444-8444-444444444444';
const TARGET_UUID_2 = '66666666-6666-4666-8666-666666666666';
const NODE_UUID = '55555555-5555-4555-8555-555555555555';
const NODE_UUID_2 = '99999999-9999-4999-8999-999999999999';
const INBOUND_UUID = '77777777-7777-4777-8777-777777777777';

function createBalancer(overrides = {}) {
    return {
        uuid: BALANCER_UUID,
        hostUuid: HOST_UUID,
        enabled: false,
        strategy: 'LEAST_ASSIGNED',
        unavailablePolicy: 'HIDE_HOST',
        stickyEnabled: true,
        rebalanceExistingAssignmentsByTraffic: false,
        trafficMetric: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        targets: [],
        ...overrides,
    };
}

function createTarget(overrides = {}) {
    return {
        uuid: TARGET_UUID,
        balancerUuid: BALANCER_UUID,
        nodeUuid: NODE_UUID,
        enabled: true,
        status: 'ACTIVE',
        weight: 1,
        priority: 100,
        maxAssignedUsers: null,
        overrideAddress: 'edge.example.com',
        overridePort: null,
        overrideSni: null,
        overrideHost: null,
        overridePath: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        ...overrides,
    };
}

function createHost(overrides = {}) {
    return new HostWithRawInbound({
        uuid: HOST_UUID,
        viewPosition: 1,
        remark: 'Original Remark',
        address: 'origin.example.com',
        port: 443,
        path: '/origin',
        sni: 'origin-sni.example.com',
        host: 'origin-host.example.com',
        alpn: null,
        fingerprint: null,
        securityLayer: 'DEFAULT',
        xHttpExtraParams: null,
        muxParams: null,
        sockoptParams: null,
        finalMask: null,
        isDisabled: false,
        serverDescription: null,
        allowInsecure: false,
        tag: null,
        isHidden: false,
        overrideSniFromAddress: false,
        keepSniBlank: false,
        vlessRouteId: null,
        shuffleHost: false,
        mihomoX25519: false,
        configProfileUuid: null,
        configProfileInboundUuid: INBOUND_UUID,
        xrayJsonTemplateUuid: null,
        excludeFromSubscriptionTypes: [],
        nodes: [],
        excludedInternalSquads: [],
        rawInbound: null,
        inboundTag: 'vless',
        xrayJsonTemplate: null,
        ...overrides,
    });
}

function createAssignment(overrides = {}) {
    return {
        uuid: '88888888-8888-4888-8888-888888888888',
        hostUuid: HOST_UUID,
        userUuid: USER_UUID,
        targetUuid: TARGET_UUID,
        reason: null,
        lastUsedAt: new Date('2026-01-01T00:00:00.000Z'),
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        ...overrides,
    };
}

function createService(overrides: Record<string, unknown> = {}) {
    const repository = {
        findHost: async () => ({ uuid: HOST_UUID, address: 'origin.example.com' }),
        findUser: async () => ({ uuid: USER_UUID }),
        findByHostUuid: async () => null,
        findManyByHostUuids: async () => [],
        upsertSettings: async (_hostUuid: string, dto: object) => createBalancer(dto),
        ensureBalancer: async () => createBalancer(),
        replaceTargets: async (_balancerUuid: string, targets: object[]) =>
            createBalancer({ targets: targets.map((target) => createTarget(target)) }),
        countAssignmentsByTarget: async () => new Map<string, number>(),
        findAssignmentsForUser: async () => new Map(),
        upsertAssignment: async (_dto: object) => createAssignment(_dto),
        touchAssignment: async () => undefined,
        getNodeStates: async () =>
            new Map([
                [
                    NODE_UUID,
                    {
                        uuid: NODE_UUID,
                        isConnected: true,
                        isConnecting: false,
                        isDisabled: false,
                        activeInboundUuids: new Set([INBOUND_UUID]),
                    },
                ],
                [
                    NODE_UUID_2,
                    {
                        uuid: NODE_UUID_2,
                        isConnected: true,
                        isConnecting: false,
                        isDisabled: false,
                        activeInboundUuids: new Set([INBOUND_UUID]),
                    },
                ],
            ]),
        getNodeTrafficByMetric: async () => new Map([[NODE_UUID, 0n], [NODE_UUID_2, 0n]]),
        getStats: async () => ({ assignmentsCount: 0, targets: [] }),
        ...overrides,
    };

    return new HostBalancerService(repository as never);
}

describe('HostBalancerService', () => {
    it('creates host balancer settings', async () => {
        const service = createService();
        const result = await service.updateSettings(HOST_UUID, { enabled: true });

        assert.equal(result.isOk, true);
        if (result.isOk) {
            assert.equal(result.response.hostUuid, HOST_UUID);
            assert.equal(result.response.enabled, true);
        }
    });

    it('updates strategy', async () => {
        const service = createService();
        const result = await service.updateSettings(HOST_UUID, { strategy: 'WEIGHTED' });

        assert.equal(result.isOk, true);
        if (result.isOk) {
            assert.equal(result.response.strategy, 'WEIGHTED');
        }
    });

    it('adds targets and warns when overrideAddress is absent', async () => {
        const service = createService();
        const result = await service.updateTargets(HOST_UUID, {
            targets: [{ nodeUuid: NODE_UUID, overrideAddress: null }],
        });

        assert.equal(result.isOk, true);
        if (result.isOk) {
            assert.equal(result.response.length, 1);
            assert.match(result.response[0].warning ?? '', /original host\.address/);
        }
    });

    it('rejects invalid weight at schema level', () => {
        const parsed = UpdateHostBalancerTargetsCommand.RequestBodySchema.safeParse({
            targets: [{ weight: 0 }],
        });

        assert.equal(parsed.success, false);
    });

    it('rejects invalid port at schema level', () => {
        const parsed = UpdateHostBalancerTargetsCommand.RequestBodySchema.safeParse({
            targets: [{ overridePort: 70000 }],
        });

        assert.equal(parsed.success, false);
    });

    it('previews diagnostics without changing assignments', async () => {
        let assignmentWrites = 0;
        const target = createTarget();
        const service = createService({
            findByHostUuid: async () => createBalancer({ enabled: true, targets: [target] }),
            upsertAssignment: async () => {
                assignmentWrites += 1;
            },
        });

        const result = await service.previewSelection(USER_UUID, HOST_UUID);

        assert.equal(result.isOk, true);
        assert.equal(assignmentWrites, 0);
        if (result.isOk) {
            assert.equal(result.response.target?.uuid, TARGET_UUID);
            assert.equal(result.response.diagnostics.wouldCreateAssignment, false);
            assert.equal(result.response.diagnostics.selectedTargetUuid, TARGET_UUID);
            assert.equal(result.response.diagnostics.assignment, 'created');
        }
    });

    it('rejects traffic-aware settings when existing targets have no nodeUuid', async () => {
        const service = createService({
            findByHostUuid: async () =>
                createBalancer({ targets: [createTarget({ nodeUuid: null })] }),
        });

        const result = await service.updateSettings(HOST_UUID, {
            strategy: 'LEAST_TRAFFIC',
        });

        assert.equal(result.isOk, false);
    });

    it('validates update settings schema', () => {
        const parsed = UpdateHostBalancerCommand.RequestBodySchema.safeParse({
            strategy: 'WEIGHTED_LEAST_TRAFFIC',
            trafficMetric: 'CURRENT_PERIOD',
        });

        assert.equal(parsed.success, true);
    });

    it('host balancer disabled keeps original behavior', async () => {
        const host = createHost();
        const service = createService({
            findManyByHostUuids: async () =>
                [createBalancer({ enabled: false, targets: [createTarget()] })],
        });

        const result = await service.applyToHostsForUser({ uuid: USER_UUID }, [host]);

        assert.equal(result[0], host);
        assert.equal(result[0].address, 'origin.example.com');
    });

    it('host balancer enabled rewrites host connection params but keeps remark', async () => {
        const service = createService({
            findManyByHostUuids: async () =>
                [
                    createBalancer({
                        enabled: true,
                        targets: [
                            createTarget({
                                overrideAddress: 'target.example.com',
                                overridePort: 8443,
                                overrideSni: 'target-sni.example.com',
                                overrideHost: 'target-host.example.com',
                                overridePath: '/target',
                            }),
                        ],
                    }),
                ],
        });

        const [result] = await service.applyToHostsForUser({ uuid: USER_UUID }, [createHost()]);

        assert.equal(result.remark, 'Original Remark');
        assert.equal(result.address, 'target.example.com');
        assert.equal(result.port, 8443);
        assert.equal(result.sni, 'target-sni.example.com');
        assert.equal(result.host, 'target-host.example.com');
        assert.equal(result.path, '/target');
    });

    it('sticky assignment reused', async () => {
        let touched = 0;
        const service = createService({
            findManyByHostUuids: async () =>
                [createBalancer({ enabled: true, targets: [createTarget()] })],
            findAssignmentsForUser: async () => new Map([[HOST_UUID, createAssignment()]]),
            touchAssignment: async () => {
                touched += 1;
            },
        });

        const [result] = await service.applyToHostsForUser({ uuid: USER_UUID }, [createHost()]);

        assert.equal(result.address, 'edge.example.com');
        assert.equal(touched, 1);
    });

    it('disabled target reassigned', async () => {
        let upsertedTarget = '';
        const activeTarget = createTarget({
            uuid: TARGET_UUID_2,
            overrideAddress: 'active.example.com',
        });
        const service = createService({
            findManyByHostUuids: async () =>
                [
                    createBalancer({
                        enabled: true,
                        targets: [createTarget({ enabled: false }), activeTarget],
                    }),
                ],
            findAssignmentsForUser: async () => new Map([[HOST_UUID, createAssignment()]]),
            upsertAssignment: async (dto) => {
                upsertedTarget = dto.targetUuid;
                return createAssignment(dto);
            },
        });

        const [result] = await service.applyToHostsForUser({ uuid: USER_UUID }, [createHost()]);

        assert.equal(result.address, 'active.example.com');
        assert.equal(upsertedTarget, TARGET_UUID_2);
    });

    it('dead target reassigned', async () => {
        const activeTarget = createTarget({
            uuid: TARGET_UUID_2,
            overrideAddress: 'alive.example.com',
        });
        const service = createService({
            findManyByHostUuids: async () =>
                [
                    createBalancer({
                        enabled: true,
                        targets: [createTarget({ status: 'DEAD' }), activeTarget],
                    }),
                ],
            findAssignmentsForUser: async () => new Map([[HOST_UUID, createAssignment()]]),
        });

        const [result] = await service.applyToHostsForUser({ uuid: USER_UUID }, [createHost()]);

        assert.equal(result.address, 'alive.example.com');
    });

    it('draining target keeps old user but does not receive new user', async () => {
        const drainingTarget = createTarget({
            status: 'DRAINING',
            overrideAddress: 'draining.example.com',
        });
        const activeTarget = createTarget({
            uuid: TARGET_UUID_2,
            overrideAddress: 'new.example.com',
        });

        const reusedService = createService({
            findManyByHostUuids: async () =>
                [createBalancer({ enabled: true, targets: [drainingTarget, activeTarget] })],
            findAssignmentsForUser: async () => new Map([[HOST_UUID, createAssignment()]]),
        });
        const [reused] = await reusedService.applyToHostsForUser({ uuid: USER_UUID }, [createHost()]);

        const newService = createService({
            findManyByHostUuids: async () =>
                [createBalancer({ enabled: true, targets: [drainingTarget, activeTarget] })],
        });
        const [created] = await newService.applyToHostsForUser({ uuid: USER_UUID }, [createHost()]);

        assert.equal(reused.address, 'draining.example.com');
        assert.equal(created.address, 'new.example.com');
    });

    it('HIDE_HOST removes host when no candidates', async () => {
        const service = createService({
            findManyByHostUuids: async () =>
                [
                    createBalancer({
                        enabled: true,
                        unavailablePolicy: 'HIDE_HOST',
                        targets: [createTarget({ enabled: false })],
                    }),
                ],
        });

        const result = await service.applyToHostsForUser({ uuid: USER_UUID }, [createHost()]);

        assert.equal(result.length, 0);
    });

    it('ORIGINAL_HOST keeps old behavior when no candidates', async () => {
        const service = createService({
            findManyByHostUuids: async () =>
                [
                    createBalancer({
                        enabled: true,
                        unavailablePolicy: 'ORIGINAL_HOST',
                        targets: [createTarget({ enabled: false })],
                    }),
                ],
        });

        const [result] = await service.applyToHostsForUser({ uuid: USER_UUID }, [createHost()]);

        assert.equal(result.address, 'origin.example.com');
    });

    it('priority failover selects primary active target', async () => {
        const service = createService({
            findManyByHostUuids: async () =>
                [
                    createBalancer({
                        enabled: true,
                        strategy: 'PRIORITY_FAILOVER',
                        targets: [
                            createTarget({
                                uuid: TARGET_UUID_2,
                                priority: 50,
                                overrideAddress: 'secondary.example.com',
                            }),
                            createTarget({
                                priority: 10,
                                overrideAddress: 'primary.example.com',
                            }),
                        ],
                    }),
                ],
        });

        const [result] = await service.applyToHostsForUser({ uuid: USER_UUID }, [createHost()]);

        assert.equal(result.address, 'primary.example.com');
    });

    it('least traffic selects lowest traffic target', async () => {
        const targetA = createTarget({
            overrideAddress: 'busy.example.com',
            nodeUuid: NODE_UUID,
        });
        const targetB = createTarget({
            uuid: TARGET_UUID_2,
            overrideAddress: 'quiet.example.com',
            nodeUuid: NODE_UUID_2,
        });
        const service = createService({
            findManyByHostUuids: async () =>
                [
                    createBalancer({
                        enabled: true,
                        strategy: 'LEAST_TRAFFIC',
                        trafficMetric: 'LAST_1H',
                        targets: [targetA, targetB],
                    }),
                ],
            getNodeTrafficByMetric: async () =>
                new Map([
                    [NODE_UUID, 1_000n],
                    [NODE_UUID_2, 100n],
                ]),
        });

        const [result] = await service.applyToHostsForUser({ uuid: USER_UUID }, [createHost()]);

        assert.equal(result.address, 'quiet.example.com');
    });

    it('weighted least traffic respects weight', async () => {
        const targetA = createTarget({
            overrideAddress: 'weighted.example.com',
            nodeUuid: NODE_UUID,
            weight: 10,
        });
        const targetB = createTarget({
            uuid: TARGET_UUID_2,
            overrideAddress: 'raw-low.example.com',
            nodeUuid: NODE_UUID_2,
            weight: 1,
        });
        const service = createService({
            findManyByHostUuids: async () =>
                [
                    createBalancer({
                        enabled: true,
                        strategy: 'WEIGHTED_LEAST_TRAFFIC',
                        targets: [targetA, targetB],
                    }),
                ],
            getNodeTrafficByMetric: async () =>
                new Map([
                    [NODE_UUID, 1_000n],
                    [NODE_UUID_2, 200n],
                ]),
        });

        const [result] = await service.applyToHostsForUser({ uuid: USER_UUID }, [createHost()]);

        assert.equal(result.address, 'weighted.example.com');
    });

    it('missing traffic falls back to least assigned', async () => {
        const targetA = createTarget({
            overrideAddress: 'assigned.example.com',
            nodeUuid: NODE_UUID,
        });
        const targetB = createTarget({
            uuid: TARGET_UUID_2,
            overrideAddress: 'fallback.example.com',
            nodeUuid: NODE_UUID_2,
        });
        const service = createService({
            findByHostUuid: async () =>
                createBalancer({
                    enabled: true,
                    strategy: 'LEAST_TRAFFIC',
                    targets: [targetA, targetB],
                }),
            countAssignmentsByTarget: async () =>
                new Map([
                    [TARGET_UUID, 5],
                    [TARGET_UUID_2, 0],
                ]),
            getNodeTrafficByMetric: async () => new Map([[NODE_UUID, 10n]]),
        });

        const result = await service.previewSelection(USER_UUID, HOST_UUID);

        assert.equal(result.isOk, true);
        if (result.isOk) {
            assert.equal(result.response.target?.uuid, TARGET_UUID_2);
            assert.equal(
                result.response.diagnostics.warnings.includes(
                    'Traffic data missing, fallback strategy used.',
                ),
                true,
            );
            assert.equal(
                result.response.diagnostics.candidates?.every(
                    (candidate) => candidate.fallbackUsed === true,
                ),
                true,
            );
        }
    });

    it('disabled and dead targets are excluded even if traffic is low', async () => {
        const disabledTarget = createTarget({
            overrideAddress: 'disabled-low.example.com',
            nodeUuid: NODE_UUID,
            enabled: false,
        });
        const deadTarget = createTarget({
            uuid: TARGET_UUID_2,
            overrideAddress: 'dead-low.example.com',
            nodeUuid: NODE_UUID_2,
            status: 'DEAD',
        });
        const activeTarget = createTarget({
            uuid: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            overrideAddress: 'active-high.example.com',
            nodeUuid: NODE_UUID_2,
        });
        const service = createService({
            findManyByHostUuids: async () =>
                [
                    createBalancer({
                        enabled: true,
                        strategy: 'LEAST_TRAFFIC',
                        targets: [disabledTarget, deadTarget, activeTarget],
                    }),
                ],
            getNodeTrafficByMetric: async () =>
                new Map([
                    [NODE_UUID, 1n],
                    [NODE_UUID_2, 10_000n],
                ]),
        });

        const [result] = await service.applyToHostsForUser({ uuid: USER_UUID }, [createHost()]);

        assert.equal(result.address, 'active-high.example.com');
    });

    it('sticky assignment remains when rebalanceExistingAssignmentsByTraffic is false', async () => {
        let touched = 0;
        let upserted = 0;
        const stickyTarget = createTarget({
            overrideAddress: 'sticky-busy.example.com',
            nodeUuid: NODE_UUID,
        });
        const quietTarget = createTarget({
            uuid: TARGET_UUID_2,
            overrideAddress: 'quiet.example.com',
            nodeUuid: NODE_UUID_2,
        });
        const service = createService({
            findManyByHostUuids: async () =>
                [
                    createBalancer({
                        enabled: true,
                        strategy: 'LEAST_TRAFFIC',
                        rebalanceExistingAssignmentsByTraffic: false,
                        targets: [stickyTarget, quietTarget],
                    }),
                ],
            findAssignmentsForUser: async () => new Map([[HOST_UUID, createAssignment()]]),
            getNodeTrafficByMetric: async () =>
                new Map([
                    [NODE_UUID, 10_000n],
                    [NODE_UUID_2, 1n],
                ]),
            touchAssignment: async () => {
                touched += 1;
            },
            upsertAssignment: async () => {
                upserted += 1;
            },
        });

        const [result] = await service.applyToHostsForUser({ uuid: USER_UUID }, [createHost()]);

        assert.equal(result.address, 'sticky-busy.example.com');
        assert.equal(touched, 1);
        assert.equal(upserted, 0);
    });

    it('balancer service throws returns original hosts unchanged', async () => {
        const host = createHost();
        const service = createService({
            findManyByHostUuids: async () => {
                throw new Error('database is down');
            },
        });

        const result = await service.applyToHostsForUser({ uuid: USER_UUID }, [host]);

        assert.equal(result[0], host);
        assert.equal(result[0].address, 'origin.example.com');
    });
});
