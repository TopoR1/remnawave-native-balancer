import { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';

import { RemnawaveSettingsEntity } from '../entities';

const DEFAULT_REMNAAWAVE_SETTINGS_ID = 1;

@Injectable()
export class RemnawaveSettingsRepository {
    constructor(private readonly prisma: TransactionHost<TransactionalAdapterPrisma>) {}

    public async create(entity: RemnawaveSettingsEntity): Promise<RemnawaveSettingsEntity> {
        const result = await this.prisma.tx.remnawaveSettings.create({
            data: {
                id: entity.id,
                passkeySettings: entity.passkeySettings,
                hostBalancerGlobalEnabled: entity.hostBalancerGlobalEnabled,
            } as never,
        });

        return new RemnawaveSettingsEntity(result);
    }

    public async findById(id: number): Promise<RemnawaveSettingsEntity | null> {
        const result = await this.prisma.tx.remnawaveSettings.findUnique({
            where: { id },
        });
        if (!result) {
            return null;
        }
        return new RemnawaveSettingsEntity(result);
    }

    public async getSettings(): Promise<RemnawaveSettingsEntity> {
        const result = await this.prisma.tx.remnawaveSettings.findFirstOrThrow();
        return new RemnawaveSettingsEntity(result);
    }

    public async update({
        id = DEFAULT_REMNAAWAVE_SETTINGS_ID,
        ...data
    }: Partial<RemnawaveSettingsEntity>): Promise<RemnawaveSettingsEntity> {
        const result = await this.prisma.tx.remnawaveSettings.update({
            where: {
                id,
            },
            data: data as never,
        });

        return new RemnawaveSettingsEntity(result);
    }

    public async getInitDate(): Promise<Date> {
        const result = await this.prisma.tx.$queryRaw<{ started_at: Date }[]>`
            SELECT started_at
            FROM _prisma_migrations
            ORDER BY started_at ASC
            LIMIT 1
        `;

        if (!result.length || !result[0].started_at) {
            return new Date();
        }

        const date = new Date(result[0].started_at);

        if (isNaN(date.getTime())) {
            return new Date();
        }

        return date;
    }

    public async getHostBalancerSummary(): Promise<{
        enabledHosts: number;
        activeTargets: number;
        warnings: number;
        errors: number;
    }> {
        const [enabledHosts, targets] = await Promise.all([
            this.prisma.tx.hostBalancer.count({
                where: { enabled: true },
            }),
            this.prisma.tx.hostBalancerTarget.findMany({
                where: {
                    balancer: {
                        enabled: true,
                    },
                },
                select: {
                    nodeUuid: true,
                    enabled: true,
                    status: true,
                    overrideAddress: true,
                    balancer: {
                        select: {
                            host: {
                                select: {
                                    configProfileInboundUuid: true,
                                },
                            },
                        },
                    },
                    node: {
                        select: {
                            address: true,
                            isConnected: true,
                            isConnecting: true,
                            isDisabled: true,
                            configProfileInboundsToNodes: {
                                select: {
                                    configProfileInboundUuid: true,
                                },
                            },
                        },
                    },
                },
            }),
        ]);

        let activeTargets = 0;
        let warnings = 0;
        let errors = 0;

        for (const target of targets) {
            const isActive = target.enabled && target.status === 'ACTIVE';
            const isDisabled = !target.enabled || target.status === 'DISABLED';

            if (isActive) {
                activeTargets += 1;
            }

            if (!target.nodeUuid) {
                warnings += 1;
                continue;
            }

            if (!target.node) {
                if (isActive) {
                    errors += 1;
                } else {
                    warnings += 1;
                }
                continue;
            }

            const requiredInboundUuid = target.balancer.host.configProfileInboundUuid;
            const hasRequiredInbound =
                !requiredInboundUuid ||
                target.node.configProfileInboundsToNodes.some(
                    (inbound) => inbound.configProfileInboundUuid === requiredInboundUuid,
                );

            if (!hasRequiredInbound) {
                if (isActive) {
                    errors += 1;
                } else if (isDisabled) {
                    warnings += 1;
                }
            }

            if (isActive && (target.node.isDisabled || !target.node.isConnected)) {
                errors += 1;
            }

            if (
                target.overrideAddress &&
                target.node.address &&
                target.overrideAddress !== target.node.address
            ) {
                warnings += 1;
            }
        }

        return {
            enabledHosts,
            activeTargets,
            warnings,
            errors,
        };
    }
}
