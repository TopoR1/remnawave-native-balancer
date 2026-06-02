import { HostBalancerTargetStatus } from '@prisma/client';

export class HostBalancerTargetEntity {
    uuid: string;
    balancerUuid: string;
    nodeUuid: string | null;
    enabled: boolean;
    status: HostBalancerTargetStatus;
    weight: number;
    priority: number;
    maxAssignedUsers: number | null;
    overrideAddress: string | null;
    overridePort: number | null;
    overrideSni: string | null;
    overrideHost: string | null;
    overridePath: string | null;
    warning?: string | null;
    createdAt: Date;
    updatedAt: Date;

    constructor(data: HostBalancerTargetEntity) {
        Object.assign(this, data);
    }
}
