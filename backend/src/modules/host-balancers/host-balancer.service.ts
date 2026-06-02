import {
    HostBalancerAssignment,
    HostBalancerTarget,
    HostBalancerUnavailablePolicy,
} from '@prisma/client';

import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { fail, ok, TResult } from '@common/types';
import { ERRORS } from '@libs/contracts/constants';
import {
    PreviewHostBalancerCommand,
    UpdateHostBalancerCommand,
    UpdateHostBalancerTargetsCommand,
} from '@libs/contracts/commands';

import { HostWithRawInbound } from '@modules/hosts/entities/host-with-inbound-tag.entity';
import { UserEntity } from '@modules/users/entities';

import {
    HostBalancerNodeState,
    HostBalancerWithTargets,
    HostBalancersRepository,
} from './repositories/host-balancers.repository';

type TargetWithWarning = HostBalancerTarget & { warning?: string | null };
type AssignmentAction = 'none' | 'reused' | 'created' | 'reassigned' | 'skipped';
type DecisionAssignmentAction = Exclude<AssignmentAction, 'none'>;
type PreviewUserLookup = string | { userUuid?: string; shortUuid?: string };
type TargetDiagnostics = {
    targetUuid: string;
    nodeUuid?: string | null;
    trafficBytes?: string | null;
    weight?: number;
    score?: number;
    selected?: boolean;
    fallbackUsed?: boolean;
    reason?: string;
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

const TRAFFIC_FALLBACK_WARNING = 'Traffic data missing, fallback strategy used.';

@Injectable()
export class HostBalancerService {
    private readonly logger = new Logger(HostBalancerService.name);

    constructor(
        private readonly hostBalancersRepository: HostBalancersRepository,
        @Optional() private readonly configService?: ConfigService,
    ) {}

    public async getSettings(hostUuid: string): Promise<TResult<HostBalancerWithTargets | null>> {
        try {
            const settings = await this.hostBalancersRepository.findByHostUuid(hostUuid);
            return ok(settings ? this.withTargetWarnings(settings) : null);
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
                user.uuid,
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
                    userUuid: user.uuid,
                    host: inputHost,
                    balancer,
                    assignment: assignments.get(inputHost.uuid) ?? null,
                    assignmentCounts,
                    nodeStates,
                    persistAssignment: true,
                });

                await this.writeDecisionIfEnabled(user.uuid, inputHost, balancer, decision);

                if (decision.host) {
                    result.push(decision.host);
                }
            }

            return result;
        } catch (error) {
            this.logger.error(
                `Host balancer apply failed for user=${this.maskUuid(user.uuid)} hosts=${hosts
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
                    this.previewResponse(hostUuid, user.uuid, null, {
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
            const assignments = await this.hostBalancersRepository.findAssignmentsForUser(
                user.uuid,
                [hostUuid],
            );
            const nodeStates = await this.loadNodeStates([settings]);
            const hostForPreview = new HostWithRawInbound({
                uuid: hostUuid,
                address: host.address,
                port: 0,
                sni: null,
                host: null,
                path: null,
                configProfileInboundUuid: null,
                rawInbound: null,
                inboundTag: '',
                xrayJsonTemplate: null,
            });

            const decision = await this.resolveHostTarget({
                userUuid: user.uuid,
                host: hostForPreview,
                balancer: settings,
                assignment: assignments.get(hostUuid) ?? null,
                assignmentCounts,
                nodeStates,
                persistAssignment: false,
            });

            return ok(
                this.previewResponse(hostUuid, user.uuid, decision.selectedTarget, {
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
                    ...decision.diagnostics,
                    warnings: [
                        ...decision.diagnostics.warnings,
                        ...decision.diagnostics.excludedTargets
                            .map((target) => target.reason ?? '')
                            .filter(Boolean),
                    ],
                }),
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
            return ok(decisions);
        } catch (error) {
            this.logger.error(error);
            return fail(ERRORS.GET_HOST_BALANCER_DECISIONS_ERROR);
        }
    }

    private async resolveHostTarget(ctx: {
        userUuid: string;
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
                ? targetByUuid.get(ctx.assignment.targetUuid) ?? null
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
            const validation = this.validateTargetForHost(stickyTarget, ctx.host, ctx.nodeStates, true);
            if (validation.isValid) {
                if (ctx.persistAssignment) {
                    await this.hostBalancersRepository.touchAssignment(ctx.host.uuid, ctx.userUuid);
                }
                return this.resolved(ctx.host, stickyTarget, candidates, excludedTargets, 'reused', ctx.assignmentCounts);
            }
        }

        if (candidates.length === 0) {
            const fallback = this.resolveUnavailablePolicy(
                ctx.balancer.unavailablePolicy,
                ctx.host,
                stickyTarget,
                ctx.nodeStates,
            );
            return {
                host: fallback.host,
                selectedTarget: fallback.target,
                diagnostics: {
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
                },
            };
        }

        const selection = await this.selectTarget(ctx.balancer, candidates, ctx.assignmentCounts);
        const selected = selection.target;
        const assignment: AssignmentAction = ctx.assignment ? 'reassigned' : 'created';

        if (ctx.persistAssignment) {
            await this.hostBalancersRepository.upsertAssignment({
                hostUuid: ctx.host.uuid,
                userUuid: ctx.userUuid,
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
            selection,
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
            return this.selectionResult(target, candidates, assignmentCounts, true, trafficByNodeUuid, [
                TRAFFIC_FALLBACK_WARNING,
            ]);
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
        selection?: SelectTargetResult,
    ) {
        const diagnostics = selection ?? this.selectionResult(selected, candidates, assignmentCounts, false);
        return {
            host: this.cloneWithTargetOverrides(host, selected),
            selectedTarget: selected,
            diagnostics: {
                candidates: diagnostics.candidates,
                excludedTargets,
                selectedTarget: diagnostics.selectedTarget,
                warnings: diagnostics.warnings,
                assignment,
                finalHostOverrides: this.resolveFinalHostOverrides(host, selected),
            },
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
        userUuid: string,
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
                userUuid,
                targetUuid: decision.selectedTarget?.uuid ?? null,
                strategy: balancer.strategy,
                reason,
                diagnostics: this.toJsonSafe({
                    unavailablePolicy: balancer.unavailablePolicy,
                    assignmentAction,
                    excludedTargets: decision.diagnostics.excludedTargets.map((target) => ({
                        targetUuid: target.targetUuid,
                        nodeUuid: target.nodeUuid ?? null,
                        reason: target.reason,
                    })),
                    candidates: decision.diagnostics.candidates,
                    selectedTarget: decision.diagnostics.selectedTarget,
                    warnings: decision.diagnostics.warnings,
                    finalHostOverrides: decision.diagnostics.finalHostOverrides,
                }),
            });
        } catch (error) {
            this.logger.error(
                `Host balancer decision audit failed for user=${this.maskUuid(userUuid)} host=${this.maskUuid(
                    host.uuid,
                )}`,
                error instanceof Error ? error.stack : undefined,
            );
        }
    }

    private isDecisionAuditEnabled(): boolean {
        return (
            this.configService?.get<string>('HOST_BALANCER_DECISIONS_ENABLED', 'false') ??
            process.env.HOST_BALANCER_DECISIONS_ENABLED ??
            'false'
        ) === 'true';
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

    private previewResponse(
        hostUuid: string,
        userUuid: string,
        target: HostBalancerTarget | null,
        diagnostics: PreviewHostBalancerCommand.Response['response']['diagnostics'],
    ): PreviewHostBalancerCommand.Response['response'] {
        return {
            hostUuid,
            userUuid,
            target: target ? this.withWarning(target) : null,
            diagnostics,
        };
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

    private maskShortUuid(shortUuid: string): string {
        if (shortUuid.length <= 8) {
            return '***';
        }

        return `${shortUuid.slice(0, 4)}...${shortUuid.slice(-4)}`;
    }
}
