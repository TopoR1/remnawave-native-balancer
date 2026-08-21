import {
    HostBalancerAssignment,
    HostBalancerTarget,
    HostBalancerUnavailablePolicy,
} from '@prisma/client';

import { Injectable, Logger, Optional } from '@nestjs/common';

import { TypedConfigService } from '@common/config/app-config';
import { fail, ok, TResult } from '@common/types';
import { prettyBytesUtil } from '@common/utils/bytes/pretty-bytes.util';
import {
    PreviewHostBalancerCommand,
    UpdateHostBalancerCommand,
    UpdateHostBalancerTargetsCommand,
    ValidateHostBalancerTargetsCommand,
} from '@libs/contracts/commands';
import { ERRORS } from '@libs/contracts/constants';

import { HostWithRawInbound } from '@modules/hosts/entities/host-with-inbound-tag.entity';
import { UserEntity } from '@modules/users/entities';

import {
    HostBalancerNodeState,
    HostBalancerWithTargets,
    HostBalancersRepository,
} from './repositories/host-balancers.repository';

type TargetWithWarning = HostBalancerTarget & { warning?: string | null };
type EnrichedHostBalancerTarget = TargetWithWarning & {
    nodeName?: string | null;
    nodeAddress?: string | null;
    countryCode?: string | null;
    countryEmoji?: string | null;
    profileUuid?: string | null;
    profileName?: string | null;
    inboundUuid?: string | null;
    inboundName?: string | null;
    inboundTag?: string | null;
    inboundType?: string | null;
    inboundNetwork?: string | null;
    inboundPort?: number | null;
    compatibilityStatus?: TargetDiagnostics['compatibilityStatus'];
    assignmentsCount?: number | null;
    trafficBytes?: string | null;
    formattedTraffic?: string | null;
};
type EnrichedHostBalancerWithTargets = Omit<HostBalancerWithTargets, 'targets'> & {
    targets: EnrichedHostBalancerTarget[];
};
type AssignmentAction = 'none' | 'reused' | 'created' | 'reassigned' | 'skipped';
type DecisionAssignmentAction = Exclude<AssignmentAction, 'none'>;
type PreviewAssignmentAction = 'preview_only' | 'reused' | 'would_create' | 'would_reassign';
type PreviewUserLookup = string | { userUuid?: string; shortUuid?: string };
type TargetDiagnostics = {
    targetUuid: string;
    nodeUuid?: string | null;
    nodeName?: string | null;
    nodeAddress?: string | null;
    countryCode?: string | null;
    countryEmoji?: string | null;
    profileUuid?: string | null;
    profileName?: string | null;
    inboundUuid?: string | null;
    inboundName?: string | null;
    inboundTag?: string | null;
    inboundType?: string | null;
    inboundNetwork?: string | null;
    inboundPort?: number | null;
    overrideAddress?: string | null;
    overridePort?: number | null;
    address?: string | null;
    port?: number | null;
    status?: HostBalancerTarget['status'];
    compatibilityStatus?:
        | 'compatible'
        | 'missing_inbound'
        | 'node_disconnected'
        | 'node_disabled'
        | 'unknown';
    trafficBytes?: string | null;
    trafficSource?: 'snapshot' | 'node_current' | 'not_loaded' | 'unavailable';
    weight?: number;
    priority?: number;
    assignmentsCount?: number;
    assignmentsSource?: 'snapshot';
    assignments?: number;
    score?: number;
    selected?: boolean;
    fallbackUsed?: boolean;
    reason?: string;
    severity?: 'info' | 'warning' | 'error';
};
type HostApplyDiagnostics = {
    candidates: TargetDiagnostics[];
    excludedTargets: TargetDiagnostics[];
    selectedTarget: TargetDiagnostics | null;
    warnings: string[];
    assignment: AssignmentAction;
    finalHostOverrides: {
        address: string;
        port: number;
        sni: string | null;
        host: string | null;
        path: string | null;
    } | null;
};
type SelectTargetResult = {
    target: HostBalancerTarget;
    candidates: TargetDiagnostics[];
    selectedTarget: TargetDiagnostics;
    warnings: string[];
};
type HostBalancerValidationSeverity = 'ok' | 'warning' | 'error';

const TRAFFIC_FALLBACK_WARNING = 'Traffic data missing, fallback strategy used.';

@Injectable()
export class HostBalancerService {
    private readonly logger = new Logger(HostBalancerService.name);

    constructor(
        private readonly hostBalancersRepository: HostBalancersRepository,
        @Optional() private readonly configService?: TypedConfigService,
    ) {}

    public async getSettings(
        hostUuid: string,
    ): Promise<TResult<EnrichedHostBalancerWithTargets | null>> {
        try {
            const [settings, host] = await Promise.all([
                this.hostBalancersRepository.findByHostUuid(hostUuid),
                this.hostBalancersRepository.findHost(hostUuid),
            ]);

            if (!settings) {
                return ok(null);
            }

            return ok(
                await this.enrichSettings(
                    settings,
                    host ? this.hostRecordToRawInbound(host) : null,
                ),
            );
        } catch (error) {
            this.logger.error(error);
            return fail(ERRORS.GET_HOST_BALANCER_ERROR);
        }
    }

    public async updateSettings(
        hostUuid: string,
        dto: UpdateHostBalancerCommand.RequestBody,
    ): Promise<TResult<HostBalancerWithTargets>> {
        try {
            const host = await this.hostBalancersRepository.findHost(hostUuid);
            if (!host) {
                return fail(ERRORS.HOST_NOT_FOUND);
            }

            if (this.isTrafficAwareStrategy(dto.strategy)) {
                const current = await this.hostBalancersRepository.findByHostUuid(hostUuid);
                const targets = current?.targets ?? [];
                if (targets.some((target) => !target.nodeUuid)) {
                    return fail(ERRORS.INVALID_HOST_BALANCER_TARGETS);
                }
            }

            const settings = await this.hostBalancersRepository.upsertSettings(hostUuid, dto);
            return ok(this.withTargetWarnings(settings));
        } catch (error) {
            this.logger.error(error);
            return fail(ERRORS.UPDATE_HOST_BALANCER_ERROR);
        }
    }

    public async toggle(
        hostUuid: string,
        enabled: boolean,
    ): Promise<TResult<HostBalancerWithTargets>> {
        return this.updateSettings(hostUuid, { enabled });
    }

    public async listTargets(hostUuid: string): Promise<TResult<TargetWithWarning[]>> {
        try {
            const settings = await this.hostBalancersRepository.findByHostUuid(hostUuid);
            return ok(settings ? this.withWarnings(settings.targets) : []);
        } catch (error) {
            this.logger.error(error);
            return fail(ERRORS.GET_HOST_BALANCER_ERROR);
        }
    }

