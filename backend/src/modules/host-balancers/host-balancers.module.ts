import { CqrsModule } from '@nestjs/cqrs';
import { Module } from '@nestjs/common';

import { HostBalancersRepository } from './repositories/host-balancers.repository';
import { HostBalancersController } from './host-balancers.controller';
import { HostBalancerService } from './host-balancer.service';

@Module({
    imports: [CqrsModule],
    controllers: [HostBalancersController],
    providers: [HostBalancersRepository, HostBalancerService],
    exports: [HostBalancerService],
})
export class HostBalancersModule {}
