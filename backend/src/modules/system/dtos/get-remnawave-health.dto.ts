import { createZodDto } from 'nestjs-zod';

import { GetRemnawaveHealthCommand } from '@contract/commands';

export class GetRemnawaveHealthResponseDto extends createZodDto(
    GetRemnawaveHealthCommand.ResponseSchema,
) {}
