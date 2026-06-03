import { ApiBearerAuth, ApiOkResponse, ApiParam, ApiTags } from '@nestjs/swagger';
import { Body, Controller, HttpStatus, Param, Query, UseFilters, UseGuards } from '@nestjs/common';

import { HttpExceptionFilter } from '@common/exception/http-exception.filter';
import { JwtDefaultGuard } from '@common/guards/jwt-guards/def-jwt-guard';
import { errorHandler } from '@common/helpers/error-handler.helper';
import { RolesGuard } from '@common/guards/roles/roles.guard';
import { Endpoint } from '@common/decorators/base-endpoint';
import { Roles } from '@common/decorators/roles/roles';
import {
    GetHostBalancerCommand,
    GetHostBalancerDecisionsCommand,
    GetHostBalancerStatsCommand,
    PreviewHostBalancerCommand,
    ToggleHostBalancerCommand,
    UpdateHostBalancerCommand,
    UpdateHostBalancerTargetsCommand,
    ValidateHostBalancerTargetsCommand,
} from '@libs/contracts/commands';
import { CONTROLLERS_INFO, HOST_BALANCERS_CONTROLLER } from '@libs/contracts/api';
import { ROLE } from '@libs/contracts/constants';

import {
    GetHostBalancerRequestDto,
    GetHostBalancerResponseDto,
    GetHostBalancerDecisionsRequestDto,
    GetHostBalancerDecisionsRequestQueryDto,
    GetHostBalancerDecisionsResponseDto,
    GetHostBalancerStatsRequestDto,
    GetHostBalancerStatsResponseDto,
    PreviewHostBalancerRequestDto,
    PreviewHostBalancerRequestQueryDto,
    PreviewHostBalancerResponseDto,
    ToggleHostBalancerRequestBodyDto,
    ToggleHostBalancerRequestDto,
    ToggleHostBalancerResponseDto,
    UpdateHostBalancerRequestBodyDto,
    UpdateHostBalancerRequestDto,
    UpdateHostBalancerResponseDto,
    UpdateHostBalancerTargetsRequestBodyDto,
    UpdateHostBalancerTargetsRequestDto,
    UpdateHostBalancerTargetsResponseDto,
    ValidateHostBalancerTargetsRequestBodyDto,
    ValidateHostBalancerTargetsRequestDto,
    ValidateHostBalancerTargetsResponseDto,
} from './dtos';
import { HostBalancerService } from './host-balancer.service';

@ApiBearerAuth('Authorization')
@ApiTags(CONTROLLERS_INFO.HOST_BALANCERS.tag)
@Roles(ROLE.ADMIN, ROLE.API)
@UseGuards(JwtDefaultGuard, RolesGuard)
@UseFilters(HttpExceptionFilter)
@Controller(HOST_BALANCERS_CONTROLLER)
export class HostBalancersController {
    constructor(private readonly hostBalancerService: HostBalancerService) {}

    @ApiParam({ name: 'hostUuid', type: String, required: true })
    @ApiOkResponse({ type: GetHostBalancerResponseDto })
    @Endpoint({
        command: GetHostBalancerCommand,
        httpCode: HttpStatus.OK,
    })
    async getSettings(
        @Param() { hostUuid }: GetHostBalancerRequestDto,
    ): Promise<GetHostBalancerResponseDto> {
        const result = await this.hostBalancerService.getSettings(hostUuid);
        return { response: errorHandler(result) };
    }

    @ApiParam({ name: 'hostUuid', type: String, required: true })
    @ApiOkResponse({ type: UpdateHostBalancerResponseDto })
    @Endpoint({
        command: UpdateHostBalancerCommand,
        httpCode: HttpStatus.OK,
        apiBody: UpdateHostBalancerRequestBodyDto,
    })
    async updateSettings(
        @Param() { hostUuid }: UpdateHostBalancerRequestDto,
        @Body() body: UpdateHostBalancerRequestBodyDto,
    ): Promise<UpdateHostBalancerResponseDto> {
        const result = await this.hostBalancerService.updateSettings(hostUuid, body);
        return { response: errorHandler(result) };
    }

