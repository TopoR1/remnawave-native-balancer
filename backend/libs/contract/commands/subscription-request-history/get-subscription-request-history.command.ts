import { z } from 'zod';

import { SubscriptionRequestHistorySchema, TanstackQueryRequestQuerySchema } from '../../models';
import { REST_API, SUBSCRIPTION_REQUEST_HISTORY_ROUTES } from '../../api';
import { getEndpointDetails } from '../../constants';

export namespace GetSubscriptionRequestHistoryCommand {
    export const url = REST_API.SUBSCRIPTION_REQUEST_HISTORY.GET;
    export const TSQ_url = url;

    export const endpointDetails = getEndpointDetails(
        SUBSCRIPTION_REQUEST_HISTORY_ROUTES.GET,
        'get',
        'Get all subscription request history',
    );

    export const RequestQuerySchema = TanstackQueryRequestQuerySchema;

    export type RequestQuery = z.infer<typeof RequestQuerySchema>;

    export const ResponseSchema = z.object({
        response: z.object({
            records: z.array(SubscriptionRequestHistorySchema),
            total: z.number(),
        }),
    });

    export type Response = z.infer<typeof ResponseSchema>;
}