    public async updateTargets(
        hostUuid: string,
        dto: UpdateHostBalancerTargetsCommand.RequestBody,
    ): Promise<TResult<TargetWithWarning[]>> {
        try {
            const host = await this.hostBalancersRepository.findHost(hostUuid);
            if (!host) {
                return fail(ERRORS.HOST_NOT_FOUND);
            }

            const balancer = await this.hostBalancersRepository.ensureBalancer(hostUuid);

            if (
                this.isTrafficAwareStrategy(balancer.strategy) &&
                dto.targets.some((target) => !target.nodeUuid)
            ) {
                return fail(ERRORS.INVALID_HOST_BALANCER_TARGETS);
            }

            const updated = await this.hostBalancersRepository.replaceTargets(
                balancer.uuid,
                dto.targets,
            );

            return ok(this.withWarnings(updated.targets));
        } catch (error) {
            this.logger.error(error);
            return fail(ERRORS.UPDATE_HOST_BALANCER_TARGETS_ERROR);
        }
    }

    public async validateTargets(
        hostUuid: string,
        dto: ValidateHostBalancerTargetsCommand.RequestBody,
    ): Promise<TResult<ValidateHostBalancerTargetsCommand.Response['response']>> {
        try {
            const host = await this.hostBalancersRepository.findHost(hostUuid);
            if (!host) {
                return fail(ERRORS.HOST_NOT_FOUND);
            }

            const nodeUuids = Array.from(
                new Set(
                    dto.targets
                        .map((target) => target.nodeUuid)
                        .filter((nodeUuid): nodeUuid is string => !!nodeUuid),
                ),
            );
            const nodeStates = await this.hostBalancersRepository.getNodeStates(nodeUuids);
            const hostForValidation = this.hostRecordToRawInbound(host);

            const targets = dto.targets.map((target) =>
                this.validateDraftTargetForHost(target, hostForValidation, nodeStates),
            );

            return ok({
                targets,
                summary: {
                    total: targets.length,
                    valid: targets.filter((target) => target.valid).length,
                    warnings: targets.filter((target) => target.severity === 'warning').length,
                    errors: targets.filter((target) => target.severity === 'error').length,
                },
            });
        } catch (error) {
            this.logger.error(error);
            return fail(ERRORS.GET_HOST_BALANCER_ERROR);
        }
    }

    public async applyToHostsForUser(
        user: UserEntity,
        hosts: HostWithRawInbound[],
    ): Promise<HostWithRawInbound[]> {
        try {
            if (hosts.length === 0) {
                return hosts;
            }

            const hostUuids = hosts.map((host) => host.uuid);
            const balancers = await this.hostBalancersRepository.findManyByHostUuids(hostUuids);
            const balancerByHostUuid = new Map(
                balancers.map((balancer) => [balancer.hostUuid, balancer]),
            );
            const enabledBalancers = balancers.filter((balancer) => balancer.enabled);

            if (enabledBalancers.length === 0) {
                return hosts;
            }

            const assignments = await this.hostBalancersRepository.findAssignmentsForUser(
                user.id,
                enabledBalancers.map((balancer) => balancer.hostUuid),
            );
            const targetUuids = enabledBalancers.flatMap((balancer) =>
                balancer.targets.map((target) => target.uuid),
            );
            const assignmentCounts =
                await this.hostBalancersRepository.countAssignmentsByTarget(targetUuids);
            const nodeStates = await this.loadNodeStates(enabledBalancers);

            const result: HostWithRawInbound[] = [];

            for (const inputHost of hosts) {
                const balancer = balancerByHostUuid.get(inputHost.uuid);
                if (!balancer || !balancer.enabled) {
                    result.push(inputHost);
                    continue;
                }

                const decision = await this.resolveHostTarget({
                    userId: user.id,
                    host: inputHost,
                    balancer,
                    assignment: assignments.get(inputHost.uuid) ?? null,
                    assignmentCounts,
                    nodeStates,
                    persistAssignment: true,
                });

                await this.writeDecisionIfEnabled(user.id, inputHost, balancer, decision);

                if (decision.host) {
                    result.push(decision.host);
                }
            }

            return result;
        } catch (error) {
            this.logger.error(
                `Host balancer apply failed for user=${user.id.toString()} hosts=${hosts
                    .map((host) => this.maskUuid(host.uuid))
                    .join(',')}`,
                error instanceof Error ? error.stack : undefined,
            );
            return hosts;
        }
    }

    public async previewSelection(
        userLookupInput: PreviewUserLookup,
        hostUuid: string,
    ): Promise<TResult<PreviewHostBalancerCommand.Response['response']>> {
        try {
            const userLookup = this.normalizePreviewUserLookup(userLookupInput);
            const [host, user, settings] = await Promise.all([
                this.hostBalancersRepository.findHost(hostUuid),
                this.resolvePreviewUser(userLookup),
                this.hostBalancersRepository.findByHostUuid(hostUuid),
            ]);

            if (!host) {
                return fail(ERRORS.HOST_NOT_FOUND);
            }
            if (!user) {
                return fail(ERRORS.USER_NOT_FOUND);
            }

            if (!settings) {
                return ok(
                    this.previewResponse(host, user, null, {
                        enabled: false,
                        strategy: 'LEAST_ASSIGNED',
                        unavailablePolicy: 'HIDE_HOST',
                        stickyEnabled: true,
                        candidatesCount: 0,
                        selectedTargetUuid: null,
                        reasons: ['Host balancer settings do not exist.'],
                        warnings: [],
                        wouldCreateAssignment: false,
                        resolvedUserUuid: user.uuid,
                        shortUuidMasked: this.maskShortUuid(user.shortUuid),
                        existingAssignment: null,
                        assignmentAction: 'preview_only',
                        candidates: [],
                        excludedTargets: [],
                        selectedTarget: null,
                        assignment: 'none',
                        finalHostOverrides: null,
                    }),
                );
            }

            const assignmentCounts = await this.hostBalancersRepository.countAssignmentsByTarget(
                settings.targets.map((target) => target.uuid),
            );
            const assignments = await this.hostBalancersRepository.findAssignmentsForUser(user.id, [
                hostUuid,
            ]);
            const existingAssignment = assignments.get(hostUuid) ?? null;
            const nodeStates = await this.loadNodeStates([settings]);
            const hostForPreview = this.hostRecordToRawInbound(host);

            const decision = await this.resolveHostTarget({
                userId: user.id,
                host: hostForPreview,
                balancer: settings,
                assignment: existingAssignment,
                assignmentCounts,
                nodeStates,
                persistAssignment: false,
            });

            return ok(
                this.previewResponse(
                    host,
                    user,
                    decision.selectedTarget,
                    this.enrichPreviewDiagnostics(
                        {
                            enabled: settings.enabled,
                            strategy: settings.strategy,
                            unavailablePolicy: settings.unavailablePolicy,
                            stickyEnabled: settings.stickyEnabled,
                            candidatesCount: decision.diagnostics.candidates.length,
                            selectedTargetUuid: decision.selectedTarget?.uuid ?? null,
                            reasons: decision.selectedTarget
                                ? [`Selected target by ${settings.strategy}.`]
                                : ['No eligible target selected.'],
                            wouldCreateAssignment: false,
                            resolvedUserUuid: user.uuid,
                            shortUuidMasked: this.maskShortUuid(user.shortUuid),
                            existingAssignment: existingAssignment
                                ? {
                                      targetUuid: existingAssignment.targetUuid,
                                      reason: existingAssignment.reason,
                                      lastUsedAt: existingAssignment.lastUsedAt,
                                  }
                                : null,
                            assignmentAction: this.previewAssignmentAction(
                                decision.diagnostics.assignment,
                            ),
                            ...decision.diagnostics,
                            warnings: [
                                ...decision.diagnostics.warnings,
                                ...decision.diagnostics.excludedTargets
                                    .map((target) => target.reason ?? '')
                                    .filter(Boolean),
                            ],
                        },
                        settings.targets,
                        nodeStates,
                        assignmentCounts,
                        hostForPreview.configProfileInboundUuid,
                    ),
                ),
            );
        } catch (error) {
            this.logger.error(error);
            return fail(ERRORS.PREVIEW_HOST_BALANCER_ERROR);
        }
    }

