import { z } from 'zod';

import {
    HOST_BALANCER_STRATEGIES,
    HOST_BALANCER_TARGET_STATUSES,
    HOST_BALANCER_TRAFFIC_METRICS,
    HOST_BALANCER_UNAVAILABLE_POLICIES,
} from '../constants';

export const HostBalancerStrategySchema = z.nativeEnum(HOST_BALANCER_STRATEGIES);
export const HostBalancerUnavailablePolicySchema = z.nativeEnum(HOST_BALANCER_UNAVAILABLE_POLICIES);
export const HostBalancerTrafficMetricSchema = z.nativeEnum(HOST_BALANCER_TRAFFIC_METRICS);
export const HostBalancerTargetStatusSchema = z.nativeEnum(HOST_BALANCER_TARGET_STATUSES);
const DateTimeSchema = z
    .string()
    .datetime()
    .transform((str) => new Date(str));

export const HostBalancerTargetSchema = z.object({
    uuid: z.string().uuid(),
    balancerUuid: z.string().uuid(),
    nodeUuid: z.string().uuid().nullable(),
    enabled: z.boolean(),
    status: HostBalancerTargetStatusSchema,
    weight: z.number().int().min(1),
    priority: z.number().int().min(0),
    maxAssignedUsers: z.number().int().min(1).nullable(),
    overrideAddress: z.string().nullable(),
    overridePort: z.number().int().min(1).max(65535).nullable(),
    overrideSni: z.string().nullable(),
    overrideHost: z.string().nullable(),
    overridePath: z.string().nullable(),
    warning: z.string().nullable().optional(),
    createdAt: DateTimeSchema,
    updatedAt: DateTimeSchema,
});

export const HostBalancerSchema = z.object({
    uuid: z.string().uuid(),
    hostUuid: z.string().uuid(),
    enabled: z.boolean(),
    strategy: HostBalancerStrategySchema,
    unavailablePolicy: HostBalancerUnavailablePolicySchema,
    stickyEnabled: z.boolean(),
    rebalanceExistingAssignmentsByTraffic: z.boolean(),
    trafficMetric: HostBalancerTrafficMetricSchema.nullable(),
    targets: z.array(HostBalancerTargetSchema).optional(),
    createdAt: DateTimeSchema,
    updatedAt: DateTimeSchema,
});

const HostBalancerPreviewDiagnosticsTargetSchema = z.object({
    targetUuid: z.string().uuid(),
    nodeUuid: z.string().uuid().nullable().optional(),
    nodeName: z.string().nullable().optional(),
    nodeAddress: z.string().nullable().optional(),
    countryCode: z.string().nullable().optional(),
    countryEmoji: z.string().nullable().optional(),
    profileUuid: z.string().uuid().nullable().optional(),
    inboundUuid: z.string().uuid().nullable().optional(),
    inboundTag: z.string().nullable().optional(),
    inboundType: z.string().nullable().optional(),
    inboundNetwork: z.string().nullable().optional(),
    inboundPort: z.number().int().nullable().optional(),
    overrideAddress: z.string().nullable().optional(),
    overridePort: z.number().int().nullable().optional(),
    address: z.string().nullable().optional(),
    port: z.number().int().nullable().optional(),
    status: HostBalancerTargetStatusSchema.optional(),
    compatibilityStatus: z
        .enum(['compatible', 'missing_inbound', 'node_disconnected', 'node_disabled', 'unknown'])
        .optional(),
    trafficBytes: z.string().nullable().optional(),
    trafficSource: z.enum(['snapshot', 'node_current', 'not_loaded', 'unavailable']).optional(),
    weight: z.number().int().min(1).optional(),
    priority: z.number().int().min(0).optional(),
    assignmentsCount: z.number().int().min(0).optional(),
    assignmentsSource: z.enum(['snapshot']).optional(),
    assignments: z.number().int().min(0).optional(),
    score: z.number().optional(),
    selected: z.boolean().optional(),
    fallbackUsed: z.boolean().optional(),
    reason: z.string().optional(),
    severity: z.enum(['info', 'warning', 'error']).optional(),
});

const HostBalancerPreviewFinalOverridesSchema = z
    .object({
        address: z.string(),
        port: z.number().int(),
        sni: z.string().nullable(),
        host: z.string().nullable(),
        path: z.string().nullable(),
    })
    .nullable();

const HostBalancerPreviewExistingAssignmentSchema = z
    .object({
        targetUuid: z.string().uuid(),
        reason: z.string().nullable(),
        lastUsedAt: DateTimeSchema,
    })
    .nullable();

const HostBalancerPreviewAssignmentActionSchema = z.enum([
    'preview_only',
    'would_create',
    'would_reuse',
    'would_reassign',
    'would_fallback',
]);

