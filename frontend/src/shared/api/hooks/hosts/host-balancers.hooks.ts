import { createQueryKeys } from '@lukemorales/query-key-factory'
import { notifications } from '@mantine/notifications'
import { z } from 'zod'

import i18n from '../../../../app/i18n/i18n'
import { createGetQueryHook, createMutationHook, errorHandler } from '../../tsq-helpers'

const DateTimeSchema = z
    .string()
    .datetime()
    .transform((str) => new Date(str))

export const HostBalancerStrategySchema = z.enum([
    'LEAST_ASSIGNED',
    'WEIGHTED',
    'RANDOM',
    'PRIORITY_FAILOVER',
    'LEAST_TRAFFIC',
    'WEIGHTED_LEAST_TRAFFIC'
])

export const HostBalancerUnavailablePolicySchema = z.enum([
    'HIDE_HOST',
    'ORIGINAL_HOST',
    'KEEP_LAST_IF_POSSIBLE'
])

export const HostBalancerTrafficMetricSchema = z.enum([
    'CURRENT_PERIOD',
    'LAST_24H',
    'LAST_6H',
    'LAST_1H'
])

export const HostBalancerTargetStatusSchema = z.enum(['ACTIVE', 'DRAINING', 'DISABLED', 'DEAD'])

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
    nodeName: z.string().nullable().optional(),
    nodeAddress: z.string().nullable().optional(),
    countryCode: z.string().nullable().optional(),
    countryEmoji: z.string().nullable().optional(),
    profileUuid: z.string().uuid().nullable().optional(),
    profileName: z.string().nullable().optional(),
    inboundUuid: z.string().uuid().nullable().optional(),
    inboundName: z.string().nullable().optional(),
    inboundTag: z.string().nullable().optional(),
    inboundType: z.string().nullable().optional(),
    inboundNetwork: z.string().nullable().optional(),
    inboundPort: z.number().int().nullable().optional(),
    compatibilityStatus: z
        .enum(['compatible', 'missing_inbound', 'node_disconnected', 'node_disabled', 'unknown'])
        .optional(),
    assignmentsCount: z.number().int().min(0).nullable().optional(),
    trafficBytes: z.string().nullable().optional(),
    formattedTraffic: z.string().nullable().optional(),
    warning: z.string().nullable().optional(),
    createdAt: DateTimeSchema,
    updatedAt: DateTimeSchema
})

export const HostBalancerSchema = z.object({
    uuid: z.string().uuid(),
    hostUuid: z.string().uuid(),
    enabled: z.boolean(),
    strategy: HostBalancerStrategySchema,
    unavailablePolicy: HostBalancerUnavailablePolicySchema,
    stickyEnabled: z.boolean(),
    rebalanceExistingAssignmentsByTraffic: z.boolean().default(false),
    trafficMetric: HostBalancerTrafficMetricSchema.nullable(),
    targets: z.array(HostBalancerTargetSchema).optional(),
    createdAt: DateTimeSchema,
    updatedAt: DateTimeSchema
})

const TargetInputSchema = z.object({
    localId: z.string().optional(),
    uuid: z.string().uuid().optional(),
    nodeUuid: z.string().uuid().nullable().optional(),
    enabled: z.boolean().optional(),
    status: HostBalancerTargetStatusSchema.optional(),
    weight: z.number().int().min(1).optional(),
    priority: z.number().int().min(0).optional(),
    maxAssignedUsers: z.number().int().min(1).nullable().optional(),
    overrideAddress: z.string().nullable().optional(),
    overridePort: z.number().int().min(1).max(65535).nullable().optional(),
    overrideSni: z.string().nullable().optional(),
    overrideHost: z.string().nullable().optional(),
    overridePath: z.string().nullable().optional()
})

const HostBalancerTargetValidationSeveritySchema = z.enum(['ok', 'warning', 'error'])
const HostBalancerNodeStatusSchema = z.enum([
    'connected',
    'connecting',
    'disabled',
    'disconnected',
    'unknown'
])
const HostBalancerTargetValidationSchema = z.object({
    localId: z.string().nullable(),
    uuid: z.string().uuid().nullable(),
    nodeUuid: z.string().uuid().nullable(),
    valid: z.boolean(),
    severity: HostBalancerTargetValidationSeveritySchema,
    reasons: z.array(z.string()),
    nodeName: z.string().nullable(),
    nodeAddress: z.string().nullable(),
    nodeStatus: HostBalancerNodeStatusSchema,
    hasRequiredInbound: z.boolean().nullable()
})
const HostBalancerTargetsValidationSchema = z.object({
    targets: z.array(HostBalancerTargetValidationSchema),
    summary: z.object({
        total: z.number().int().min(0),
        valid: z.number().int().min(0),
        warnings: z.number().int().min(0),
        errors: z.number().int().min(0)
    })
})

