import { z } from 'zod';

import { ExtendedUsersSchema, TanstackQueryRequestQuerySchema } from '../../models';
import { getEndpointDetails } from '../../constants';
import { REST_API, USERS_ROUTES } from '../../api';

export namespace GetAllUsersCommand {
    export const url = REST_API.USERS.GET;
    export const TSQ_url = url;

    export const endpointDetails = getEndpointDetails(USERS_ROUTES.GET, 'get', 'Get all users');

    export const RequestQuerySchema = TanstackQueryRequestQuerySchema;

    export type RequestQuery = z.infer<typeof RequestQuerySchema>;

    export const ResponseSchema = z.object({
        response: z.object({
            users: z.array(ExtendedUsersSchema),
            total: z.number(),
        }),
    });

    export type Response = z.infer<typeof ResponseSchema>;
}