    public async getStats(hostUuid: string) {
        try {
            const host = await this.hostBalancersRepository.findHost(hostUuid);
            if (!host) {
                return fail(ERRORS.HOST_NOT_FOUND);
            }

            const stats = await this.hostBalancersRepository.getStats(hostUuid);
            return ok({
                hostUuid,
                ...stats,
            });
        } catch (error) {
            this.logger.error(error);
            return fail(ERRORS.GET_HOST_BALANCER_STATS_ERROR);
        }
    }

    public async getDecisions(hostUuid: string, limit = 50) {
        try {
            const host = await this.hostBalancersRepository.findHost(hostUuid);
            if (!host) {
                return fail(ERRORS.HOST_NOT_FOUND);
            }

            const decisions = await this.hostBalancersRepository.listDecisions(hostUuid, limit);
            return ok(
                decisions.map((decision) => ({
                    ...decision,
                    userUuid: this.maskUuidIfNeeded(decision.userUuid),
                    userUuidMasked: this.maskUuidIfNeeded(
                        decision.userUuidMasked ?? decision.userUuid,
                    ),
                })),
            );
        } catch (error) {
            this.logger.error(error);
            return fail(ERRORS.GET_HOST_BALANCER_DECISIONS_ERROR);
        }
    }

    private async resolveHostTarget(ctx: {
        userId: bigint;
        host: HostWithRawInbound;
        balancer: HostBalancerWithTargets;
        assignment: HostBalancerAssignment | null;
        assignmentCounts: Map<string, number>;
        nodeStates: Map<string, HostBalancerNodeState>;
        persistAssignment: boolean;
    }): Promise<{
        host: HostWithRawInbound | null;
        selectedTarget: HostBalancerTarget | null;
        diagnostics: HostApplyDiagnostics;
    }> {
        const targetByUuid = new Map(ctx.balancer.targets.map((target) => [target.uuid, target]));
        const stickyTarget =
            ctx.assignment && ctx.balancer.stickyEnabled
                ? (targetByUuid.get(ctx.assignment.targetUuid) ?? null)
                : null;
        const shouldReuseSticky =
            !!stickyTarget &&
            !(
                this.isTrafficAwareStrategy(ctx.balancer.strategy) &&
                ctx.balancer.rebalanceExistingAssignmentsByTraffic
            );
        const candidates: HostBalancerTarget[] = [];
        const excludedTargets: TargetDiagnostics[] = [];

        for (const target of ctx.balancer.targets) {
            const validation = this.validateTargetForHost(target, ctx.host, ctx.nodeStates, false);
            if (!validation.isValid) {
                excludedTargets.push(
                    this.targetDiagnostics(target, {
                        reason: validation.reason,
                        selected: false,
                        fallbackUsed: false,
                    }),
                );
                continue;
            }

            const assigned = ctx.assignmentCounts.get(target.uuid) ?? 0;
            if (target.maxAssignedUsers !== null && assigned >= target.maxAssignedUsers) {
                excludedTargets.push(
                    this.targetDiagnostics(target, {
                        reason: 'maxAssignedUsers reached',
                        selected: false,
                        fallbackUsed: false,
                    }),
                );
                continue;
            }

            candidates.push(target);
        }

        if (stickyTarget && shouldReuseSticky) {
            const validation = this.validateTargetForHost(
                stickyTarget,
                ctx.host,
                ctx.nodeStates,
                true,
            );
            if (validation.isValid) {
                if (ctx.persistAssignment) {
                    await this.hostBalancersRepository.touchAssignment(ctx.host.uuid, ctx.userId);
                }
                return this.resolved(
                    ctx.host,
                    stickyTarget,
                    candidates,
                    excludedTargets,
                    'reused',
                    ctx.assignmentCounts,
                    ctx.nodeStates,
                );
            }
        }

        if (candidates.length === 0) {
            const fallback = this.resolveUnavailablePolicy(
                ctx.balancer.unavailablePolicy,
                ctx.host,
                stickyTarget,
                ctx.nodeStates,
            );
            const diagnostics: HostApplyDiagnostics = {
                candidates: [],
                excludedTargets,
                selectedTarget: fallback.target ? { targetUuid: fallback.target.uuid } : null,
                warnings: [],
                assignment: fallback.target ? 'reused' : 'skipped',
                finalHostOverrides: fallback.target
                    ? this.resolveFinalHostOverrides(ctx.host, fallback.target)
                    : fallback.host
                      ? this.resolveHostFields(fallback.host)
                      : null,
            };

            return {
                host: fallback.host,
                selectedTarget: fallback.target,
                diagnostics: this.enrichTargetDiagnostics(
                    diagnostics,
                    ctx.balancer.targets,
                    ctx.nodeStates,
                    ctx.assignmentCounts,
                    ctx.host.configProfileInboundUuid,
                ),
            };
        }

        const selection = await this.selectTarget(ctx.balancer, candidates, ctx.assignmentCounts);
        const selected = selection.target;
        const assignment: AssignmentAction = ctx.assignment ? 'reassigned' : 'created';

        if (ctx.persistAssignment) {
            await this.hostBalancersRepository.upsertAssignment({
                hostUuid: ctx.host.uuid,
                userId: ctx.userId,
                targetUuid: selected.uuid,
                reason: `${assignment}:${ctx.balancer.strategy}`,
            });
        }

        return this.resolved(
            ctx.host,
            selected,
            candidates,
            excludedTargets,
            assignment,
            ctx.assignmentCounts,
            ctx.nodeStates,
            selection,
            ctx.host.configProfileInboundUuid,
        );
    }

