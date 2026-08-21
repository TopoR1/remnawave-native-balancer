// @ts-nocheck
import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { ok } from '@common/types';

import { HostBalancerService } from '@modules/host-balancers';
import { GetHostsForUserQuery } from '@modules/hosts/queries/get-hosts-for-user';
import { GetCachedRemnawaveSettingsQuery } from '@modules/remnawave-settings/queries/get-cached-remnawave-settings';
import { GetCachedSubscriptionSettingsQuery } from '@modules/subscription-settings/queries/get-cached-subscrtipion-settings';
import { GetUserByUniqueFieldQuery } from '@modules/users/queries/get-user-by-unique-field';

import { HostWithRawInbound } from '../hosts/entities/host-with-inbound-tag.entity';
import { SubscriptionService } from './subscription.service';

const HOST_UUID = '11111111-1111-4111-8111-111111111111';
const USER_ID = 100n;
const BALANCER_UUID = '33333333-3333-4333-8333-333333333333';
const TARGET_UUID = '44444444-4444-4444-8444-444444444444';
const TARGET_UUID_2 = '66666666-6666-4666-8666-666666666666';
const NODE_UUID = '55555555-5555-4555-8555-555555555555';
const NODE_UUID_2 = '99999999-9999-4999-8999-999999999999';
const INBOUND_UUID = '77777777-7777-4777-8777-777777777777';

function createUser(overrides = {}) {
    return {
        id: USER_ID,
        shortUuid: 'short-user',
        username: 'alice',
        status: 'ACTIVE',
        trafficLimitBytes: 10_000_000n,
        trafficLimitStrategy: 'NO_RESET',
        expireAt: new Date('2027-01-01T00:00:00.000Z'),
        telegramId: null,
        email: null,
        description: null,
        tag: null,
        hwidDeviceLimit: null,
        externalSquadUuid: null,
        trojanPassword: 'trojan-password',
        vlessUuid: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        ssPassword: 'ss-password',
        lastTriggeredThreshold: 0,
        subRevokedAt: null,
        lastTrafficResetAt: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        activeInternalSquads: [],
        userTraffic: {
            usedTrafficBytes: 0n,
            lifetimeUsedTrafficBytes: 0n,
            onlineAt: null,
            lastConnectedNodeUuid: null,
            firstConnectedAt: null,
        },
        ...overrides,
    };
}

function createSettings(overrides = {}) {
    return {
        randomizeHosts: false,
        serveJsonAtBaseSubscription: false,
        supportLink: '',
        profileTitle: 'Remnawave',
        profileUpdateInterval: 24,
        happAnnounce: null,
        happRouting: null,
        isProfileWebpageUrlEnabled: false,
        customResponseHeaders: null,
        isShowCustomRemarks: false,
        customRemarks: null,
        responseRules: [],
        hwidSettings: {
            enabled: false,
            fallbackDeviceLimit: 0,
            maxDevicesAnnounce: null,
        },
        ...overrides,
    };
}

