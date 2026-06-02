import { createZodDto } from 'nestjs-zod';

import {
    GetHostBalancerCommand,
    GetHostBalancerStatsCommand,
    PreviewHostBalancerCommand,
    ToggleHostBalancerCommand,
    UpdateHostBalancerCommand,
    UpdateHostBalancerTargetsCommand,
} from '@libs/contracts/commands';

export class GetHostBalancerRequestDto extends createZodDto(
    GetHostBalancerCommand.RequestSchema,
) {}
export class GetHostBalancerResponseDto extends createZodDto(
    GetHostBalancerCommand.ResponseSchema,
) {}

export class UpdateHostBalancerRequestDto extends createZodDto(
    UpdateHostBalancerCommand.RequestSchema,
) {}
export class UpdateHostBalancerRequestBodyDto extends createZodDto(
    UpdateHostBalancerCommand.RequestBodySchema,
) {}
export class UpdateHostBalancerResponseDto extends createZodDto(
    UpdateHostBalancerCommand.ResponseSchema,
) {}

export class ToggleHostBalancerRequestDto extends createZodDto(
    ToggleHostBalancerCommand.RequestSchema,
) {}
export class ToggleHostBalancerRequestBodyDto extends createZodDto(
    ToggleHostBalancerCommand.RequestBodySchema,
) {}
export class ToggleHostBalancerResponseDto extends createZodDto(
    ToggleHostBalancerCommand.ResponseSchema,
) {}

export class UpdateHostBalancerTargetsRequestDto extends createZodDto(
    UpdateHostBalancerTargetsCommand.RequestSchema,
) {}
export class UpdateHostBalancerTargetsRequestBodyDto extends createZodDto(
    UpdateHostBalancerTargetsCommand.RequestBodySchema,
) {}
export class UpdateHostBalancerTargetsResponseDto extends createZodDto(
    UpdateHostBalancerTargetsCommand.ResponseSchema,
) {}

export class PreviewHostBalancerRequestDto extends createZodDto(
    PreviewHostBalancerCommand.RequestSchema,
) {}
export class PreviewHostBalancerRequestQueryDto extends createZodDto(
    PreviewHostBalancerCommand.RequestQuerySchema,
) {}
export class PreviewHostBalancerResponseDto extends createZodDto(
    PreviewHostBalancerCommand.ResponseSchema,
) {}

export class GetHostBalancerStatsRequestDto extends createZodDto(
    GetHostBalancerStatsCommand.RequestSchema,
) {}
export class GetHostBalancerStatsResponseDto extends createZodDto(
    GetHostBalancerStatsCommand.ResponseSchema,
) {}