    private async selectTarget(
        settings: HostBalancerWithTargets,
        candidates: HostBalancerTarget[],
        assignmentCounts: Map<string, number>,
    ): Promise<SelectTargetResult> {
        if (this.isTrafficAwareStrategy(settings.strategy)) {
            return this.selectByTraffic(settings, candidates, assignmentCounts);
        }

        let target: HostBalancerTarget;
        switch (settings.strategy) {
            case 'RANDOM':
                target = candidates[Math.floor(Math.random() * candidates.length)];
                break;
            case 'WEIGHTED':
                target = this.selectByScore(candidates, assignmentCounts, true);
                break;
            case 'PRIORITY_FAILOVER':
                target = [...candidates].sort((a, b) => a.priority - b.priority)[0];
                break;
            case 'LEAST_ASSIGNED':
            default:
                target = this.selectByScore(candidates, assignmentCounts, true);
                break;
        }

        return this.selectionResult(target, candidates, assignmentCounts, false);
    }

    private async selectByTraffic(
        settings: HostBalancerWithTargets,
        candidates: HostBalancerTarget[],
        assignmentCounts: Map<string, number>,
    ): Promise<SelectTargetResult> {
        const nodeUuids = Array.from(
            new Set(
                candidates
                    .map((target) => target.nodeUuid)
                    .filter((nodeUuid): nodeUuid is string => !!nodeUuid),
            ),
        );
        const trafficByNodeUuid = await this.hostBalancersRepository.getNodeTrafficByMetric(
            nodeUuids,
            settings.trafficMetric ?? 'CURRENT_PERIOD',
        );
        const hasMissingTraffic = candidates.some(
            (target) => !target.nodeUuid || !trafficByNodeUuid.has(target.nodeUuid),
        );

        if (hasMissingTraffic) {
            const target = this.selectByScore(candidates, assignmentCounts, true);
            return this.selectionResult(
                target,
                candidates,
                assignmentCounts,
                true,
                trafficByNodeUuid,
                [TRAFFIC_FALLBACK_WARNING],
            );
        }

        const weighted = settings.strategy === 'WEIGHTED_LEAST_TRAFFIC';
        const target = [...candidates].sort((a, b) => {
            const diff =
                this.trafficScore(a, trafficByNodeUuid, weighted) -
                this.trafficScore(b, trafficByNodeUuid, weighted);
            if (diff !== 0) return diff;
            return a.priority - b.priority;
        })[0];

        return {
            target,
            candidates: candidates.map((candidate) =>
                this.targetDiagnostics(candidate, {
                    trafficBytes: this.targetTrafficBytes(candidate, trafficByNodeUuid),
                    score: this.trafficScore(candidate, trafficByNodeUuid, weighted),
                    selected: candidate.uuid === target.uuid,
                    fallbackUsed: false,
                }),
            ),
            selectedTarget: this.targetDiagnostics(target, {
                trafficBytes: this.targetTrafficBytes(target, trafficByNodeUuid),
                score: this.trafficScore(target, trafficByNodeUuid, weighted),
                selected: true,
                fallbackUsed: false,
            }),
            warnings: [],
        };
    }

    private selectByScore(
        candidates: HostBalancerTarget[],
        assignmentCounts: Map<string, number>,
        weighted: boolean,
    ): HostBalancerTarget {
        return [...candidates].sort((a, b) => {
            const diff =
                this.assignmentScore(a, assignmentCounts, weighted) -
                this.assignmentScore(b, assignmentCounts, weighted);
            if (diff !== 0) return diff;
            return a.priority - b.priority;
        })[0];
    }

    private assignmentScore(
        target: HostBalancerTarget,
        assignmentCounts: Map<string, number>,
        weighted: boolean,
    ): number {
        const assigned = assignmentCounts.get(target.uuid) ?? 0;
        const capacity = target.maxAssignedUsers ?? 1;
        const weight = weighted ? target.weight : 1;
        return assigned / (capacity * weight);
    }

    private trafficScore(
        target: HostBalancerTarget,
        trafficByNodeUuid: Map<string, bigint>,
        weighted: boolean,
    ): number {
        const trafficBytes = this.targetTrafficBytes(target, trafficByNodeUuid) ?? 0n;
        return Number(trafficBytes) / (weighted ? target.weight : 1);
    }

    private targetTrafficBytes(
        target: HostBalancerTarget,
        trafficByNodeUuid: Map<string, bigint>,
    ): bigint | null {
        if (!target.nodeUuid || !trafficByNodeUuid.has(target.nodeUuid)) {
            return null;
        }

        return trafficByNodeUuid.get(target.nodeUuid) ?? 0n;
    }

    private selectionResult(
        target: HostBalancerTarget,
        candidates: HostBalancerTarget[],
        assignmentCounts: Map<string, number>,
        fallbackUsed: boolean,
        trafficByNodeUuid: Map<string, bigint> = new Map(),
        warnings: string[] = [],
    ): SelectTargetResult {
        return {
            target,
            candidates: candidates.map((candidate) =>
                this.targetDiagnostics(candidate, {
                    trafficBytes: this.targetTrafficBytes(candidate, trafficByNodeUuid),
                    score: this.assignmentScore(candidate, assignmentCounts, true),
                    selected: candidate.uuid === target.uuid,
                    fallbackUsed,
                }),
            ),
            selectedTarget: this.targetDiagnostics(target, {
                trafficBytes: this.targetTrafficBytes(target, trafficByNodeUuid),
                score: this.assignmentScore(target, assignmentCounts, true),
                selected: true,
                fallbackUsed,
            }),
            warnings,
        };
    }

    private targetDiagnostics(
        target: HostBalancerTarget,
        data: {
            trafficBytes?: bigint | null;
            score?: number;
            selected?: boolean;
            fallbackUsed?: boolean;
            reason?: string;
        } = {},
    ): TargetDiagnostics {
        return {
            targetUuid: target.uuid,
            nodeUuid: target.nodeUuid,
            trafficBytes:
                data.trafficBytes === undefined
                    ? undefined
                    : data.trafficBytes === null
                      ? null
                      : data.trafficBytes.toString(),
            weight: target.weight,
            score: data.score,
            selected: data.selected,
            fallbackUsed: data.fallbackUsed,
            reason: data.reason,
        };
    }

