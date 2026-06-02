import { createZodDto } from 'nestjs-zod';

import { EncryptHappCryptoLinkCommand } from '@contract/commands';

export class EncryptHappCryptoLinkRequestDto extends createZodDto(
    EncryptHappCryptoLinkCommand.RequestSchema,
) {}

export class EncryptHappCryptoLinkResponseDto extends createZodDto(
    EncryptHappCryptoLinkCommand.ResponseSchema,
) {}
