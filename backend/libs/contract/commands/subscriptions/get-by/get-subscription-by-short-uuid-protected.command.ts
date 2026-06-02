import { z } from 'zod';

import { REST_API, SUBSCRIPTIONS_ROUTES } from '../../../api';
import { SubscriptionInfoSchema } from '../../../models';
import { getEndpointDetails } from '../../../constants';

export namespace GetSubscriptionByShortUuidProtectedCommand {
    export const url = REST_API.SUBSCRIPTIONS.GET_BY.SHORT_UUID;
    export const TSQ_url = url(':shortUuid');

    export const endpointDetails = getEndpointDetails(
        SUBSCRIPTIONS_ROUTES.GET_BY.SHORT_UUID(':shortUuid'),
        'get',
        'Get subscription by short uuid (protected route)',
    );

    export const RequestSchema = z.object({
        shortUuid: z.string(),
    });

    export type Request = z.infer<typeof RequestSchema>;

    export const ResponseSchema = z.object({
        response: SubscriptionInfoSchema,
    });

    export type Response = z.infer<typeof ResponseSchema>;
}