    private validateDraftTargetForHost(
        input: ValidateHostBalancerTargetsCommand.RequestBody['targets'][number],
        host: HostWithRawInbound,
        nodeStates: Map<string, HostBalancerNodeState>,
    ): ValidateHostBalancerTargetsCommand.Response['response']['targets'][number] {
        const target = this.draftInputToTarget(input);
        const node = target.nodeUuid ? (nodeStates.get(target.nodeUuid) ?? null) : null;
        const runtimeValidation = this.validateTargetForHost(target, host, nodeStates, false);
        const reasons: string[] = [];
        let severityRank = 0;

        const addReason = (reason: string, reasonSeverity: HostBalancerValidationSeverity) => {
            if (!reasons.includes(reason)) {
                reasons.push(reason);
            }
            severityRank = Math.max(severityRank, this.validationSeverityRank(reasonSeverity));
        };

        const activeTarget = target.enabled && target.status === 'ACTIVE';
        const inactiveTarget =
            !target.enabled || target.status === 'DISABLED' || target.status === 'DEAD';
        const hasRequiredInbound = this.resolveHasRequiredInbound(host, node);

        if (!target.nodeUuid) {
            addReason('address-only target: traffic/status checks unavailable', 'warning');
        }

        if (target.overrideAddress && node && target.overrideAddress !== node.address) {
            addReason('overrideAddress differs from selected node address', 'warning');
        }

        if (hasRequiredInbound === false) {
            addReason('target node lacks required inbound', activeTarget ? 'error' : 'warning');
        }

        if (!runtimeValidation.isValid) {
            const runtimeSeverity =
                inactiveTarget || target.status === 'DRAINING' ? 'warning' : 'error';
            addReason(runtimeValidation.reason, runtimeSeverity);
        }

        const severity = this.validationSeverityFromRank(severityRank);

        return {
            localId: input.localId ?? null,
            uuid: input.uuid ?? null,
            nodeUuid: target.nodeUuid,
            valid: severity !== 'error',
            severity,
            reasons,
            nodeName: node?.name ?? null,
            nodeAddress: node?.address ?? null,
            nodeStatus: this.resolveNodeStatus(node),
            hasRequiredInbound,
        };
    }

    private draftInputToTarget(
        input: ValidateHostBalancerTargetsCommand.RequestBody['targets'][number],
    ): HostBalancerTarget {
        return {
            uuid: input.uuid ?? '00000000-0000-4000-8000-000000000000',
            balancerUuid: '00000000-0000-4000-8000-000000000000',
            nodeUuid: input.nodeUuid ?? null,
            enabled: input.enabled ?? true,
            status: input.status ?? 'ACTIVE',
            weight: input.weight ?? 1,
            priority: input.priority ?? 100,
            maxAssignedUsers: input.maxAssignedUsers ?? null,
            overrideAddress: input.overrideAddress ?? null,
            overridePort: input.overridePort ?? null,
            overrideSni: input.overrideSni ?? null,
            overrideHost: input.overrideHost ?? null,
            overridePath: input.overridePath ?? null,
            createdAt: new Date(0),
            updatedAt: new Date(0),
        };
    }

    private hostRecordToRawInbound(host: {
        uuid: string;
        remark?: string;
        address: string;
        port: number;
        configProfileInboundUuid: string | null;
    }): HostWithRawInbound {
        return new HostWithRawInbound({
            uuid: host.uuid,
            viewPosition: 0,
            remark: host.remark ?? '',
            address: host.address,
            port: host.port,
            path: null,
            sni: null,
            host: null,
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
            mihomoIpVersion: null,
            tags: [],
            isHidden: false,
            overrideSniFromAddress: false,
            keepSniBlank: false,
            vlessRouteId: null,
            shuffleHost: false,
            mihomoX25519: false,
            configProfileUuid: null,
            configProfileInboundUuid: host.configProfileInboundUuid,
            xrayJsonTemplateUuid: null,
            excludeFromSubscriptionTypes: [],
            rawInbound: null,
            inboundTag: '',
            xrayJsonTemplate: null,
        });
    }

    private resolveHasRequiredInbound(
        host: HostWithRawInbound,
        node: HostBalancerNodeState | null,
    ): boolean | null {
        if (!node || !host.configProfileInboundUuid || node.activeInboundUuids.size === 0) {
            return null;
        }

        return node.activeInboundUuids.has(host.configProfileInboundUuid);
    }

    private resolveNodeStatus(
        node: HostBalancerNodeState | null,
    ): 'connected' | 'connecting' | 'disabled' | 'disconnected' | 'unknown' {
        if (!node) {
            return 'unknown';
        }
        if (node.isDisabled) {
            return 'disabled';
        }
        if (node.isConnecting) {
            return 'connecting';
        }
        if (node.isConnected) {
            return 'connected';
        }

        return 'disconnected';
    }

    private validationSeverityRank(severity: HostBalancerValidationSeverity): number {
        const order = { ok: 0, warning: 1, error: 2 } satisfies Record<
            HostBalancerValidationSeverity,
            number
        >;

        return order[severity];
    }

    private validationSeverityFromRank(rank: number): HostBalancerValidationSeverity {
        if (rank >= 2) {
            return 'error';
        }
        if (rank === 1) {
            return 'warning';
        }

        return 'ok';
    }

    private async loadNodeStates(
        balancers: HostBalancerWithTargets[],
    ): Promise<Map<string, HostBalancerNodeState>> {
        const nodeUuids = Array.from(
            new Set(
                balancers
                    .flatMap((balancer) => balancer.targets)
                    .map((target) => target.nodeUuid)
                    .filter((nodeUuid): nodeUuid is string => !!nodeUuid),
            ),
        );
        return this.hostBalancersRepository.getNodeStates(nodeUuids);
    }

    private validateTargetForHost(
        target: HostBalancerTarget,
        host: HostWithRawInbound,
        nodeStates: Map<string, HostBalancerNodeState>,
        allowDraining: boolean,
    ): { isValid: true } | { isValid: false; reason: string } {
        if (!target.enabled) return { isValid: false, reason: 'target disabled' };
        if (target.status === 'DISABLED' || target.status === 'DEAD') {
            return { isValid: false, reason: `target status ${target.status}` };
        }
        if (target.status === 'DRAINING' && !allowDraining) {
            return { isValid: false, reason: 'target draining' };
        }

        if (target.nodeUuid) {
            const node = nodeStates.get(target.nodeUuid);
            if (!node) return { isValid: false, reason: 'target node not found' };
            if (node.isDisabled) return { isValid: false, reason: 'target node disabled' };
            if (!node.isConnected || node.isConnecting) {
                return { isValid: false, reason: 'target node disconnected' };
            }
            if (
                host.configProfileInboundUuid &&
                node.activeInboundUuids.size > 0 &&
                !node.activeInboundUuids.has(host.configProfileInboundUuid)
            ) {
                return { isValid: false, reason: 'target node lacks required inbound' };
            }
        }

        return { isValid: true };
    }

