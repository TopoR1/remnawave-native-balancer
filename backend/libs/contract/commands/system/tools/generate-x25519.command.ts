import { z } from 'zod';

import { getEndpointDetails } from '../../../constants';
import { REST_API, SYSTEM_ROUTES } from '../../../api';

export namespace GenerateX25519Command {
    export const url = REST_API.SYSTEM.TOOLS.GENERATE_X25519;
    export const TSQ_url = url;

    export const endpointDetails = getEndpointDetails(
        SYSTEM_ROUTES.TOOLS.GENERATE_X25519,
        'get',
        'Generate 30 X25519 keypairs',
    );

    export const ResponseSchema = z.object({
        response: z.object({
            keypairs: z.array(
                z.object({
                    publicKey: z.string(),
                    privateKey: z.string(),
                }),
            ),
        }),
    });

    export type Response = z.infer<typeof ResponseSchema>;
}
