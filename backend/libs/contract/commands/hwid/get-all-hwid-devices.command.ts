import { z } from 'zod';

import { HwidUserDeviceSchema, TanstackQueryRequestQuerySchema } from '../../models';
import { getEndpointDetails } from '../../constants';
import { HWID_ROUTES, REST_API } from '../../api';

export namespace GetAllHwidDevicesCommand {
    export const url = REST_API.HWID.GET_ALL_HWID_DEVICES;
    export const TSQ_url = url;

    export const endpointDetails = getEndpointDetails(
        HWID_ROUTES.GET_ALL_HWID_DEVICES,
        'get',
        'Get all HWID devices',
    );

    export const RequestQuerySchema = TanstackQueryRequestQuerySchema;
    export type RequestQuery = z.infer<typeof RequestQuerySchema>;

    export const ResponseSchema = z.object({
        response: z.object({
            devices: z.array(HwidUserDeviceSchema),
            total: z.number(),
        }),
    });

    export type Response = z.infer<typeof ResponseSchema>;
}