    private resolveUnavailablePolicy(
        policy: HostBalancerUnavailablePolicy,
        host: HostWithRawInbound,
        assignmentTarget: HostBalancerTarget | null,
        nodeStates: Map<string, HostBalancerNodeState>,
    ): { host: HostWithRawInbound | null; target: HostBalancerTarget | null } {
        if (policy === 'ORIGINAL_HOST') {
            return { host, target: null };
        }

        if (
            policy === 'KEEP_LAST_IF_POSSIBLE' &&
            assignmentTarget &&
            this.validateTargetForHost(assignmentTarget, host, nodeStates, true).isValid
        ) {
            return {
                host: this.cloneWithTargetOverrides(host, assignmentTarget),
                target: assignmentTarget,
            };
        }

        return { host: null, target: null };
    }

    private resolved(
        host: HostWithRawInbound,
        selected: HostBalancerTarget,
        candidates: HostBalancerTarget[],
        excludedTargets: TargetDiagnostics[],
        assignment: AssignmentAction,
        assignmentCounts: Map<string, number>,
        nodeStates: Map<string, HostBalancerNodeState>,
        selection?: SelectTargetResult,
        requiredInboundUuid?: string | null,
    ) {
        const diagnostics =
            selection ?? this.selectionResult(selected, candidates, assignmentCounts, false);
        return {
            host: this.cloneWithTargetOverrides(host, selected),
            selectedTarget: selected,
            diagnostics: this.enrichTargetDiagnostics(
                {
                    candidates: diagnostics.candidates,
                    excludedTargets,
                    selectedTarget: diagnostics.selectedTarget,
                    warnings: diagnostics.warnings,
                    assignment,
                    finalHostOverrides: this.resolveFinalHostOverrides(host, selected),
                },
                candidates,
                nodeStates,
                assignmentCounts,
                requiredInboundUuid ?? host.configProfileInboundUuid,
            ),
        };
    }

    private cloneWithTargetOverrides(
        host: HostWithRawInbound,
        target: HostBalancerTarget,
    ): HostWithRawInbound {
        return new HostWithRawInbound({
            ...host,
            address: target.overrideAddress ?? host.address,
            port: target.overridePort ?? host.port,
            sni: target.overrideSni ?? host.sni,
            host: target.overrideHost ?? host.host,
            path: target.overridePath ?? host.path,
        });
    }

    private resolveFinalHostOverrides(host: HostWithRawInbound, target: HostBalancerTarget) {
        return {
            address: target.overrideAddress ?? host.address,
            port: target.overridePort ?? host.port,
            sni: target.overrideSni ?? host.sni,
            host: target.overrideHost ?? host.host,
            path: target.overridePath ?? host.path,
        };
    }

    private resolveHostFields(host: HostWithRawInbound) {
        return {
            address: host.address,
            port: host.port,
            sni: host.sni,
            host: host.host,
            path: host.path,
        };
    }

    private async writeDecisionIfEnabled(
        userId: bigint,
        host: HostWithRawInbound,
        balancer: HostBalancerWithTargets,
        decision: {
            host: HostWithRawInbound | null;
            selectedTarget: HostBalancerTarget | null;
            diagnostics: HostApplyDiagnostics;
        },
    ): Promise<void> {
        if (!this.isDecisionAuditEnabled()) {
            return;
        }

        const assignmentAction = this.decisionAssignmentAction(decision.diagnostics.assignment);
        const reason = this.resolveDecisionReason(balancer, decision, assignmentAction);

        try {
            await this.hostBalancersRepository.createDecision({
                hostUuid: host.uuid,
                userId,
                targetUuid: decision.selectedTarget?.uuid ?? null,
                strategy: balancer.strategy,
                reason,
                diagnostics: this.toJsonSafe({
                    unavailablePolicy: balancer.unavailablePolicy,
                    assignmentAction,
                    excludedTargets: decision.diagnostics.excludedTargets,
                    candidates: decision.diagnostics.candidates,
                    selectedTarget: decision.diagnostics.selectedTarget,
                    warnings: decision.diagnostics.warnings,
                    finalHostOverrides: decision.diagnostics.finalHostOverrides,
                }),
            });
        } catch (error) {
            this.logger.error(
                `Host balancer decision audit failed for user=${userId.toString()} host=${this.maskUuid(
                    host.uuid,
                )}`,
                error instanceof Error ? error.stack : undefined,
            );
        }
    }

    private isDecisionAuditEnabled(): boolean {
        return (
            this.configService?.get('HOST_BALANCER_DECISIONS_ENABLED') ??
            process.env.HOST_BALANCER_DECISIONS_ENABLED === 'true'
        );
    }

    private decisionAssignmentAction(assignment: AssignmentAction): DecisionAssignmentAction {
        return assignment === 'none' ? 'skipped' : assignment;
    }

    private resolveDecisionReason(
        balancer: HostBalancerWithTargets,
        decision: {
            host: HostWithRawInbound | null;
            selectedTarget: HostBalancerTarget | null;
            diagnostics: HostApplyDiagnostics;
        },
        assignmentAction: DecisionAssignmentAction,
    ): string {
        if (decision.selectedTarget) {
            return `selected:${balancer.strategy}:${assignmentAction}`;
        }

        if (decision.host) {
            return `unavailable:${balancer.unavailablePolicy}:original_host`;
        }

        return `unavailable:${balancer.unavailablePolicy}:hidden`;
    }

    private toJsonSafe(value: unknown) {
        return JSON.parse(JSON.stringify(value));
    }

    private previewAssignmentAction(assignment: AssignmentAction): PreviewAssignmentAction {
        if (assignment === 'reused') {
            return 'reused';
        }
        if (assignment === 'created') {
            return 'would_create';
        }
        if (assignment === 'reassigned') {
            return 'would_reassign';
        }

        return 'preview_only';
    }

