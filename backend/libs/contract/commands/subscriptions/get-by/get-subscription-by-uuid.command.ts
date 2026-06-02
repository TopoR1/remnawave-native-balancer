import { z } from 'zod';

import { REST_API, SUBSCRIPTIONS_ROUTES } from '../../../api';
import { SubscriptionInfoSchema } from '../../../models';
import { getEndpointDetails } from '../../../constants';

export namespace GetSubscriptionByUuidCommand {
    export const url = REST_API.SUBSCRIPTIONS.GET_BY.UUID;
    export const TSQ_url = url(':uuid');

    export const endpointDetails = getEndpointDetails(
        SUBSCRIPTIONS_ROUTES.GET_BY.UUID(':uuid'),
        'get',
        'Get subscription by uuid',
    );

    export const RequestSchema = z.object({
        uuid: z.string(),
    });

    export type Request = z.infer<typeof RequestSchema>;

    export const ResponseSchema = z.object({
        response: SubscriptionInfoSchema,
    });

    export type Response = z.infer<typeof ResponseSchema>;
}
