import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';

import { HostBalancerService } from './host-balancer.service';
import { HostBalancersController } from './host-balancers.controller';
import { HostBalancersRepository } from './repositories/host-balancers.repository';

@Module({
    imports: [CqrsModule],
    controllers: [HostBalancersController],
    providers: [HostBalancersRepository, HostBalancerService],
    exports: [HostBalancerService],
})
export class HostBalancersModule {}
