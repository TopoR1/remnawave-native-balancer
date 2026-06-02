export const HostBalancerStrategy = {
    LEAST_ASSIGNED: "LEAST_ASSIGNED",
    WEIGHTED: "WEIGHTED",
    RANDOM: "RANDOM",
    PRIORITY_FAILOVER: "PRIORITY_FAILOVER",
    LEAST_TRAFFIC: "LEAST_TRAFFIC",
    WEIGHTED_LEAST_TRAFFIC: "WEIGHTED_LEAST_TRAFFIC"
} as const;
export type HostBalancerStrategy = (typeof HostBalancerStrategy)[keyof typeof HostBalancerStrategy];
export const HostBalancerUnavailablePolicy = {
    HIDE_HOST: "HIDE_HOST",
    ORIGINAL_HOST: "ORIGINAL_HOST",
    KEEP_LAST_IF_POSSIBLE: "KEEP_LAST_IF_POSSIBLE"
} as const;
export type HostBalancerUnavailablePolicy = (typeof HostBalancerUnavailablePolicy)[keyof typeof HostBalancerUnavailablePolicy];
export const HostBalancerTrafficMetric = {
    CURRENT_PERIOD: "CURRENT_PERIOD",
    LAST_24H: "LAST_24H",
    LAST_6H: "LAST_6H",
    LAST_1H: "LAST_1H"
} as const;
export type HostBalancerTrafficMetric = (typeof HostBalancerTrafficMetric)[keyof typeof HostBalancerTrafficMetric];
export const HostBalancerTargetStatus = {
    ACTIVE: "ACTIVE",
    DRAINING: "DRAINING",
    DISABLED: "DISABLED",
    DEAD: "DEAD"
} as const;
export type HostBalancerTargetStatus = (typeof HostBalancerTargetStatus)[keyof typeof HostBalancerTargetStatus];
