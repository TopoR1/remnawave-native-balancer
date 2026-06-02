import { z } from 'zod';

import {
    HOST_BALANCERS_ROUTES,
    HOST_BALANCERS_CONTROLLER,
    REST_API,
} from '../../api';
import { getEndpointDetails } from '../../constants';
import {
    HostBalancerPreviewSchema,
    HostBalancerSchema,
    HostBalancerStatsSchema,
    HostBalancerStrategySchema,
    HostBalancerTargetSchema,
    HostBalancerTargetStatusSchema,
    HostBalancerTrafficMetricSchema,
    HostBalancerUnavailablePolicySchema,
} from '../../models';

const HostUuidSchema = z.object({
    hostUuid: z.string().uuid(),
});

const UpdateSettingsSchema = z.object({
    enabled: z.boolean().optional(),
    strategy: HostBalancerStrategySchema.optional(),
    unavailablePolicy: HostBalancerUnavailablePolicySchema.optional(),
    stickyEnabled: z.boolean().optional(),
    rebalanceExistingAssignmentsByTraffic: z.boolean().optional(),
    trafficMetric: HostBalancerTrafficMetricSchema.nullable().optional(),
});

const TargetInputSchema = z.object({
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
    overridePath: z.string().nullable().optional(),
});

export namespace GetHostBalancerCommand {
    export const url = REST_API.HOST_BALANCERS.GET;
    export const TSQ_url = url;
    export const endpointDetails = getEndpointDetails(
        HOST_BALANCERS_ROUTES.GET(':hostUuid'),
        'get',
        'Get host balancer settings',
    );
    export const RequestSchema = HostUuidSchema;
    export type Request = z.infer<typeof RequestSchema>;
    export const ResponseSchema = z.object({ response: HostBalancerSchema.nullable() });
    export type Response = z.infer<typeof ResponseSchema>;
}

export namespace UpdateHostBalancerCommand {
    export const url = REST_API.HOST_BALANCERS.UPDATE;
    export const TSQ_url = url;
    export const endpointDetails = getEndpointDetails(
        HOST_BALANCERS_ROUTES.UPDATE(':hostUuid'),
        'put',
        'Update host balancer settings',
    );
    export const RequestSchema = HostUuidSchema;
    export type Request = z.infer<typeof RequestSchema>;
    export const RequestBodySchema = UpdateSettingsSchema;
    export type RequestBody = z.infer<typeof RequestBodySchema>;
    export const ResponseSchema = z.object({ response: HostBalancerSchema });
    export type Response = z.infer<typeof ResponseSchema>;
}

export namespace ToggleHostBalancerCommand {
    export const url = REST_API.HOST_BALANCERS.TOGGLE;
    export const TSQ_url = url;
    export const endpointDetails = getEndpointDetails(
        HOST_BALANCERS_ROUTES.TOGGLE(':hostUuid'),
        'patch',
        'Toggle host balancer',
    );
    export const RequestSchema = HostUuidSchema;
    export type Request = z.infer<typeof RequestSchema>;
    export const RequestBodySchema = z.object({ enabled: z.boolean() });
    export type RequestBody = z.infer<typeof RequestBodySchema>;
    export const ResponseSchema = z.object({ response: HostBalancerSchema });
    export type Response = z.infer<typeof ResponseSchema>;
}

export namespace UpdateHostBalancerTargetsCommand {
    export const url = REST_API.HOST_BALANCERS.TARGETS;
    export const TSQ_url = url;
    export const endpointDetails = getEndpointDetails(
        HOST_BALANCERS_ROUTES.TARGETS(':hostUuid'),
        'put',
        'Update host balancer targets',
    );
    export const RequestSchema = HostUuidSchema;
    export type Request = z.infer<typeof RequestSchema>;
    export const RequestBodySchema = z.object({ targets: z.array(TargetInputSchema) });
    export type RequestBody = z.infer<typeof RequestBodySchema>;
    export const ResponseSchema = z.object({ response: z.array(HostBalancerTargetSchema) });
    export type Response = z.infer<typeof ResponseSchema>;
}

export namespace PreviewHostBalancerCommand {
    export const url = REST_API.HOST_BALANCERS.PREVIEW;
    export const TSQ_url = url;
    export const endpointDetails = getEndpointDetails(
        HOST_BALANCERS_ROUTES.PREVIEW(':hostUuid'),
        'get',
        'Preview host balancer target selection',
    );
    export const RequestSchema = HostUuidSchema;
    export type Request = z.infer<typeof RequestSchema>;
    export const RequestQuerySchema = z.object({ userUuid: z.string().uuid() });
    export type RequestQuery = z.infer<typeof RequestQuerySchema>;
    export const ResponseSchema = z.object({ response: HostBalancerPreviewSchema });
    export type Response = z.infer<typeof ResponseSchema>;
}

export namespace GetHostBalancerStatsCommand {
    export const url = REST_API.HOST_BALANCERS.STATS;
    export const TSQ_url = url;
    export const endpointDetails = getEndpointDetails(
        HOST_BALANCERS_ROUTES.STATS(':hostUuid'),
        'get',
        'Get host balancer stats',
    );
    export const RequestSchema = HostUuidSchema;
    export type Request = z.infer<typeof RequestSchema>;
    export const ResponseSchema = z.object({ response: HostBalancerStatsSchema });
    export type Response = z.infer<typeof ResponseSchema>;
}

export const HOST_BALANCERS_CONTROLLER_NAME = HOST_BALANCERS_CONTROLLER;
