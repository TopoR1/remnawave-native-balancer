import { z } from 'zod';

import { getEndpointDetails } from '../../constants';
import { HwidUserDeviceSchema } from '../../models';
import { HWID_ROUTES, REST_API } from '../../api';

export namespace DeleteAllUserHwidDevicesCommand {
    export const url = REST_API.HWID.DELETE_ALL_USER_HWID_DEVICES;
    export const TSQ_url = url;

    export const endpointDetails = getEndpointDetails(
        HWID_ROUTES.DELETE_ALL_USER_HWID_DEVICES,
        'post',
        'Delete all user HWID devices',
    );

    export const RequestSchema = z.object({
        userUuid: z.string().uuid(),
    });

    export type Request = z.infer<typeof RequestSchema>;

    export const ResponseSchema = z.object({
        response: z.object({
            total: z.number(),
            devices: z.array(HwidUserDeviceSchema),
        }),
    });

    export type Response = z.infer<typeof ResponseSchema>;
}