const DiagnosticsTargetSchema = z.object({
    targetUuid: z.string().uuid(),
    nodeUuid: z.string().uuid().nullable().optional(),
    nodeName: z.string().nullable().optional(),
    nodeAddress: z.string().nullable().optional(),
    countryCode: z.string().nullable().optional(),
    countryEmoji: z.string().nullable().optional(),
    profileUuid: z.string().uuid().nullable().optional(),
    profileName: z.string().nullable().optional(),
    inboundUuid: z.string().uuid().nullable().optional(),
    inboundName: z.string().nullable().optional(),
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
    severity: z.enum(['info', 'warning', 'error']).optional()
})

const PreviewFinalHostOverridesSchema = z
    .object({
        address: z.string(),
        port: z.number().int(),
        sni: z.string().nullable(),
        host: z.string().nullable(),
        path: z.string().nullable()
    })
    .nullable()

const PreviewExistingAssignmentSchema = z
    .object({
        targetUuid: z.string().uuid(),
        reason: z.string().nullable(),
        lastUsedAt: z.coerce.date()
    })
    .nullable()

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
    existingAssignment: PreviewExistingAssignmentSchema.optional(),
    assignmentAction: z
        .enum(['preview_only', 'would_create', 'would_reuse', 'would_reassign', 'would_fallback'])
        .optional(),
    selectedTarget: DiagnosticsTargetSchema.nullable().optional(),
    candidates: z.array(DiagnosticsTargetSchema).optional(),
    excludedTargets: z.array(DiagnosticsTargetSchema).optional(),
    warnings: z.array(z.string()).optional(),
    finalHostOverrides: PreviewFinalHostOverridesSchema.optional(),
    fallbackPolicyResult: z
        .object({
            policy: HostBalancerUnavailablePolicySchema,
            result: z.enum(['hidden', 'original_host', 'last_assignment', 'none']),
            message: z.string().optional()
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
        existingAssignment: PreviewExistingAssignmentSchema,
        assignmentAction: z.enum(['preview_only', 'reused', 'would_create', 'would_reassign']),
        candidates: z.array(DiagnosticsTargetSchema).optional(),
        excludedTargets: z.array(DiagnosticsTargetSchema).optional(),
        selectedTarget: DiagnosticsTargetSchema.nullable().optional(),
        assignment: z.enum(['none', 'reused', 'created', 'reassigned']).optional(),
        finalHostOverrides: PreviewFinalHostOverridesSchema.optional()
    })
})

const HostBalancerDecisionFinalOverridesSchema = z
    .object({
        address: z.string(),
        port: z.number().int(),
        sni: z.string().nullable(),
        host: z.string().nullable(),
        path: z.string().nullable()
    })
    .nullable()

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
    candidates: z.array(DiagnosticsTargetSchema),
    excludedTargets: z.array(DiagnosticsTargetSchema),
    selectedTarget: DiagnosticsTargetSchema.nullable(),
    warnings: z.array(z.string()),
    finalHostOverrides: HostBalancerDecisionFinalOverridesSchema,
    diagnostics: z.record(z.string(), z.unknown()),
    createdAt: DateTimeSchema
})

const HostUuidSchema = z.object({ hostUuid: z.string().uuid() })

export const hostBalancersQueryKeys = createQueryKeys('hostBalancers', {
    getSettings: (hostUuid: string) => ({
        queryKey: [hostUuid]
    }),
    preview: (hostUuid: string, userUuid?: string) => ({
        queryKey: [hostUuid, userUuid]
    }),
    decisions: (hostUuid: string, limit: number) => ({
        queryKey: [hostUuid, 'decisions', limit]
    })
})

export type HostBalancer = z.infer<typeof HostBalancerSchema>
export type HostBalancerPreview = z.infer<typeof HostBalancerPreviewSchema>
export type HostBalancerDecision = z.infer<typeof HostBalancerDecisionSchema>
export type HostBalancerStrategy = z.infer<typeof HostBalancerStrategySchema>
export type HostBalancerTrafficMetric = z.infer<typeof HostBalancerTrafficMetricSchema>
export type HostBalancerUnavailablePolicy = z.infer<typeof HostBalancerUnavailablePolicySchema>
export type HostBalancerTargetStatus = z.infer<typeof HostBalancerTargetStatusSchema>
export type HostBalancerTargetInput = z.infer<typeof TargetInputSchema>
export type HostBalancerTargetValidation = z.infer<typeof HostBalancerTargetValidationSchema>
export type HostBalancerTargetsValidation = z.infer<typeof HostBalancerTargetsValidationSchema>

