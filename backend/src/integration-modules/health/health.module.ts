import { TerminusModule } from '@nestjs/terminus';
import { Module } from '@nestjs/common';

import { HealthController } from './health.controller';

@Module({
    controllers: [HealthController],
    imports: [TerminusModule],
})
export class HealthModule {}
