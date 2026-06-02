import { createZodDto } from 'nestjs-zod';

import { GenerateX25519Command } from '@contract/commands';

export class GenerateX25519ResponseDto extends createZodDto(GenerateX25519Command.ResponseSchema) {}
