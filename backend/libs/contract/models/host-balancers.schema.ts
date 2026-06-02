import { z } from 'zod';

import {
    HOST_BALANCER_STRATEGIES,
    HOST_BALANCER_TARGET_STATUSES,
    HOST_BALANCER_TRAFFIC_METRICS,
    HOST_BALANCER_UNAVAILABLE_POLICIES,
} from '../constants';

export const HostBalancerStrategySchema = z.nativeEnum(HOST_BALANCER_STRATEGIES);
export const HostBalancerUnavailablePolicySchema = z.nativeEnum(
    HOST_BALANCER_UNAVAILABLE_POLICIES,
);
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

export const HostBalancerPreviewSchema = z.object({
    hostUuid: z.string().uuid(),
    userUuid: z.string().uuid(),
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
        candidates: z
            .array(
                z.object({
                    targetUuid: z.string().uuid(),
                    nodeUuid: z.string().uuid().nullable().optional(),
                    trafficBytes: z.string().nullable().optional(),
                    weight: z.number().int().min(1).optional(),
                    score: z.number().optional(),
                    selected: z.boolean().optional(),
                    fallbackUsed: z.boolean().optional(),
                    reason: z.string().optional(),
                }),
            )
            .optional(),
        excludedTargets: z
            .array(
                z.object({
                    targetUuid: z.string().uuid(),
                    nodeUuid: z.string().uuid().nullable().optional(),
                    trafficBytes: z.string().nullable().optional(),
                    weight: z.number().int().min(1).optional(),
                    score: z.number().optional(),
                    selected: z.boolean().optional(),
                    fallbackUsed: z.boolean().optional(),
                    reason: z.string().optional(),
                }),
            )
            .optional(),
        selectedTarget: z
            .object({
                targetUuid: z.string().uuid(),
                nodeUuid: z.string().uuid().nullable().optional(),
                trafficBytes: z.string().nullable().optional(),
                weight: z.number().int().min(1).optional(),
                score: z.number().optional(),
                selected: z.boolean().optional(),
                fallbackUsed: z.boolean().optional(),
                reason: z.string().optional(),
            })
            .nullable()
            .optional(),
        assignment: z.enum(['none', 'reused', 'created', 'reassigned']).optional(),
        finalHostOverrides: z
            .object({
                address: z.string(),
                port: z.number().int(),
                sni: z.string().nullable(),
                host: z.string().nullable(),
                path: z.string().nullable(),
            })
            .nullable()
            .optional(),
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
