import { UserSubscriptionRequestHistoryEntity } from '../entities';

export class BaseSubscriptionRequestHistoryResponseModel {
    public readonly id: number;
    public readonly userUuid: string;
    public readonly requestAt: Date;
    public readonly requestIp: string | null;
    public readonly userAgent: string | null;

    constructor(data: UserSubscriptionRequestHistoryEntity) {
        this.id = Number(data.id);
        this.userUuid = data.userUuid;

        this.requestAt = data.requestAt;
        this.requestIp = data.requestIp;
        this.userAgent = data.userAgent;
    }
}