function createSrrContext(overrides = {}) {
    return {
        userAgent: 'V2Ray',
        hwidHeaders: null,
        isExtendedClient: false,
        matchedResponseType: 'XRAY_BASE64',
        ip: '127.0.0.1',
        subscriptionSettings: createSettings(),
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
        xhttpExtraParams: null,
        muxParams: null,
        sockoptParams: null,
        finalMask: null,
        isDisabled: false,
        serverDescription: null,
        pinnedPeerCertSha256: null,
        verifyPeerCertByName: null,
        tags: [],
        isHidden: false,
        overrideSniFromAddress: false,
        keepSniBlank: false,
        vlessRouteId: null,
        shuffleHost: false,
        mihomoX25519: false,
        mihomoIpVersion: null,
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

function createBalancer(overrides = {}) {
    return {
        uuid: BALANCER_UUID,
        hostUuid: HOST_UUID,
        enabled: true,
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
        overrideAddress: 'target.example.com',
        overridePort: 8443,
        overrideSni: 'target-sni.example.com',
        overrideHost: 'target-host.example.com',
        overridePath: '/target',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        ...overrides,
    };
}

function createAssignment(overrides = {}) {
    return {
        uuid: '88888888-8888-4888-8888-888888888888',
        hostUuid: HOST_UUID,
        userId: USER_ID,
        targetUuid: TARGET_UUID,
        reason: null,
        lastUsedAt: new Date('2026-01-01T00:00:00.000Z'),
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        ...overrides,
    };
}

function createResolvedProxyConfig(host: HostWithRawInbound) {
    return {
        finalRemark: host.remark,
        address: host.address,
        port: host.port,
        protocol: 'vless',
        protocolOptions: {
            id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            encryption: 'none',
            flow: '',
        },
        security: 'tls',
        securityOptions: {
            allowInsecure: false,
            alpn: null,
            enableSessionResumption: false,
            fingerprint: null,
            serverName: host.sni,
            echConfigList: null,
            echForceQuery: null,
        },
        transport: 'xhttp',
        transportOptions: {
            path: host.path,
            host: host.host,
            mode: 'auto',
            extra: null,
        },
        streamOverrides: {
            finalMask: null,
            sockopt: null,
        },
        mux: null,
        clientOverrides: {
            shuffleHost: false,
            mihomoX25519: false,
            serverDescription: null,
            xrayJsonTemplate: null,
        },
        metadata: {
            uuid: host.uuid,
            tag: host.tag,
            excludeFromSubscriptionTypes: host.excludeFromSubscriptionTypes,
            inboundTag: host.inboundTag,
            configProfileUuid: host.configProfileUuid,
            configProfileInboundUuid: host.configProfileInboundUuid,
            isDisabled: host.isDisabled,
            isHidden: host.isHidden,
            viewPosition: host.viewPosition,
            remark: host.remark,
            vlessRouteId: host.vlessRouteId,
            rawInbound: host.rawInbound,
        },
    };
}

function createVlessLink(host: HostWithRawInbound) {
    const params = new URLSearchParams({
        type: 'xhttp',
        security: 'tls',
        sni: host.sni ?? '',
        host: host.host ?? '',
        path: host.path ?? '',
    });

    return `vless://aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa@${host.address}:${host.port}?${params.toString()}#${encodeURIComponent(host.remark)}`;
}

function createHostBalancerRepository(overrides = {}) {
    return {
        findManyByHostUuids: async () => [],
        countAssignmentsByTarget: async () => new Map(),
        findAssignmentsForUser: async () => new Map(),
        upsertAssignment: async (dto) => createAssignment(dto),
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
        getNodeTrafficByMetric: async () =>
            new Map([
                [NODE_UUID, 0n],
                [NODE_UUID_2, 0n],
            ]),
        ...overrides,
    };
}

function createRealHostBalancer(repositoryOverrides = {}) {
    return new HostBalancerService(createHostBalancerRepository(repositoryOverrides) as never);
}

function createRenderTemplatesService(overrides = {}) {
    return {
        generateSubscription: async ({ hosts }) => ({
            subscription: hosts.map(createVlessLink).join('\n'),
            contentType: 'text/plain',
        }),
        generateRawSubscription: async ({ hosts }) => hosts.map(createResolvedProxyConfig),
        ...overrides,
    };
}

function createService({
    enabled = true,
    hostBalancerGlobalEnabled = true,
    user = createUser(),
    hosts = [createHost()],
    settings = createSettings(),
    renderTemplatesService = createRenderTemplatesService(),
    resolveProxyConfigService = {
        resolveProxyConfig: async ({ hosts }) => hosts.map(createResolvedProxyConfig),
    },
    xrayGeneratorService = {
        generateLinks: (configs) =>
            configs.map((config) => `${config.protocol}://${config.address}#${config.finalRemark}`),
    },
    hostBalancerService = {
        applyToHostsForUser: async (_user, originalHosts) => originalHosts,
    },
} = {}) {
    const queryBus = {
        execute: async (query) => {
            if (query instanceof GetUserByUniqueFieldQuery) {
                return ok(user);
            }

            if (query instanceof GetHostsForUserQuery) {
                return ok(hosts);
            }

            if (query instanceof GetCachedSubscriptionSettingsQuery) {
                return settings;
            }

            if (query instanceof GetCachedRemnawaveSettingsQuery) {
                return { hostBalancerGlobalEnabled };
            }

            return null;
        },
    };

    return new SubscriptionService(
        queryBus,
        {
            get: (key: string, defaultValue?: string) =>
                key === 'HOST_BALANCER_ENABLED' ? enabled : defaultValue,
            getOrThrow: () => 'sub.example.com',
        },
        {},
        {},
        renderTemplatesService,
        resolveProxyConfigService,
        xrayGeneratorService,
        {
            addSubscriptionRequestRecord: async () => undefined,
            checkAndUpsertHwidDevice: async () => undefined,
        },
        {},
        hostBalancerService,
    );
}

describe('SubscriptionService host balancer kill-switch', () => {
    it('env false does not apply balancer service', async () => {
        let calls = 0;
        const service = createService({
            enabled: false,
            hostBalancerService: {
                applyToHostsForUser: async (_user, hosts) => {
                    calls += 1;
                    return [createHost({ address: 'balanced.example.com' }), ...hosts.slice(1)];
                },
            },
        });

        const response = await service.getSubscriptionByShortUuid(createSrrContext(), 'short-user');

        assert.equal(calls, 0);
        assert.match(String(response.body), /origin\.example\.com:443/);
        assert.doesNotMatch(String(response.body), /balanced\.example\.com/);
    });

    it('env true with global DB disabled does not apply balancer service', async () => {
        let calls = 0;
        const service = createService({
            enabled: true,
            hostBalancerGlobalEnabled: false,
            hostBalancerService: {
                applyToHostsForUser: async (_user, hosts) => {
                    calls += 1;
                    return [createHost({ address: 'balanced.example.com' }), ...hosts.slice(1)];
                },
            },
        });

        const response = await service.getSubscriptionByShortUuid(createSrrContext(), 'short-user');

        assert.equal(calls, 0);
        assert.match(String(response.body), /origin\.example\.com:443/);
        assert.doesNotMatch(String(response.body), /balanced\.example\.com/);
    });

    it('env true with global DB enabled and host balancer disabled keeps original host', async () => {
        const service = createService({
            enabled: true,
            hostBalancerGlobalEnabled: true,
            hostBalancerService: createRealHostBalancer({
                findManyByHostUuids: async () => [
                    createBalancer({ enabled: false, targets: [createTarget()] }),
                ],
            }),
        });

        const response = await service.getSubscriptionByShortUuid(createSrrContext(), 'short-user');

        assert.match(String(response.body), /origin\.example\.com:443/);
        assert.doesNotMatch(String(response.body), /target\.example\.com/);
        assert.match(String(response.body), /Original%20Remark/);
    });

    it('env true with global DB enabled and host balancer enabled applies balancer result', async () => {
        const service = createService({
            enabled: true,
            hostBalancerGlobalEnabled: true,
            hostBalancerService: {
                applyToHostsForUser: async () => [
                    createHost({
                        address: 'balanced.example.com',
                        port: 9443,
                    }),
                ],
            },
        });

        const response = await service.getSubscriptionByShortUuid(createSrrContext(), 'short-user');

        assert.match(String(response.body), /balanced\.example\.com:9443/);
    });
});

describe('SubscriptionService host balancer subscription integration', () => {
    beforeEach(() => {
        delete process.env.TZ;
    });

    it('host balancer enabled rewrites address, port, sni, host, and path inside subscription output', async () => {
        const service = createService({
            hostBalancerService: createRealHostBalancer({
                findManyByHostUuids: async () => [
                    createBalancer({
                        targets: [
                            createTarget({
                                overrideAddress: 'edge.example.com',
                                overridePort: 8443,
                                overrideSni: 'edge-sni.example.com',
                                overrideHost: 'edge-host.example.com',
                                overridePath: '/edge',
                            }),
                        ],
                    }),
                ],
            }),
        });

        const response = await service.getSubscriptionByShortUuid(createSrrContext(), 'short-user');
        const body = String(response.body);

        assert.match(body, /edge\.example\.com:8443/);
        assert.match(body, /sni=edge-sni\.example\.com/);
        assert.match(body, /host=edge-host\.example\.com/);
        assert.match(body, /path=%2Fedge/);
        assert.doesNotMatch(body, /origin\.example\.com:443/);
    });

    it('keeps original Host remark while using selected target address in VLESS link', async () => {
        const service = createService({
            hostBalancerService: createRealHostBalancer({
                findManyByHostUuids: async () => [
                    createBalancer({
                        targets: [
                            createTarget({
                                overrideAddress: 'target-address.example.com',
                            }),
                        ],
                    }),
                ],
            }),
        });

        const response = await service.getSubscriptionByShortUuid(createSrrContext(), 'short-user');
        const body = String(response.body);

        assert.match(body, /^vless:\/\//);
        assert.match(body, /target-address\.example\.com:8443/);
        assert.match(body, /#Original%20Remark$/);
    });

    it('no candidates with HIDE_HOST removes host from output', async () => {
        const service = createService({
            hostBalancerService: createRealHostBalancer({
                findManyByHostUuids: async () => [
                    createBalancer({
                        unavailablePolicy: 'HIDE_HOST',
                        targets: [createTarget({ enabled: false })],
                    }),
                ],
            }),
        });

        const response = await service.getSubscriptionByShortUuid(createSrrContext(), 'short-user');

        assert.equal(response.body, '');
    });

    it('no candidates with ORIGINAL_HOST keeps original host in output', async () => {
        const service = createService({
            hostBalancerService: createRealHostBalancer({
                findManyByHostUuids: async () => [
                    createBalancer({
                        unavailablePolicy: 'ORIGINAL_HOST',
                        targets: [createTarget({ status: 'DEAD' })],
                    }),
                ],
            }),
        });

        const response = await service.getSubscriptionByShortUuid(createSrrContext(), 'short-user');
        const body = String(response.body);

        assert.match(body, /origin\.example\.com:443/);
        assert.match(body, /#Original%20Remark$/);
    });

    it('existing sticky assignment is reused in subscription output', async () => {
        let touched = 0;
        const service = createService({
            hostBalancerService: createRealHostBalancer({
                findManyByHostUuids: async () => [
                    createBalancer({
                        targets: [
                            createTarget({
                                overrideAddress: 'sticky.example.com',
                            }),
                            createTarget({
                                uuid: TARGET_UUID_2,
                                overrideAddress: 'other.example.com',
                            }),
                        ],
                    }),
                ],
                findAssignmentsForUser: async () => new Map([[HOST_UUID, createAssignment()]]),
                touchAssignment: async () => {
                    touched += 1;
                },
            }),
        });

        const response = await service.getSubscriptionByShortUuid(createSrrContext(), 'short-user');

        assert.equal(touched, 1);
        assert.match(String(response.body), /sticky\.example\.com:8443/);
    });

    it('dead or disabled assigned target is reassigned before subscription rendering', async () => {
        let upsertedTargetUuid = '';
        const service = createService({
            hostBalancerService: createRealHostBalancer({
                findManyByHostUuids: async () => [
                    createBalancer({
                        targets: [
                            createTarget({
                                status: 'DEAD',
                                overrideAddress: 'dead.example.com',
                            }),
                            createTarget({
                                uuid: TARGET_UUID_2,
                                overrideAddress: 'active.example.com',
                            }),
                        ],
                    }),
                ],
                findAssignmentsForUser: async () => new Map([[HOST_UUID, createAssignment()]]),
                upsertAssignment: async (dto) => {
                    upsertedTargetUuid = dto.targetUuid;
                    return createAssignment(dto);
                },
            }),
        });

        const response = await service.getSubscriptionByShortUuid(createSrrContext(), 'short-user');

        assert.equal(upsertedTargetUuid, TARGET_UUID_2);
        assert.match(String(response.body), /active\.example\.com:8443/);
        assert.doesNotMatch(String(response.body), /dead\.example\.com/);
    });

    it('traffic strategy selects lower-traffic node inside subscription flow', async () => {
        const service = createService({
            hostBalancerService: createRealHostBalancer({
                findManyByHostUuids: async () => [
                    createBalancer({
                        strategy: 'LEAST_TRAFFIC',
                        trafficMetric: 'LAST_1H',
                        targets: [
                            createTarget({
                                overrideAddress: 'busy.example.com',
                                nodeUuid: NODE_UUID,
                            }),
                            createTarget({
                                uuid: TARGET_UUID_2,
                                overrideAddress: 'quiet.example.com',
                                nodeUuid: NODE_UUID_2,
                            }),
                        ],
                    }),
                ],
                getNodeTrafficByMetric: async () =>
                    new Map([
                        [NODE_UUID, 10_000n],
                        [NODE_UUID_2, 100n],
                    ]),
            }),
        });

        const response = await service.getSubscriptionByShortUuid(createSrrContext(), 'short-user');

        assert.match(String(response.body), /quiet\.example\.com:8443/);
        assert.doesNotMatch(String(response.body), /busy\.example\.com/);
    });

    it('raw subscription flow receives hosts after balancer application', async () => {
        const service = createService({
            hostBalancerService: createRealHostBalancer({
                findManyByHostUuids: async () => [
                    createBalancer({
                        targets: [
                            createTarget({
                                overrideAddress: 'raw-target.example.com',
                                overridePort: 9443,
                            }),
                        ],
                    }),
                ],
            }),
        });

        const response = await service.getRawSubscriptionByShortUuid(
            'short-user',
            'V2Ray',
            false,
            null,
            '127.0.0.1',
        );

        assert.equal(response.isOk, true);
        assert.equal(response.response.resolvedProxyConfigs[0].address, 'raw-target.example.com');
        assert.equal(response.response.resolvedProxyConfigs[0].port, 9443);
        assert.equal(response.response.resolvedProxyConfigs[0].metadata.remark, 'Original Remark');
    });

    it('passes valid ResolvedProxyConfig to the renderer after host balancing', async () => {
        let receivedResolvedConfig;
        const renderTemplatesService = createRenderTemplatesService({
            generateSubscription: async ({ hosts }) => {
                const [resolvedConfig] = hosts.map(createResolvedProxyConfig);
                receivedResolvedConfig = resolvedConfig;

                assert.equal(resolvedConfig.protocol, 'vless');
                assert.equal(resolvedConfig.transport, 'xhttp');
                assert.equal(resolvedConfig.security, 'tls');
                assert.equal(resolvedConfig.metadata.remark, 'Original Remark');

                return {
                    subscription: createVlessLink(hosts[0]),
                    contentType: 'text/plain',
                };
            },
        });
        const service = createService({
            renderTemplatesService,
            hostBalancerService: createRealHostBalancer({
                findManyByHostUuids: async () => [
                    createBalancer({
                        targets: [
                            createTarget({
                                overrideAddress: 'generator-target.example.com',
                                overridePort: 7443,
                            }),
                        ],
                    }),
                ],
            }),
        });

        const response = await service.getSubscriptionByShortUuid(createSrrContext(), 'short-user');

        assert.equal(receivedResolvedConfig.address, 'generator-target.example.com');
        assert.equal(receivedResolvedConfig.port, 7443);
        assert.match(String(response.body), /generator-target\.example\.com:7443/);
    });
});
