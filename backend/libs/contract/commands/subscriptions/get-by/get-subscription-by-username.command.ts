import { z } from 'zod';

import { REST_API, SUBSCRIPTIONS_ROUTES } from '../../../api';
import { SubscriptionInfoSchema } from '../../../models';
import { getEndpointDetails } from '../../../constants';

export namespace GetSubscriptionByUsernameCommand {
    export const url = REST_API.SUBSCRIPTIONS.GET_BY.USERNAME;
    export const TSQ_url = url(':username');

    export const endpointDetails = getEndpointDetails(
        SUBSCRIPTIONS_ROUTES.GET_BY.USERNAME(':username'),
        'get',
        'Get subscription by username',
    );

    export const RequestSchema = z.object({
        username: z.string(),
    });

    export type Request = z.infer<typeof RequestSchema>;

    export const ResponseSchema = z.object({
        response: SubscriptionInfoSchema,
    });

    export type Response = z.infer<typeof ResponseSchema>;
}
