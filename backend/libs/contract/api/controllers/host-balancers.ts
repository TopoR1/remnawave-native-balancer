export const HOST_BALANCERS_CONTROLLER = 'host-balancers' as const;

export const HOST_BALANCERS_ROUTES = {
    GET: (hostUuid: string) => `${hostUuid}`,
    UPDATE: (hostUuid: string) => `${hostUuid}`,
    TOGGLE: (hostUuid: string) => `${hostUuid}/toggle`,
    TARGETS: (hostUuid: string) => `${hostUuid}/targets`,
    PREVIEW: (hostUuid: string) => `${hostUuid}/preview`,
    STATS: (hostUuid: string) => `${hostUuid}/stats`,
    DECISIONS: (hostUuid: string) => `${hostUuid}/decisions`,
} as const;