export const HostBalancerPreviewSchema = z.object({
    hostUuid: z.string().uuid(),
    userUuid: z.string().uuid(),
    resolvedUserUuid: z.string().uuid().optional(),
    shortUuid: z.string().nullable().optional(),
    shortUuidMasked: z.string().nullable().optional(),
    hostRemark: z.string().nullable().optional(),
    balancerEnabled: z.boolean().optional(),
    strategy: HostBalancerStrategySchema.optional(),
    stickyEnabled: z.boolean().optional(),
    unavailablePolicy: HostBalancerUnavailablePolicySchema.optional(),
    existingAssignment: HostBalancerPreviewExistingAssignmentSchema.optional(),
    assignmentAction: HostBalancerPreviewAssignmentActionSchema.optional(),
    selectedTarget: HostBalancerPreviewDiagnosticsTargetSchema.nullable().optional(),
    candidates: z.array(HostBalancerPreviewDiagnosticsTargetSchema).optional(),
    excludedTargets: z.array(HostBalancerPreviewDiagnosticsTargetSchema).optional(),
    warnings: z.array(z.string()).optional(),
    finalHostOverrides: HostBalancerPreviewFinalOverridesSchema.optional(),
    fallbackPolicyResult: z
        .object({
            policy: HostBalancerUnavailablePolicySchema,
            result: z.enum(['hidden', 'original_host', 'last_assignment', 'none']),
            message: z.string().optional(),
        })
        .nullable()
        .optional(),
    target: HostBalancerTargetSchema.nullable(),
    diagnostics: z.object({
        enabled: z.boolean(),
        strategy: HostBalancerStrategySchema,
        unavailablePolicy: HostBalancerUnavailablePolicySchema,
        stickyEnabled: z.boolean(),
        candidatesCount: z.number().int().min(0),
        selectedTargetUuid: z.string().uuid().nullable(),
        reasons: z.array(z.string()),
        warnings: z.array(z.string()),
        wouldCreateAssignment: z.literal(false),
        resolvedUserUuid: z.string().uuid(),
        shortUuidMasked: z.string().nullable().optional(),
        existingAssignment: HostBalancerPreviewExistingAssignmentSchema,
        assignmentAction: z.enum(['preview_only', 'reused', 'would_create', 'would_reassign']),
        candidates: z.array(HostBalancerPreviewDiagnosticsTargetSchema).optional(),
        excludedTargets: z.array(HostBalancerPreviewDiagnosticsTargetSchema).optional(),
        selectedTarget: HostBalancerPreviewDiagnosticsTargetSchema.nullable().optional(),
        assignment: z.enum(['none', 'reused', 'created', 'reassigned', 'skipped']).optional(),
        finalHostOverrides: HostBalancerPreviewFinalOverridesSchema.optional(),
    }),
});

export const HostBalancerStatsSchema = z.object({
    hostUuid: z.string().uuid(),
    assignmentsCount: z.number().int().min(0),
    targets: z.array(
        z.object({
            targetUuid: z.string().uuid(),
            assignedUsers: z.number().int().min(0),
        }),
    ),
});

export const HostBalancerTargetValidationSeveritySchema = z.enum(['ok', 'warning', 'error']);

export const HostBalancerTargetValidationSchema = z.object({
    localId: z.string().nullable(),
    uuid: z.string().uuid().nullable(),
    nodeUuid: z.string().uuid().nullable(),
    valid: z.boolean(),
    severity: HostBalancerTargetValidationSeveritySchema,
    reasons: z.array(z.string()),
    nodeName: z.string().nullable(),
    nodeAddress: z.string().nullable(),
    nodeStatus: z.enum(['connected', 'connecting', 'disabled', 'disconnected', 'unknown']),
    hasRequiredInbound: z.boolean().nullable(),
});

export const HostBalancerTargetsValidationSchema = z.object({
    targets: z.array(HostBalancerTargetValidationSchema),
    summary: z.object({
        total: z.number().int().min(0),
        valid: z.number().int().min(0),
        warnings: z.number().int().min(0),
        errors: z.number().int().min(0),
    }),
});

const HostBalancerDecisionDiagnosticsTargetSchema = HostBalancerPreviewDiagnosticsTargetSchema;

const HostBalancerDecisionFinalOverridesSchema = z
    .object({
        address: z.string(),
        port: z.number().int(),
        sni: z.string().nullable(),
        host: z.string().nullable(),
        path: z.string().nullable(),
    })
    .nullable();

export const HostBalancerDecisionSchema = z.object({
    uuid: z.string().uuid(),
    hostUuid: z.string().uuid(),
    userUuid: z.string(),
    userUuidMasked: z.string().optional(),
    targetUuid: z.string().uuid().nullable(),
    strategy: HostBalancerStrategySchema,
    reason: z.string(),
    unavailablePolicy: HostBalancerUnavailablePolicySchema,
    assignmentAction: z.enum(['reused', 'created', 'reassigned', 'skipped']),
    candidates: z.array(HostBalancerDecisionDiagnosticsTargetSchema),
    excludedTargets: z.array(HostBalancerDecisionDiagnosticsTargetSchema),
    selectedTarget: HostBalancerDecisionDiagnosticsTargetSchema.nullable(),
    warnings: z.array(z.string()),
    finalHostOverrides: HostBalancerDecisionFinalOverridesSchema,
    diagnostics: z.record(z.unknown()),
    createdAt: DateTimeSchema,
});