export const useGetHostBalancer = createGetQueryHook({
    endpoint: '/api/host-balancers/:hostUuid',
    routeParamsSchema: HostUuidSchema,
    responseSchema: z.object({ response: HostBalancerSchema.nullable() }),
    getQueryKey: ({ route }) => hostBalancersQueryKeys.getSettings(route!.hostUuid).queryKey,
    rQueryParams: {
        enabled: false,
        refetchOnMount: true
    },
    errorHandler: (error) => errorHandler(error, i18n.t('base-host-form.error-get-host-balancer'))
})

export const usePreviewHostBalancer = createGetQueryHook({
    endpoint: '/api/host-balancers/:hostUuid/preview',
    routeParamsSchema: HostUuidSchema,
    requestQuerySchema: z.object({ userUuid: z.string() }),
    responseSchema: z.object({ response: HostBalancerPreviewSchema }),
    getQueryKey: ({ route, query }) =>
        hostBalancersQueryKeys.preview(route!.hostUuid, query?.userUuid).queryKey,
    rQueryParams: {
        enabled: false
    },
    errorHandler: (error) =>
        errorHandler(error, i18n.t('base-host-form.error-preview-host-balancer'))
})

export const useGetHostBalancerDecisions = createGetQueryHook({
    endpoint: '/api/host-balancers/:hostUuid/decisions',
    routeParamsSchema: HostUuidSchema,
    requestQuerySchema: z.object({ limit: z.number().int().min(1).max(500).default(50) }),
    responseSchema: z.object({ response: z.array(HostBalancerDecisionSchema) }),
    getQueryKey: ({ route, query }) =>
        hostBalancersQueryKeys.decisions(route!.hostUuid, query?.limit ?? 50).queryKey,
    rQueryParams: {
        enabled: false
    },
    errorHandler: (error) =>
        errorHandler(error, i18n.t('base-host-form.error-get-host-balancer-decisions'))
})

export const useUpdateHostBalancer = createMutationHook({
    endpoint: '/api/host-balancers/:hostUuid',
    routeParamsSchema: HostUuidSchema,
    bodySchema: z.object({
        enabled: z.boolean().optional(),
        strategy: HostBalancerStrategySchema.optional(),
        unavailablePolicy: HostBalancerUnavailablePolicySchema.optional(),
        stickyEnabled: z.boolean().optional(),
        rebalanceExistingAssignmentsByTraffic: z.boolean().optional(),
        trafficMetric: HostBalancerTrafficMetricSchema.nullable().optional()
    }),
    responseSchema: z.object({ response: HostBalancerSchema }),
    requestMethod: 'put',
    rMutationParams: {
        onError: (error) => {
            notifications.show({
                title: i18n.t('base-host-form.error-update-host-balancer'),
                message:
                    error instanceof Error
                        ? error.message
                        : i18n.t('base-host-form.request-failed-with-unknown-error'),
                color: 'red'
            })
        }
    }
})

export const useUpdateHostBalancerTargets = createMutationHook({
    endpoint: '/api/host-balancers/:hostUuid/targets',
    routeParamsSchema: HostUuidSchema,
    bodySchema: z.object({ targets: z.array(TargetInputSchema) }),
    responseSchema: z.object({ response: z.array(HostBalancerTargetSchema) }),
    requestMethod: 'put',
    rMutationParams: {
        onError: (error) => {
            notifications.show({
                title: i18n.t('base-host-form.error-update-host-balancer-targets'),
                message:
                    error instanceof Error
                        ? error.message
                        : i18n.t('base-host-form.request-failed-with-unknown-error'),
                color: 'red'
            })
        }
    }
})

export const useValidateHostBalancerTargets = createMutationHook({
    endpoint: '/api/host-balancers/:hostUuid/targets/validate',
    routeParamsSchema: HostUuidSchema,
    bodySchema: z.object({ targets: z.array(TargetInputSchema) }),
    responseSchema: z.object({ response: HostBalancerTargetsValidationSchema }),
    requestMethod: 'post',
    rMutationParams: {
        onError: (error) => {
            notifications.show({
                title: i18n.t('base-host-form.error-validate-host-balancer-targets'),
                message:
                    error instanceof Error
                        ? error.message
                        : i18n.t('base-host-form.request-failed-with-unknown-error'),
                color: 'red'
            })
        }
    }
})