    private previewResponse(
        host: {
            uuid: string;
            remark: string;
        },
        user: {
            uuid: string;
            shortUuid: string | null;
        },
        target: HostBalancerTarget | null,
        diagnostics: PreviewHostBalancerCommand.Response['response']['diagnostics'],
    ): PreviewHostBalancerCommand.Response['response'] {
        const fallbackPolicyResult = this.previewFallbackPolicyResult(
            diagnostics.unavailablePolicy,
            diagnostics.assignmentAction,
            diagnostics.finalHostOverrides ?? null,
            diagnostics.selectedTarget ?? null,
            diagnostics.candidatesCount,
        );

        return {
            hostUuid: host.uuid,
            userUuid: user.uuid,
            resolvedUserUuid: user.uuid,
            shortUuid: user.shortUuid,
            shortUuidMasked: this.maskShortUuid(user.shortUuid),
            hostRemark: host.remark,
            balancerEnabled: diagnostics.enabled,
            strategy: diagnostics.strategy,
            stickyEnabled: diagnostics.stickyEnabled,
            unavailablePolicy: diagnostics.unavailablePolicy,
            existingAssignment: diagnostics.existingAssignment,
            assignmentAction: this.previewAssignmentActionForSimulator(
                diagnostics.assignmentAction,
                fallbackPolicyResult?.result ?? 'none',
            ),
            selectedTarget: diagnostics.selectedTarget ?? null,
            candidates: diagnostics.candidates ?? [],
            excludedTargets: diagnostics.excludedTargets ?? [],
            warnings: diagnostics.warnings,
            finalHostOverrides: diagnostics.finalHostOverrides ?? null,
            fallbackPolicyResult,
            target: target ? this.withWarning(target) : null,
            diagnostics,
        };
    }

    private previewAssignmentActionForSimulator(
        assignmentAction: PreviewAssignmentAction,
        fallbackResult: 'hidden' | 'original_host' | 'last_assignment' | 'none',
    ): 'preview_only' | 'would_create' | 'would_reuse' | 'would_reassign' | 'would_fallback' {
        if (fallbackResult !== 'none') {
            return 'would_fallback';
        }
        if (assignmentAction === 'reused') {
            return 'would_reuse';
        }
        if (assignmentAction === 'would_create' || assignmentAction === 'would_reassign') {
            return assignmentAction;
        }

        return 'preview_only';
    }

    private previewFallbackPolicyResult(
        policy: HostBalancerUnavailablePolicy,
        assignmentAction: PreviewAssignmentAction,
        finalHostOverrides: HostApplyDiagnostics['finalHostOverrides'],
        selectedTarget: TargetDiagnostics | null,
        candidatesCount: number,
    ): PreviewHostBalancerCommand.Response['response']['fallbackPolicyResult'] {
        if (selectedTarget) {
            if (assignmentAction === 'reused' && finalHostOverrides && candidatesCount === 0) {
                return {
                    policy,
                    result: 'last_assignment',
                    message: 'Last assignment will be used.',
                };
            }

            return null;
        }

        if (assignmentAction === 'reused') {
            return {
                policy,
                result: 'last_assignment',
                message: 'Last assignment will be used.',
            };
        }

        if (policy === 'ORIGINAL_HOST' && finalHostOverrides) {
            return {
                policy,
                result: 'original_host',
                message: 'Original Host will be used.',
            };
        }

        if (policy === 'HIDE_HOST') {
            return {
                policy,
                result: 'hidden',
                message: 'Host will be hidden.',
            };
        }

        return { policy, result: 'none' };
    }

    private enrichPreviewDiagnostics(
        diagnostics: PreviewHostBalancerCommand.Response['response']['diagnostics'],
        targets: HostBalancerTarget[],
        nodeStates: Map<string, HostBalancerNodeState>,
        assignmentCounts: Map<string, number>,
        requiredInboundUuid: string | null,
    ): PreviewHostBalancerCommand.Response['response']['diagnostics'] {
        return this.enrichTargetDiagnostics(
            diagnostics,
            targets,
            nodeStates,
            assignmentCounts,
            requiredInboundUuid,
        ) as PreviewHostBalancerCommand.Response['response']['diagnostics'];
    }

    private enrichTargetDiagnostics<
        T extends {
            candidates?: TargetDiagnostics[];
            excludedTargets?: TargetDiagnostics[];
            selectedTarget?: TargetDiagnostics | null;
        },
    >(
        diagnostics: T,
        targets: HostBalancerTarget[],
        nodeStates: Map<string, HostBalancerNodeState>,
        assignmentCounts: Map<string, number>,
        requiredInboundUuid: string | null,
    ): T {
        const targetByUuid = new Map(targets.map((target) => [target.uuid, target]));
        const enrich = (target: TargetDiagnostics): TargetDiagnostics => {
            const source = targetByUuid.get(target.targetUuid);
            const node = source?.nodeUuid ? nodeStates.get(source.nodeUuid) : null;
            const inbound = requiredInboundUuid
                ? (node?.inbounds ?? []).find((item) => item.uuid === requiredInboundUuid)
                : null;
            const assignmentsCount = assignmentCounts.get(target.targetUuid) ?? 0;
            const trafficBytes =
                target.trafficBytes !== undefined && target.trafficBytes !== null
                    ? target.trafficBytes
                    : node?.trafficUsedBytes !== undefined && node?.trafficUsedBytes !== null
                      ? node.trafficUsedBytes.toString()
                      : undefined;

            return {
                ...target,
                nodeUuid: target.nodeUuid ?? source?.nodeUuid ?? null,
                nodeName: node?.name ?? null,
                nodeAddress: node?.address ?? null,
                countryCode: node?.countryCode ?? null,
                countryEmoji: node?.countryEmoji ?? null,
                profileUuid: node?.activeConfigProfileUuid ?? inbound?.profileUuid ?? null,
                profileName: node?.activeConfigProfileName ?? inbound?.profileName ?? null,
                inboundUuid: inbound?.uuid ?? null,
                inboundName: inbound?.tag ?? null,
                inboundTag: inbound?.tag ?? null,
                inboundType: inbound?.type ?? null,
                inboundNetwork: inbound?.network ?? null,
                inboundPort: inbound?.port ?? null,
                overrideAddress: source?.overrideAddress ?? null,
                overridePort: source?.overridePort ?? null,
                address: target.address ?? source?.overrideAddress ?? node?.address ?? null,
                port: target.port ?? source?.overridePort ?? node?.port ?? null,
                status: source?.status,
                compatibilityStatus:
                    target.compatibilityStatus ??
                    this.resolveTargetCompatibilityStatus(target.reason, node ?? null, inbound),
                weight: source?.weight ?? target.weight,
                priority: source?.priority,
                assignments: target.assignments ?? assignmentsCount,
                assignmentsCount: target.assignmentsCount ?? assignmentsCount,
                assignmentsSource: target.assignmentsSource ?? 'snapshot',
                trafficBytes,
                trafficSource:
                    target.trafficSource ??
                    (trafficBytes === undefined
                        ? 'not_loaded'
                        : target.trafficBytes === undefined || target.trafficBytes === null
                          ? 'node_current'
                          : trafficBytes === null
                            ? 'unavailable'
                            : 'snapshot'),
                severity: target.reason ? this.previewTargetSeverity(target.reason) : 'info',
            };
        };

        return {
            ...diagnostics,
            candidates: (diagnostics.candidates ?? []).map(enrich),
            excludedTargets: (diagnostics.excludedTargets ?? []).map(enrich),
            selectedTarget: diagnostics.selectedTarget ? enrich(diagnostics.selectedTarget) : null,
        };
    }