    @ApiParam({ name: 'hostUuid', type: String, required: true })
    @ApiOkResponse({ type: ToggleHostBalancerResponseDto })
    @Endpoint({
        command: ToggleHostBalancerCommand,
        httpCode: HttpStatus.OK,
        apiBody: ToggleHostBalancerRequestBodyDto,
    })
    async toggle(
        @Param() { hostUuid }: ToggleHostBalancerRequestDto,
        @Body() { enabled }: ToggleHostBalancerRequestBodyDto,
    ): Promise<ToggleHostBalancerResponseDto> {
        const result = await this.hostBalancerService.toggle(hostUuid, enabled);
        return { response: errorHandler(result) };
    }

    @ApiParam({ name: 'hostUuid', type: String, required: true })
    @ApiOkResponse({ type: UpdateHostBalancerTargetsResponseDto })
    @Endpoint({
        command: UpdateHostBalancerTargetsCommand,
        httpCode: HttpStatus.OK,
        apiBody: UpdateHostBalancerTargetsRequestBodyDto,
    })
    async updateTargets(
        @Param() { hostUuid }: UpdateHostBalancerTargetsRequestDto,
        @Body() body: UpdateHostBalancerTargetsRequestBodyDto,
    ): Promise<UpdateHostBalancerTargetsResponseDto> {
        const result = await this.hostBalancerService.updateTargets(hostUuid, body);
        return { response: errorHandler(result) };
    }

    @ApiParam({ name: 'hostUuid', type: String, required: true })
    @ApiOkResponse({ type: ValidateHostBalancerTargetsResponseDto })
    @Endpoint({
        command: ValidateHostBalancerTargetsCommand,
        httpCode: HttpStatus.OK,
        apiBody: ValidateHostBalancerTargetsRequestBodyDto,
    })
    async validateTargets(
        @Param() { hostUuid }: ValidateHostBalancerTargetsRequestDto,
        @Body() body: ValidateHostBalancerTargetsRequestBodyDto,
    ): Promise<ValidateHostBalancerTargetsResponseDto> {
        const result = await this.hostBalancerService.validateTargets(hostUuid, body);
        return { response: errorHandler(result) };
    }

    @ApiParam({ name: 'hostUuid', type: String, required: true })
    @ApiOkResponse({ type: PreviewHostBalancerResponseDto })
    @Endpoint({
        command: PreviewHostBalancerCommand,
        httpCode: HttpStatus.OK,
    })
    async preview(
        @Param() { hostUuid }: PreviewHostBalancerRequestDto,
        @Query() { userUuid, shortUuid }: PreviewHostBalancerRequestQueryDto,
    ): Promise<PreviewHostBalancerResponseDto> {
        const result = await this.hostBalancerService.previewSelection(
            { userUuid, shortUuid },
            hostUuid,
        );
        return { response: errorHandler(result) };
    }

    @ApiParam({ name: 'hostUuid', type: String, required: true })
    @ApiOkResponse({ type: GetHostBalancerStatsResponseDto })
    @Endpoint({
        command: GetHostBalancerStatsCommand,
        httpCode: HttpStatus.OK,
    })
    async getStats(
        @Param() { hostUuid }: GetHostBalancerStatsRequestDto,
    ): Promise<GetHostBalancerStatsResponseDto> {
        const result = await this.hostBalancerService.getStats(hostUuid);
        return { response: errorHandler(result) };
    }

    @ApiParam({ name: 'hostUuid', type: String, required: true })
    @ApiOkResponse({ type: GetHostBalancerDecisionsResponseDto })
    @Endpoint({
        command: GetHostBalancerDecisionsCommand,
        httpCode: HttpStatus.OK,
    })
    async getDecisions(
        @Param() { hostUuid }: GetHostBalancerDecisionsRequestDto,
        @Query() { limit }: GetHostBalancerDecisionsRequestQueryDto,
    ): Promise<GetHostBalancerDecisionsResponseDto> {
        const result = await this.hostBalancerService.getDecisions(hostUuid, limit);
        return { response: errorHandler(result) };
    }
}
