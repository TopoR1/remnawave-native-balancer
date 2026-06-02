import { z } from 'zod';

import { getEndpointDetails } from '../../../constants';
import { REST_API, SYSTEM_ROUTES } from '../../../api';

export namespace EncryptHappCryptoLinkCommand {
    export const url = REST_API.SYSTEM.TOOLS.ENCRYPT_HAPP_CRYPTO_LINK;
    export const TSQ_url = url;

    export const endpointDetails = getEndpointDetails(
        SYSTEM_ROUTES.TOOLS.ENCRYPT_HAPP_CRYPTO_LINK,
        'post',
        'Encrypt Happ Crypto Link',
    );
    export const RequestSchema = z.object({
        linkToEncrypt: z.string().url(),
    });

    export type Request = z.infer<typeof RequestSchema>;

    export const ResponseSchema = z.object({
        response: z.object({
            encryptedLink: z.string(),
        }),
    });

    export type Response = z.infer<typeof ResponseSchema>;
}
