import { z } from 'zod';

import { getEndpointDetails } from '../../../constants';
import { NODES_ROUTES, REST_API } from '../../../api';

export namespace RestartAllNodesCommand {
    export const url = REST_API.NODES.ACTIONS.RESTART_ALL;
    export const TSQ_url = url;

    export const endpointDetails = getEndpointDetails(
        NODES_ROUTES.ACTIONS.RESTART_ALL,
        'post',
        'Restart all nodes',
    );

    export const RequestBodySchema = z.preprocess(
        (val) => val || {},
        z.object({
            forceRestart: z.boolean().optional(),
        }),
    );

    export type RequestBody = z.infer<typeof RequestBodySchema>;

    export const ResponseSchema = z.object({
        response: z.object({
            eventSent: z.boolean(),
        }),
    });

    export type Response = z.infer<typeof ResponseSchema>;
}
