import {
    HostBalancerAssignment,
    HostBalancerStrategy,
    HostBalancerTrafficMetric,
    HostBalancerUnavailablePolicy,
    Prisma,
} from '@prisma/client';

import { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';

import {
    UpdateHostBalancerCommand,
    UpdateHostBalancerTargetsCommand,
} from '@libs/contracts/commands';

const INCLUDE_TARGETS = {
    targets: {
        orderBy: [{ priority: 'asc' }, { weight: 'desc' }, { createdAt: 'asc' }],
    },
} satisfies Prisma.HostBalancerInclude;

export type HostBalancerWithTargets = Prisma.HostBalancerGetPayload<{
    include: typeof INCLUDE_TARGETS;
}>;

export type HostBalancerNodeState = {
    uuid: string;
    name: string;
    address: string;
    port: number | null;
    isConnected: boolean;
    isConnecting: boolean;
    isDisabled: boolean;
    activeInboundUuids: Set<string>;
};

export type CreateHostBalancerDecisionDto = {
    hostUuid: string;
    userUuid: string;
    targetUuid: string | null;
    strategy: HostBalancerStrategy;
    reason: string;
    diagnostics: Prisma.InputJsonValue;
};

type HostBalancerDecisionFinalOverrides = {
    address: string;
    port: number;
    sni: string | null;
    host: string | null;
    path: string | null;
};

type HostBalancerDecisionExcludedTarget = {
    targetUuid: string;
    nodeUuid?: string | null;
    trafficBytes?: string | null;
    weight?: number;
    score?: number;
    selected?: boolean;
    fallbackUsed?: boolean;
    reason?: string;
};

@Injectable()
export class HostBalancersRepository {
    constructor(private readonly prisma: TransactionHost<TransactionalAdapterPrisma>) {}

    public async findHost(hostUuid: string) {
        return this.prisma.tx.hosts.findUnique({
            where: { uuid: hostUuid },
            select: {
                uuid: true,
                remark: true,
                address: true,
                port: true,
                configProfileInboundUuid: true,
            },
        });
    }

    public async findUser(userUuid: string) {
        return this.prisma.tx.users.findUnique({
            where: { uuid: userUuid },
            select: { uuid: true, shortUuid: true },
        });
    }

    public async findUserByShortUuid(shortUuid: string) {
        return this.prisma.tx.users.findUnique({
            where: { shortUuid },
            select: { uuid: true, shortUuid: true },
        });
    }

    public async findByHostUuid(hostUuid: string): Promise<HostBalancerWithTargets | null> {
        return this.prisma.tx.hostBalancer.findUnique({
            where: { hostUuid },
            include: INCLUDE_TARGETS,
        });
    }

    public async findManyByHostUuids(hostUuids: string[]): Promise<HostBalancerWithTargets[]> {
        if (hostUuids.length === 0) {
            return [];
        }

        return this.prisma.tx.hostBalancer.findMany({
            where: { hostUuid: { in: hostUuids } },
            include: INCLUDE_TARGETS,
        });
    }

    public async upsertSettings(
        hostUuid: string,
        dto: UpdateHostBalancerCommand.RequestBody,
    ): Promise<HostBalancerWithTargets> {
        return this.prisma.tx.hostBalancer.upsert({
            where: { hostUuid },
            create: {
                hostUuid,
                ...dto,
            },
            update: dto,
            include: INCLUDE_TARGETS,
        });
    }

    public async ensureBalancer(hostUuid: string): Promise<HostBalancerWithTargets> {
        return this.prisma.tx.hostBalancer.upsert({
            where: { hostUuid },
            create: { hostUuid },
            update: {},
            include: INCLUDE_TARGETS,
        });
    }

    public async replaceTargets(
        balancerUuid: string,
        targets: UpdateHostBalancerTargetsCommand.RequestBody['targets'],
    ): Promise<HostBalancerWithTargets> {
        await this.prisma.tx.hostBalancerTarget.deleteMany({
            where: { balancerUuid },
        });

        if (targets.length > 0) {
            await this.prisma.tx.hostBalancerTarget.createMany({
                data: targets.map((target) => ({
                    balancerUuid,
                    nodeUuid: target.nodeUuid ?? null,
                    enabled: target.enabled ?? true,
                    status: target.status ?? 'ACTIVE',
                    weight: target.weight ?? 1,
                    priority: target.priority ?? 100,
                    maxAssignedUsers: target.maxAssignedUsers ?? null,
                    overrideAddress: target.overrideAddress ?? null,
                    overridePort: target.overridePort ?? null,
                    overrideSni: target.overrideSni ?? null,
                    overrideHost: target.overrideHost ?? null,
                    overridePath: target.overridePath ?? null,
                })),
            });
        }

        return this.prisma.tx.hostBalancer.findUniqueOrThrow({
            where: { uuid: balancerUuid },
            include: INCLUDE_TARGETS,
        });
    }

    public async countAssignmentsByTarget(targetUuids: string[]): Promise<Map<string, number>> {
        if (targetUuids.length === 0) {
            return new Map();
        }

        const rows = await this.prisma.tx.hostBalancerAssignment.groupBy({
            by: ['targetUuid'],
            where: { targetUuid: { in: targetUuids } },
            _count: { targetUuid: true },
        });

        return new Map(rows.map((row) => [row.targetUuid, row._count.targetUuid]));
    }

    public async findAssignmentsForUser(
        userUuid: string,
        hostUuids: string[],
    ): Promise<Map<string, HostBalancerAssignment>> {
        if (hostUuids.length === 0) {
            return new Map();
        }

        const assignments = await this.prisma.tx.hostBalancerAssignment.findMany({
            where: {
                userUuid,
                hostUuid: { in: hostUuids },
            },
        });

        return new Map(assignments.map((assignment) => [assignment.hostUuid, assignment]));
    }

    public async upsertAssignment(dto: {
        hostUuid: string;
        userUuid: string;
        targetUuid: string;
        reason: string;
    }): Promise<HostBalancerAssignment> {
        return this.prisma.tx.hostBalancerAssignment.upsert({
            where: {
                hostUuid_userUuid: {
                    hostUuid: dto.hostUuid,
                    userUuid: dto.userUuid,
                },
            },
            create: {
                hostUuid: dto.hostUuid,
                userUuid: dto.userUuid,
                targetUuid: dto.targetUuid,
                reason: dto.reason,
                lastUsedAt: new Date(),
            },
            update: {
                targetUuid: dto.targetUuid,
                reason: dto.reason,
                lastUsedAt: new Date(),
            },
        });
    }

    public async touchAssignment(hostUuid: string, userUuid: string): Promise<void> {
        await this.prisma.tx.hostBalancerAssignment.update({
            where: {
                hostUuid_userUuid: {
                    hostUuid,
                    userUuid,
                },
            },
            data: {
                lastUsedAt: new Date(),
            },
        });
    }

    public async getNodeStates(nodeUuids: string[]): Promise<Map<string, HostBalancerNodeState>> {
        if (nodeUuids.length === 0) {
            return new Map();
        }

        const nodes = await this.prisma.tx.nodes.findMany({
            where: { uuid: { in: nodeUuids } },
            select: {
                uuid: true,
                name: true,
                address: true,
                port: true,
                isConnected: true,
                isConnecting: true,
                isDisabled: true,
                configProfileInboundsToNodes: {
                    select: {
                        configProfileInboundUuid: true,
                    },
                },
            },
        });

        return new Map(
            nodes.map((node) => [
                node.uuid,
                {
                    uuid: node.uuid,
                    name: node.name,
                    address: node.address,
                    port: node.port,
                    isConnected: node.isConnected,
                    isConnecting: node.isConnecting,
                    isDisabled: node.isDisabled,
                    activeInboundUuids: new Set(
                        node.configProfileInboundsToNodes.map(
                            (inbound) => inbound.configProfileInboundUuid,
                        ),
                    ),
                },
            ]),
        );
    }

    public async getNodeTrafficByMetric(
        nodeUuids: string[],
        metric: HostBalancerTrafficMetric | null,
    ): Promise<Map<string, bigint>> {
        if (nodeUuids.length === 0) {
            return new Map();
        }

        if (!metric || metric === 'CURRENT_PERIOD') {
            return this.getCurrentNodeTraffic(nodeUuids);
        }

        const since = this.resolveTrafficMetricStart(metric);
        const rows = await this.prisma.tx.nodesUsageHistory.groupBy({
            by: ['nodeUuid'],
            where: {
                nodeUuid: { in: nodeUuids },
                createdAt: { gte: since },
            },
            _sum: { totalBytes: true },
        });

        return new Map(rows.map((row) => [row.nodeUuid, row._sum.totalBytes ?? 0n]));
    }

    private async getCurrentNodeTraffic(nodeUuids: string[]): Promise<Map<string, bigint>> {
        const nodes = await this.prisma.tx.nodes.findMany({
            where: { uuid: { in: nodeUuids } },
            select: { uuid: true, trafficUsedBytes: true },
        });

        return new Map(nodes.map((node) => [node.uuid, node.trafficUsedBytes ?? 0n]));
    }

    private resolveTrafficMetricStart(
        metric: Exclude<HostBalancerTrafficMetric, 'CURRENT_PERIOD'>,
    ): Date {
        const now = Date.now();
        const hours = {
            LAST_1H: 1,
            LAST_6H: 6,
            LAST_24H: 24,
        }[metric];

        return new Date(now - hours * 60 * 60 * 1000);
    }

    public async getStats(hostUuid: string) {
        const assignmentsCount = await this.prisma.tx.hostBalancerAssignment.count({
            where: { hostUuid },
        });

        const rows = await this.prisma.tx.hostBalancerAssignment.groupBy({
            by: ['targetUuid'],
            where: { hostUuid },
            _count: { targetUuid: true },
        });

        return {
            assignmentsCount,
            targets: rows.map((row) => ({
                targetUuid: row.targetUuid,
                assignedUsers: row._count.targetUuid,
            })),
        };
    }

    public async createDecision(dto: CreateHostBalancerDecisionDto): Promise<void> {
        await this.prisma.tx.hostBalancerDecision.create({
            data: {
                hostUuid: dto.hostUuid,
                userUuid: dto.userUuid,
                targetUuid: dto.targetUuid,
                strategy: dto.strategy,
                reason: dto.reason,
                diagnostics: dto.diagnostics,
            },
        });
        void this.pruneDecisionRetention(5_000).catch(() => undefined);
    }

    public async listDecisions(hostUuid: string, limit: number) {
        const rows = await this.prisma.tx.hostBalancerDecision.findMany({
            where: { hostUuid },
            orderBy: { createdAt: 'desc' },
            take: limit,
        });

        return rows.map((row) => {
            const diagnostics: Record<string, unknown> =
                row.diagnostics &&
                typeof row.diagnostics === 'object' &&
                !Array.isArray(row.diagnostics)
                    ? (row.diagnostics as Record<string, unknown>)
                    : {};
            const unavailablePolicy = this.isUnavailablePolicy(diagnostics['unavailablePolicy'])
                ? diagnostics['unavailablePolicy']
                : 'HIDE_HOST';
            const assignmentAction = this.isDecisionAssignmentAction(
                diagnostics['assignmentAction'],
            )
                ? diagnostics['assignmentAction']
                : 'skipped';
            const excludedTargets = this.resolveDecisionExcludedTargets(
                diagnostics['excludedTargets'],
            );
            const candidates = this.resolveDecisionExcludedTargets(diagnostics['candidates']);
            const selectedTargets = this.resolveDecisionExcludedTargets(
                diagnostics['selectedTarget'] ? [diagnostics['selectedTarget']] : [],
            );
            const warnings = Array.isArray(diagnostics['warnings'])
                ? diagnostics['warnings'].filter((warning): warning is string => {
                      return typeof warning === 'string';
                  })
                : [];
            const finalHostOverrides = this.resolveDecisionFinalOverrides(
                diagnostics['finalHostOverrides'],
            );
            const safeDiagnostics = this.sanitizeDecisionDiagnostics({
                unavailablePolicy,
                assignmentAction,
                candidates,
                excludedTargets,
                selectedTarget: selectedTargets[0] ?? null,
                warnings,
                finalHostOverrides,
            });

            return {
                uuid: row.uuid,
                hostUuid: row.hostUuid,
                userUuid: this.maskUuid(row.userUuid),
                userUuidMasked: this.maskUuid(row.userUuid),
                targetUuid: row.targetUuid,
                strategy: row.strategy,
                reason: row.reason,
                unavailablePolicy,
                assignmentAction,
                candidates,
                excludedTargets,
                selectedTarget: selectedTargets[0] ?? null,
                warnings,
                finalHostOverrides,
                diagnostics: safeDiagnostics,
                createdAt: row.createdAt,
            };
        });
    }

    public async pruneDecisionRetention(keepLatest: number): Promise<number> {
        const staleRows = await this.prisma.tx.hostBalancerDecision.findMany({
            orderBy: { createdAt: 'desc' },
            skip: keepLatest,
            select: { uuid: true },
        });

        if (staleRows.length === 0) {
            return 0;
        }

        const result = await this.prisma.tx.hostBalancerDecision.deleteMany({
            where: { uuid: { in: staleRows.map((row) => row.uuid) } },
        });

        return result.count;
    }

    private maskUuid(uuid: string): string {
        if (uuid.length <= 12) {
            return '***';
        }

        return `${uuid.slice(0, 8)}...${uuid.slice(-4)}`;
    }

    private isUnavailablePolicy(value: unknown): value is HostBalancerUnavailablePolicy {
        return (
            value === 'HIDE_HOST' || value === 'ORIGINAL_HOST' || value === 'KEEP_LAST_IF_POSSIBLE'
        );
    }

    private isDecisionAssignmentAction(
        value: unknown,
    ): value is 'reused' | 'created' | 'reassigned' | 'skipped' {
        return (
            value === 'reused' ||
            value === 'created' ||
            value === 'reassigned' ||
            value === 'skipped'
        );
    }

    private resolveDecisionExcludedTargets(value: unknown): HostBalancerDecisionExcludedTarget[] {
        if (!Array.isArray(value)) {
            return [];
        }

        return value
            .filter((item): item is Record<string, unknown> => {
                return !!item && typeof item === 'object' && !Array.isArray(item);
            })
            .filter((item) => typeof item['targetUuid'] === 'string')
            .map((item) => ({
                targetUuid: item['targetUuid'] as string,
                nodeUuid:
                    typeof item['nodeUuid'] === 'string' || item['nodeUuid'] === null
                        ? item['nodeUuid']
                        : undefined,
                trafficBytes:
                    typeof item['trafficBytes'] === 'string' || item['trafficBytes'] === null
                        ? item['trafficBytes']
                        : undefined,
                weight: typeof item['weight'] === 'number' ? item['weight'] : undefined,
                score: typeof item['score'] === 'number' ? item['score'] : undefined,
                selected: typeof item['selected'] === 'boolean' ? item['selected'] : undefined,
                fallbackUsed:
                    typeof item['fallbackUsed'] === 'boolean' ? item['fallbackUsed'] : undefined,
                reason: typeof item['reason'] === 'string' ? item['reason'] : undefined,
            }));
    }

    private sanitizeDecisionDiagnostics(value: Record<string, unknown>): Record<string, unknown> {
        return JSON.parse(JSON.stringify(value));
    }

    private resolveDecisionFinalOverrides(
        value: unknown,
    ): HostBalancerDecisionFinalOverrides | null {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            return null;
        }

        const overrides = value as Record<string, unknown>;
        if (typeof overrides['address'] !== 'string' || typeof overrides['port'] !== 'number') {
            return null;
        }

        return {
            address: overrides['address'],
            port: overrides['port'],
            sni:
                typeof overrides['sni'] === 'string' || overrides['sni'] === null
                    ? overrides['sni']
                    : null,
            host:
                typeof overrides['host'] === 'string' || overrides['host'] === null
                    ? overrides['host']
                    : null,
            path:
                typeof overrides['path'] === 'string' || overrides['path'] === null
                    ? overrides['path']
                    : null,
        };
    }
}
