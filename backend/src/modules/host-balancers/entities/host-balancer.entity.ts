import {
    HostBalancerStrategy,
    HostBalancerTrafficMetric,
    HostBalancerUnavailablePolicy,
} from '@prisma/client';

export class HostBalancerEntity {
    uuid: string;
    hostUuid: string;
    enabled: boolean;
    strategy: HostBalancerStrategy;
    unavailablePolicy: HostBalancerUnavailablePolicy;
    stickyEnabled: boolean;
    rebalanceExistingAssignmentsByTraffic: boolean;
    trafficMetric: HostBalancerTrafficMetric | null;
    createdAt: Date;
    updatedAt: Date;

    constructor(data: HostBalancerEntity) {
        Object.assign(this, data);
    }
}
