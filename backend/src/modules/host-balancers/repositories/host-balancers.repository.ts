import { HostBalancerAssignment, HostBalancerTrafficMetric, Prisma } from '@prisma/client';

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
    isConnected: boolean;
    isConnecting: boolean;
    isDisabled: boolean;
    activeInboundUuids: Set<string>;
};

@Injectable()
export class HostBalancersRepository {
    constructor(private readonly prisma: TransactionHost<TransactionalAdapterPrisma>) {}

    public async findHost(hostUuid: string) {
        return this.prisma.tx.hosts.findUnique({
            where: { uuid: hostUuid },
            select: { uuid: true, address: true },
        });
    }

    public async findUser(userUuid: string) {
        return this.prisma.tx.users.findUnique({
            where: { uuid: userUuid },
            select: { uuid: true },
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

    private resolveTrafficMetricStart(metric: Exclude<HostBalancerTrafficMetric, 'CURRENT_PERIOD'>): Date {
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
}