    private resolveTargetCompatibilityStatus(
        reason: string | undefined,
        node: HostBalancerNodeState | null,
        inbound:
            | {
                  uuid: string;
              }
            | null
            | undefined,
    ): TargetDiagnostics['compatibilityStatus'] {
        if (reason === 'target node lacks required inbound') {
            return 'missing_inbound';
        }
        if (reason === 'target node disconnected') {
            return 'node_disconnected';
        }
        if (reason === 'target node disabled') {
            return 'node_disabled';
        }
        if (!node) {
            return 'unknown';
        }
        if (node.isDisabled) {
            return 'node_disabled';
        }
        if (!node.isConnected || node.isConnecting) {
            return 'node_disconnected';
        }

        return inbound ? 'compatible' : 'unknown';
    }

    private previewTargetSeverity(reason: string): 'info' | 'warning' | 'error' {
        if (
            reason === 'target node lacks required inbound' ||
            reason === 'target disabled' ||
            reason === 'target node disconnected' ||
            reason === 'target node disabled' ||
            reason === 'maxAssignedUsers reached'
        ) {
            return 'error';
        }

        return 'warning';
    }

    private normalizePreviewUserLookup(userLookupInput: PreviewUserLookup): {
        userUuid?: string;
        shortUuid?: string;
    } {
        if (typeof userLookupInput === 'string') {
            return { userUuid: userLookupInput };
        }

        return userLookupInput;
    }

    private async resolvePreviewUser(userLookup: { userUuid?: string; shortUuid?: string }) {
        if (userLookup.userUuid) {
            return this.hostBalancersRepository.findUser(userLookup.userUuid);
        }

        if (userLookup.shortUuid) {
            return this.hostBalancersRepository.findUserByShortUuid(userLookup.shortUuid);
        }

        return null;
    }

    private withTargetWarnings<T extends HostBalancerWithTargets>(settings: T): T {
        return {
            ...settings,
            targets: this.withWarnings(settings.targets),
        };
    }

    private async enrichSettings(
        settings: HostBalancerWithTargets,
        host: HostWithRawInbound | null,
    ): Promise<EnrichedHostBalancerWithTargets> {
        const [assignmentCounts, nodeStates] = await Promise.all([
            this.hostBalancersRepository.countAssignmentsByTarget(
                settings.targets.map((target) => target.uuid),
            ),
            this.loadNodeStates([settings]),
        ]);

        return {
            ...settings,
            targets: settings.targets.map((target) =>
                this.enrichStoredTarget(
                    target,
                    nodeStates,
                    assignmentCounts,
                    host?.configProfileInboundUuid ?? null,
                ),
            ),
        };
    }

    private enrichStoredTarget(
        target: HostBalancerTarget,
        nodeStates: Map<string, HostBalancerNodeState>,
        assignmentCounts: Map<string, number>,
        requiredInboundUuid: string | null,
    ): EnrichedHostBalancerTarget {
        const node = target.nodeUuid ? (nodeStates.get(target.nodeUuid) ?? null) : null;
        const inbound = requiredInboundUuid
            ? (node?.inbounds ?? []).find((item) => item.uuid === requiredInboundUuid)
            : null;
        const trafficBytes =
            node?.trafficUsedBytes === undefined || node?.trafficUsedBytes === null
                ? null
                : node.trafficUsedBytes.toString();

        return this.withWarning({
            ...target,
            nodeName: node?.name ?? null,
            nodeAddress: node?.address ?? null,
            countryCode: node?.countryCode ?? null,
            countryEmoji: node?.countryEmoji ?? null,
            profileUuid: node?.activeConfigProfileUuid ?? inbound?.profileUuid ?? null,
            profileName: node?.activeConfigProfileName ?? inbound?.profileName ?? null,
            inboundUuid: inbound?.uuid ?? null,
            inboundName: inbound?.tag ?? null,
            inboundTag: inbound?.tag ?? null,
            inboundType: inbound?.type ?? null,
            inboundNetwork: inbound?.network ?? null,
            inboundPort: inbound?.port ?? null,
            compatibilityStatus: this.resolveStoredTargetCompatibilityStatus(
                node,
                inbound,
                requiredInboundUuid,
            ),
            assignmentsCount: assignmentCounts.get(target.uuid) ?? 0,
            trafficBytes,
            formattedTraffic:
                trafficBytes === null ? null : prettyBytesUtil(trafficBytes, true, 3, true),
        });
    }

    private resolveStoredTargetCompatibilityStatus(
        node: HostBalancerNodeState | null,
        inbound:
            | {
                  uuid: string;
              }
            | null
            | undefined,
        requiredInboundUuid: string | null,
    ): TargetDiagnostics['compatibilityStatus'] {
        if (!node) {
            return 'unknown';
        }
        if (node.isDisabled) {
            return 'node_disabled';
        }
        if (!node.isConnected || node.isConnecting) {
            return 'node_disconnected';
        }
        if (requiredInboundUuid && !inbound) {
            return 'missing_inbound';
        }
        if (requiredInboundUuid && inbound) {
            return 'compatible';
        }

        return 'unknown';
    }

    private withWarnings<T extends HostBalancerTarget>(
        targets: T[],
    ): Array<T & { warning: string | null }> {
        return targets.map((target) => this.withWarning(target));
    }

    private withWarning<T extends HostBalancerTarget>(target: T): T & { warning: string | null } {
        return {
            ...target,
            warning: target.overrideAddress
                ? null
                : 'No overrideAddress is set; original host.address will be used.',
        };
    }

    private isTrafficAwareStrategy(strategy?: string): boolean {
        return strategy === 'LEAST_TRAFFIC' || strategy === 'WEIGHTED_LEAST_TRAFFIC';
    }

    private maskUuid(uuid: string): string {
        if (uuid.length <= 12) {
            return '***';
        }

        return `${uuid.slice(0, 8)}...${uuid.slice(-4)}`;
    }

    private maskUuidIfNeeded(uuid: string): string {
        if (uuid.includes('...')) {
            return uuid;
        }

        return this.maskUuid(uuid);
    }

    private maskShortUuid(shortUuid: string | null): string | null {
        if (!shortUuid) {
            return null;
        }

        if (shortUuid.length <= 8) {
            return '***';
        }

        return `${shortUuid.slice(0, 4)}...${shortUuid.slice(-4)}`;
    }
}
