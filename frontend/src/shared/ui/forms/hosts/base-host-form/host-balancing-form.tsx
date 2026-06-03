import {
    ActionIcon,
    Alert,
    Badge,
    Button,
    Card,
    Checkbox,
    Divider,
    Group,
    Modal,
    NumberInput,
    ScrollArea,
    Select,
    SimpleGrid,
    Stack,
    Switch,
    Table,
    Text,
    TextInput,
    Tooltip
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { isAxiosError } from 'axios'
import { useTranslation } from 'react-i18next'
import { TFunction } from 'i18next'
import { PiFlaskDuotone, PiPlus, PiScalesDuotone, PiTrashDuotone } from 'react-icons/pi'
import { TbActivityHeartbeat, TbAlertTriangle, TbPlayerPause, TbSkull } from 'react-icons/tb'
import { nanoid } from 'nanoid'
import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { GetAllNodesCommand } from '@remnawave/backend-contract'

import {
    HostBalancer,
    HostBalancerDecision,
    HostBalancerPreview,
    HostBalancerPreviewSchema,
    HostBalancerStrategy,
    HostBalancerTargetInput,
    HostBalancerTargetStatus,
    HostBalancerTargetValidation,
    HostBalancerTargetsValidation,
    HostBalancerTrafficMetric,
    HostBalancerUnavailablePolicy,
    useGetHostBalancerDecisions,
    useGetRemnawaveSettings,
    useValidateHostBalancerTargets
} from '@shared/api/hooks'
import { RemnawaveSettings } from '@shared/api/hooks/remnawave-settings/remnawave-settings.query.hooks'
import { instance } from '@shared/api'
import { BaseOverlayHeader } from '@shared/ui/overlays/base-overlay-header'
import { HelpTooltip } from '@shared/ui/help-tooltip'
import { SectionCard } from '@shared/ui/section-card'

type DraftTarget = HostBalancerTargetInput & {
    localId: string
    assignments?: number
    trafficBytes?: string | null
}
type HostBalancerNode = GetAllNodesCommand.Response['response'][number]
type PreviewSimulatorAction =
    | 'preview_only'
    | 'would_create'
    | 'would_reuse'
    | 'would_reassign'
    | 'would_fallback'
type LegacyPreviewAction = 'preview_only' | 'reused' | 'would_create' | 'would_reassign'
type PreviewFallbackResult = 'hidden' | 'original_host' | 'last_assignment' | 'none'
type PreviewDiagnosticsRow = NonNullable<NonNullable<HostBalancerPreview['candidates']>[number]>
type HostBalancerHelpKey =
    | 'base-host-form.help-policy-hide-host-description'
    | 'base-host-form.help-policy-keep-last-description'
    | 'base-host-form.help-policy-original-host-description'
    | 'base-host-form.help-priority-description'
    | 'base-host-form.help-rebalance-existing-assignments-description'
    | 'base-host-form.help-sticky-assignments-description'
    | 'base-host-form.help-strategy-description'
    | 'base-host-form.help-strategy-least-assigned-description'
    | 'base-host-form.help-strategy-least-traffic-description'
    | 'base-host-form.help-strategy-priority-failover-description'
    | 'base-host-form.help-strategy-random-description'
    | 'base-host-form.help-strategy-weighted-description'
    | 'base-host-form.help-strategy-weighted-least-traffic-description'
    | 'base-host-form.help-subscription-address-description'
    | 'base-host-form.help-subscription-port-description'
    | 'base-host-form.help-traffic-strategy-description'
    | 'base-host-form.help-unavailable-policy-description'
    | 'base-host-form.help-weight-description'
    | 'base-host-form.priority'
    | 'base-host-form.rebalance-existing-assignments-by-traffic'
    | 'base-host-form.sticky-assignments'
    | 'base-host-form.strategy'
    | 'base-host-form.subscription-address'
    | 'base-host-form.subscription-port'
    | 'base-host-form.traffic-metric'
    | 'base-host-form.unavailable-policy'
    | 'base-host-form.weight'

export type HostBalancingDraft = {
    enabled: boolean
    strategy: HostBalancerStrategy
    stickyEnabled: boolean
    rebalanceExistingAssignmentsByTraffic: boolean
    unavailablePolicy: HostBalancerUnavailablePolicy
    trafficMetric: HostBalancerTrafficMetric | null
    targets: DraftTarget[]
    touched: boolean
}

export const DEFAULT_HOST_BALANCING_DRAFT: HostBalancingDraft = {
    enabled: false,
    strategy: 'LEAST_ASSIGNED',
    stickyEnabled: true,
    rebalanceExistingAssignmentsByTraffic: false,
    unavailablePolicy: 'HIDE_HOST',
    trafficMetric: 'CURRENT_PERIOD',
    targets: [],
    touched: false
}

export function shouldEnableHostSave(hostFormChanged: boolean, hostBalancingTouched: boolean) {
    return hostFormChanged || hostBalancingTouched
}

export function patchHostBalancingDraft(
    draft: HostBalancingDraft,
    patch: Partial<HostBalancingDraft>
): HostBalancingDraft {
    return {
        ...draft,
        ...patch,
        touched: true
    }
}

export function updateHostBalancingTarget(
    draft: HostBalancingDraft,
    localId: string,
    patch: Partial<DraftTarget>
): HostBalancingDraft {
    return patchHostBalancingDraft(draft, {
        targets: draft.targets.map((target) =>
            target.localId === localId ? { ...target, ...patch } : target
        )
    })
}

type IProps = {
    draft: HostBalancingDraft
    hostPort?: number
    hostUuid?: string
    nodes: GetAllNodesCommand.Response['response']
    onChange: (draft: HostBalancingDraft) => void
    onValidationChange?: (validation: HostBalancerTargetsValidation | null) => void
    requiredInboundUuid?: string
}

const TRAFFIC_STRATEGIES: HostBalancerStrategy[] = ['LEAST_TRAFFIC', 'WEIGHTED_LEAST_TRAFFIC']
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const HOST_BALANCER_BUILD_MARKER = 'Native Host Balancer UI'

export function hostBalancerToDraft(settings: HostBalancer | null): HostBalancingDraft {
    if (!settings) {
        return DEFAULT_HOST_BALANCING_DRAFT
    }

    return {
        enabled: settings.enabled,
        strategy: settings.strategy,
        stickyEnabled: settings.stickyEnabled,
        rebalanceExistingAssignmentsByTraffic: settings.rebalanceExistingAssignmentsByTraffic,
        unavailablePolicy: settings.unavailablePolicy,
        trafficMetric: settings.trafficMetric ?? 'CURRENT_PERIOD',
        targets:
            settings.targets?.map((target) => ({
                uuid: target.uuid,
                localId: target.uuid,
                nodeUuid: target.nodeUuid,
                enabled: target.enabled,
                status: target.status,
                weight: target.weight,
                priority: target.priority,
                maxAssignedUsers: target.maxAssignedUsers,
                overrideAddress: target.overrideAddress,
                overridePort: target.overridePort,
                overrideSni: target.overrideSni,
                overrideHost: target.overrideHost,
                overridePath: target.overridePath
            })) ?? [],
        touched: false
    }
}

export function sanitizeHostBalancingDraft(draft: HostBalancingDraft): {
    settings: Omit<HostBalancingDraft, 'targets' | 'touched'>
    targets: HostBalancerTargetInput[]
} {
    return {
        settings: {
            enabled: draft.enabled,
            strategy: draft.strategy,
            stickyEnabled: draft.stickyEnabled,
            rebalanceExistingAssignmentsByTraffic: draft.rebalanceExistingAssignmentsByTraffic,
            unavailablePolicy: draft.unavailablePolicy,
            trafficMetric: TRAFFIC_STRATEGIES.includes(draft.strategy)
                ? (draft.trafficMetric ?? 'CURRENT_PERIOD')
                : null
        },
        targets: draft.targets.map((target) => ({
            localId: target.localId,
            uuid: target.uuid,
            nodeUuid: target.nodeUuid || null,
            enabled: target.enabled ?? true,
            status: target.status ?? 'ACTIVE',
            weight: target.weight ?? 1,
            priority: target.priority ?? 100,
            maxAssignedUsers: target.maxAssignedUsers ?? null,
            overrideAddress: emptyToNull(target.overrideAddress),
            overridePort: target.overridePort ?? null,
            overrideSni: emptyToNull(target.overrideSni),
            overrideHost: emptyToNull(target.overrideHost),
            overridePath: emptyToNull(target.overridePath)
        }))
    }
}

export function HostBalancingForm({
    draft,
    hostPort,
    hostUuid,
    nodes,
    onChange,
    onValidationChange,
    requiredInboundUuid
}: IProps) {
    const { t } = useTranslation()
    const [previewUserUuid, setPreviewUserUuid] = useState('')
    const [preview, setPreview] = useState<HostBalancerPreview | null>(null)
    const [previewError, setPreviewError] = useState<string | null>(null)
    const [validation, setValidation] = useState<HostBalancerTargetsValidation | null>(null)
    const [isPreviewLoading, setPreviewLoading] = useState(false)
    const [isTargetPickerOpen, setTargetPickerOpen] = useState(false)
    const [targetSearch, setTargetSearch] = useState('')
    const [showOnlyCompatible, setShowOnlyCompatible] = useState(false)
    const [editingTargetLocalId, setEditingTargetLocalId] = useState<string | null>(null)
    const { mutateAsync: validateTargetsAsync } = useValidateHostBalancerTargets()
    const { data: remnawaveSettings } = useGetRemnawaveSettings()
    const decisionsQuery = useGetHostBalancerDecisions({
        route: { hostUuid: hostUuid ?? '' },
        query: { limit: 50 },
        rQueryParams: {
            enabled: !!hostUuid
        }
    })

    const nodeByUuid = useMemo(() => new Map(nodes.map((node) => [node.uuid, node])), [nodes])

    const isTrafficStrategy = TRAFFIC_STRATEGIES.includes(draft.strategy)
    const validationPayload = useMemo(
        () => JSON.stringify(sanitizeHostBalancingDraft(draft).targets),
        [draft]
    )

    useEffect(() => {
        if (!hostUuid) {
            setValidation(null)
            onValidationChange?.(null)
            return
        }

        let isCurrent = true
        const targets = JSON.parse(validationPayload) as HostBalancerTargetInput[]

        const timeout = window.setTimeout(() => {
            validateTargetsAsync({
                route: { hostUuid },
                variables: { targets }
            })
                .then((response) => {
                    if (!isCurrent) {
                        return
                    }

                    setValidation(response)
                    onValidationChange?.(response)
                })
                .catch(() => {
                    if (!isCurrent) {
                        return
                    }

                    setValidation(null)
                    onValidationChange?.(null)
                })
        }, 400)

        return () => {
            isCurrent = false
            window.clearTimeout(timeout)
        }
    }, [hostUuid, onValidationChange, validateTargetsAsync, validationPayload])

    const patchDraft = (patch: Partial<HostBalancingDraft>) => {
        onChange(patchHostBalancingDraft(draft, patch))
    }

    const updateTarget = (localId: string, patch: Partial<DraftTarget>) => {
        onChange(updateHostBalancingTarget(draft, localId, patch))
    }

    const filteredNodes = useMemo(() => {
        const search = targetSearch.trim().toLowerCase()

        return nodes.filter((node) => {
            const hasRequiredInbound = nodeHasRequiredInbound(node, requiredInboundUuid)
            const matchesSearch =
                !search ||
                node.name.toLowerCase().includes(search) ||
                node.address.toLowerCase().includes(search) ||
                node.uuid.toLowerCase().includes(search)

            return matchesSearch && (!showOnlyCompatible || hasRequiredInbound === true)
        })
    }, [nodes, requiredInboundUuid, showOnlyCompatible, targetSearch])

    const targetSummary = useMemo(() => {
        const activeTargets = draft.targets.filter(
            (target) => target.enabled !== false && (target.status ?? 'ACTIVE') === 'ACTIVE'
        )

        return {
            total: draft.targets.length,
            active: activeTargets.length,
            valid: validation?.summary.valid ?? draft.targets.length,
            errors: validation?.summary.errors ?? 0,
            assignments: draft.targets.reduce((sum, target) => sum + (target.assignments ?? 0), 0)
        }
    }, [draft.targets, validation])

    const addTarget = (node: HostBalancerNode) => {
        patchDraft({
            targets: [
                ...draft.targets,
                {
                    localId: nanoid(),
                    nodeUuid: node.uuid,
                    enabled: true,
                    status: 'ACTIVE',
                    weight: 1,
                    priority: 100,
                    maxAssignedUsers: null,
                    overrideAddress: node.address,
                    overridePort: hostPort ?? node.port ?? null,
                    overrideSni: null,
                    overrideHost: null,
                    overridePath: null
                }
            ]
        })
        setTargetPickerOpen(false)
        setTargetSearch('')
    }

    const removeTarget = (localId: string) => {
        patchDraft({
            targets: draft.targets.filter((target) => target.localId !== localId)
        })
    }

    const setStatus = (localId: string, status: HostBalancerTargetStatus) => {
        updateTarget(localId, {
            status,
            enabled: status !== 'DISABLED' && status !== 'DEAD'
        })
    }

    const handlePreview = async () => {
        const lookup = previewUserUuid.trim()
        if (!hostUuid || !lookup) {
            const message = t('base-host-form.preview-user-required')
            setPreview(null)
            setPreviewError(message)
            notifications.show({
                color: 'red',
                title: t('base-host-form.preview-error'),
                message
            })
            return
        }

        setPreviewLoading(true)
        setPreview(null)
        setPreviewError(null)
        try {
            const response = await instance.get(`/api/host-balancers/${hostUuid}/preview`, {
                params: UUID_PATTERN.test(lookup) ? { userUuid: lookup } : { shortUuid: lookup }
            })
            const parsed = await HostBalancerPreviewSchema.parseAsync(response.data.response)
            setPreview(parsed)
        } catch (error) {
            const message = resolvePreviewErrorMessage(error, t)
            setPreviewError(message)
            notifications.show({
                color: 'red',
                title: t('base-host-form.preview-error'),
                message
            })
        } finally {
            setPreviewLoading(false)
        }
    }

    const helpLabel = (labelKey: HostBalancerHelpKey, descriptionKey: HostBalancerHelpKey) => (
        <Group gap={4} wrap="nowrap">
            <span>{t(labelKey)}</span>
            <HelpTooltip description={String(t(descriptionKey))} label={String(t(labelKey))} />
        </Group>
    )

    return (
        <SectionCard.Root>
            <span data-native-host-balancer-ui={HOST_BALANCER_BUILD_MARKER} hidden />
            <SectionCard.Section>
                <Group justify="space-between">
                    <Group gap="xs">
                        <BaseOverlayHeader
                            iconColor="teal"
                            IconComponent={PiScalesDuotone}
                            iconVariant="soft"
                            title={t('base-host-form.balancing')}
                            titleOrder={5}
                        />
                        <HelpTooltip
                            description={String(t('base-host-form.help-balancing-description'))}
                            label={String(t('base-host-form.balancing'))}
                        />
                    </Group>
                    <Switch
                        checked={draft.enabled}
                        color="teal.8"
                        label={t('base-host-form.enable-balancing')}
                        onChange={(event) => patchDraft({ enabled: event.currentTarget.checked })}
                    />
                </Group>
                <HostBalancerRuntimeStatus settings={remnawaveSettings} />
            </SectionCard.Section>

            {draft.enabled && (
                <SectionCard.Section>
                    <Stack gap="md">
                        <Group align="flex-start" grow>
                            <Select
                                allowDeselect={false}
                                data={[
                                    {
                                        value: 'LEAST_ASSIGNED',
                                        label: t('base-host-form.strategy-least-assigned')
                                    },
                                    {
                                        value: 'WEIGHTED',
                                        label: t('base-host-form.strategy-weighted')
                                    },
                                    {
                                        value: 'LEAST_TRAFFIC',
                                        label: t('base-host-form.strategy-least-traffic')
                                    },
                                    {
                                        value: 'WEIGHTED_LEAST_TRAFFIC',
                                        label: t('base-host-form.strategy-weighted-least-traffic')
                                    },
                                    {
                                        value: 'PRIORITY_FAILOVER',
                                        label: t('base-host-form.strategy-priority-failover')
                                    },
                                    {
                                        value: 'RANDOM',
                                        label: t('base-host-form.strategy-random')
                                    }
                                ]}
                                description={t(strategyHelpKey(draft.strategy))}
                                label={helpLabel(
                                    'base-host-form.strategy',
                                    'base-host-form.help-strategy-description'
                                )}
                                onChange={(value) =>
                                    patchDraft({ strategy: value as HostBalancerStrategy })
                                }
                                value={draft.strategy}
                            />
                            <Select
                                allowDeselect={false}
                                data={[
                                    {
                                        value: 'HIDE_HOST',
                                        label: t('base-host-form.policy-hide-host')
                                    },
                                    {
                                        value: 'ORIGINAL_HOST',
                                        label: t('base-host-form.policy-original-host')
                                    },
                                    {
                                        value: 'KEEP_LAST_IF_POSSIBLE',
                                        label: t('base-host-form.policy-keep-last')
                                    }
                                ]}
                                description={t(policyHelpKey(draft.unavailablePolicy))}
                                label={helpLabel(
                                    'base-host-form.unavailable-policy',
                                    'base-host-form.help-unavailable-policy-description'
                                )}
                                onChange={(value) =>
                                    patchDraft({
                                        unavailablePolicy: value as HostBalancerUnavailablePolicy
                                    })
                                }
                                value={draft.unavailablePolicy}
                            />
                        </Group>

                        <Group align="flex-start" grow>
                            <Switch
                                checked={draft.stickyEnabled}
                                color="teal.8"
                                label={helpLabel(
                                    'base-host-form.sticky-assignments',
                                    'base-host-form.help-sticky-assignments-description'
                                )}
                                onChange={(event) =>
                                    patchDraft({ stickyEnabled: event.currentTarget.checked })
                                }
                            />
                            {isTrafficStrategy && (
                                <Switch
                                    checked={draft.rebalanceExistingAssignmentsByTraffic}
                                    color="teal.8"
                                    label={helpLabel(
                                        'base-host-form.rebalance-existing-assignments-by-traffic',
                                        'base-host-form.help-rebalance-existing-assignments-description'
                                    )}
                                    onChange={(event) =>
                                        patchDraft({
                                            rebalanceExistingAssignmentsByTraffic:
                                                event.currentTarget.checked
                                        })
                                    }
                                />
                            )}
                        </Group>

                        {isTrafficStrategy && (
                            <Select
                                allowDeselect={false}
                                data={[
                                    {
                                        value: 'CURRENT_PERIOD',
                                        label: t('base-host-form.metric-current-period')
                                    },
                                    {
                                        value: 'LAST_24H',
                                        label: t('base-host-form.metric-last-24h')
                                    },
                                    { value: 'LAST_6H', label: t('base-host-form.metric-last-6h') },
                                    { value: 'LAST_1H', label: t('base-host-form.metric-last-1h') }
                                ]}
                                label={helpLabel(
                                    'base-host-form.traffic-metric',
                                    'base-host-form.help-traffic-strategy-description'
                                )}
                                onChange={(value) =>
                                    patchDraft({
                                        trafficMetric: value as HostBalancerTrafficMetric
                                    })
                                }
                                value={draft.trafficMetric ?? 'CURRENT_PERIOD'}
                            />
                        )}

                        <Divider />

                        <Stack gap="sm">
                            <Group align="flex-start" justify="space-between">
                                <Stack gap={4}>
                                    <Group gap={4}>
                                        <Text fw={600}>{t('base-host-form.targets')}</Text>
                                        <HelpTooltip
                                            description={String(
                                                t('base-host-form.help-target-nodes-description')
                                            )}
                                            label={String(t('base-host-form.targets'))}
                                        />
                                    </Group>
                                    <Text c="dimmed" size="sm">
                                        {t('base-host-form.target-nodes-description')}
                                    </Text>
                                </Stack>
                                <Button
                                    leftSection={<PiPlus size={16} />}
                                    onClick={() => setTargetPickerOpen(true)}
                                    size="xs"
                                >
                                    {t('base-host-form.add-target')}
                                </Button>
                            </Group>

                            <Group gap="xs">
                                <Badge color="gray" variant="light">
                                    {t('base-host-form.targets-total', {
                                        count: targetSummary.total
                                    })}
                                </Badge>
                                <Badge color="teal" variant="light">
                                    {t('base-host-form.targets-active', {
                                        count: targetSummary.active
                                    })}
                                </Badge>
                                <Badge color="green" variant="light">
                                    {t('base-host-form.targets-valid', {
                                        count: targetSummary.valid
                                    })}
                                </Badge>
                                <Badge
                                    color={targetSummary.errors > 0 ? 'red' : 'gray'}
                                    variant="light"
                                >
                                    {t('base-host-form.targets-errors', {
                                        count: targetSummary.errors
                                    })}
                                </Badge>
                                <Badge color="blue" variant="light">
                                    {t('base-host-form.targets-assignments', {
                                        count: targetSummary.assignments
                                    })}
                                </Badge>
                            </Group>

                            {draft.targets.length === 0 && (
                                <Alert color="gray" variant="light">
                                    {t('base-host-form.no-balancer-targets')}
                                </Alert>
                            )}

                            <SimpleGrid cols={{ base: 1, xl: 2 }}>
                                {draft.targets.map((target, index) => {
                                    const targetValidation = validation?.targets[index] ?? null
                                    const node = target.nodeUuid
                                        ? nodeByUuid.get(target.nodeUuid)
                                        : undefined
                                    const nodeName =
                                        targetValidation?.nodeName ??
                                        node?.name ??
                                        t('base-host-form.target-node-not-selected')
                                    const nodeAddress =
                                        targetValidation?.nodeAddress ?? node?.address ?? '-'
                                    const subscriptionAddress =
                                        target.overrideAddress ||
                                        t('base-host-form.original-host-address')
                                    const subscriptionPort = target.overridePort ?? hostPort ?? '-'
                                    const nodeStatus =
                                        targetValidation?.nodeStatus ?? resolveLocalNodeStatus(node)
                                    const isActiveTarget =
                                        target.enabled !== false &&
                                        (target.status ?? 'ACTIVE') === 'ACTIVE'
                                    const participates =
                                        isActiveTarget &&
                                        (targetValidation?.severity ?? 'warning') === 'ok'
                                    const hasMissingInbound =
                                        targetValidation?.hasRequiredInbound === false
                                    const hasAddressMismatch =
                                        !!target.overrideAddress &&
                                        !!node?.address &&
                                        target.overrideAddress !== node.address
                                    const isEditing = editingTargetLocalId === target.localId

                                    return (
                                        <Card
                                            key={target.localId}
                                            padding="md"
                                            radius="sm"
                                            withBorder
                                        >
                                            <Stack gap="sm">
                                                <Group align="flex-start" justify="space-between">
                                                    <Stack gap={2}>
                                                        <Group gap="xs">
                                                            <Text fw={700}>{nodeName}</Text>
                                                            {target.nodeUuid && (
                                                                <Badge variant="light">
                                                                    {maskUuid(target.nodeUuid)}
                                                                </Badge>
                                                            )}
                                                        </Group>
                                                        <Text c="dimmed" size="sm">
                                                            {nodeAddress}
                                                        </Text>
                                                    </Stack>
                                                    <Stack align="flex-end" gap={4}>
                                                        <Group gap={4} justify="flex-end">
                                                            {statusBadge(
                                                                target.status ?? 'ACTIVE',
                                                                t
                                                            )}
                                                            <HelpTooltip
                                                                description={String(
                                                                    t(
                                                                        'base-host-form.help-target-status-description'
                                                                    )
                                                                )}
                                                                label={String(
                                                                    t('base-host-form.status')
                                                                )}
                                                            />
                                                        </Group>
                                                        {validationBadge(targetValidation, t)}
                                                        <Badge
                                                            color={participates ? 'teal' : 'red'}
                                                            variant="light"
                                                        >
                                                            {participates
                                                                ? t(
                                                                      'base-host-form.target-participates'
                                                                  )
                                                                : t(
                                                                      'base-host-form.target-not-participating'
                                                                  )}
                                                        </Badge>
                                                    </Stack>
                                                </Group>

                                                <SimpleGrid cols={{ base: 1, sm: 2 }}>
                                                    <TargetInfo
                                                        label={helpLabel(
                                                            'base-host-form.subscription-address',
                                                            'base-host-form.help-subscription-address-description'
                                                        )}
                                                        value={subscriptionAddress}
                                                    />
                                                    <TargetInfo
                                                        label={helpLabel(
                                                            'base-host-form.subscription-port',
                                                            'base-host-form.help-subscription-port-description'
                                                        )}
                                                        value={subscriptionPort}
                                                    />
                                                    <TargetInfo
                                                        label={t('base-host-form.node-status')}
                                                        value={nodeStatusBadge(nodeStatus, t)}
                                                    />
                                                    <TargetInfo
                                                        label={t(
                                                            'base-host-form.inbound-compatibility'
                                                        )}
                                                        value={inboundCompatibilityBadge(
                                                            targetValidation,
                                                            t
                                                        )}
                                                    />
                                                    <TargetInfo
                                                        label={t('base-host-form.assignments')}
                                                        value={target.assignments ?? 0}
                                                    />
                                                    <TargetInfo
                                                        label={t('base-host-form.traffic')}
                                                        value={target.trafficBytes ?? '-'}
                                                    />
                                                    <TargetInfo
                                                        label={helpLabel(
                                                            'base-host-form.weight',
                                                            'base-host-form.help-weight-description'
                                                        )}
                                                        value={target.weight ?? 1}
                                                    />
                                                    <TargetInfo
                                                        label={helpLabel(
                                                            'base-host-form.priority',
                                                            'base-host-form.help-priority-description'
                                                        )}
                                                        value={target.priority ?? 100}
                                                    />
                                                </SimpleGrid>

                                                {hasAddressMismatch && (
                                                    <Alert color="yellow" variant="light">
                                                        {t(
                                                            'base-host-form.override-address-mismatch-warning'
                                                        )}
                                                    </Alert>
                                                )}
                                                {hasMissingInbound && isActiveTarget && (
                                                    <Alert color="red" variant="light">
                                                        {t(
                                                            'base-host-form.validation-reason-missing-inbound'
                                                        )}
                                                    </Alert>
                                                )}
                                                {hasMissingInbound && !isActiveTarget && (
                                                    <Alert color="yellow" variant="light">
                                                        {t(
                                                            'base-host-form.disabled-target-missing-inbound-warning'
                                                        )}
                                                    </Alert>
                                                )}
                                                {nodeStatus !== 'connected' && (
                                                    <Alert
                                                        color={
                                                            nodeStatus === 'connecting'
                                                                ? 'yellow'
                                                                : 'red'
                                                        }
                                                        variant="light"
                                                    >
                                                        {t('base-host-form.node-state-warning')}
                                                    </Alert>
                                                )}
                                                {targetValidation?.reasons.map((reason) => (
                                                    <Text
                                                        c={
                                                            targetValidation.severity === 'error'
                                                                ? 'red'
                                                                : 'yellow'
                                                        }
                                                        key={reason}
                                                        size="xs"
                                                    >
                                                        {translateValidationReason(reason, t)}
                                                    </Text>
                                                ))}

                                                {isEditing && (
                                                    <SimpleGrid cols={{ base: 1, sm: 2 }}>
                                                        <TextInput
                                                            label={t(
                                                                'base-host-form.override-address'
                                                            )}
                                                            onChange={(event) =>
                                                                updateTarget(target.localId, {
                                                                    overrideAddress:
                                                                        event.currentTarget.value
                                                                })
                                                            }
                                                            value={target.overrideAddress ?? ''}
                                                        />
                                                        <NumberInput
                                                            allowDecimal={false}
                                                            allowNegative={false}
                                                            label={t(
                                                                'base-host-form.override-port'
                                                            )}
                                                            max={65535}
                                                            min={1}
                                                            onChange={(value) =>
                                                                updateTarget(target.localId, {
                                                                    overridePort:
                                                                        typeof value === 'number'
                                                                            ? value
                                                                            : null
                                                                })
                                                            }
                                                            value={target.overridePort ?? undefined}
                                                        />
                                                        <TextInput
                                                            label={t('base-host-form.override-sni')}
                                                            onChange={(event) =>
                                                                updateTarget(target.localId, {
                                                                    overrideSni:
                                                                        event.currentTarget.value
                                                                })
                                                            }
                                                            value={target.overrideSni ?? ''}
                                                        />
                                                        <TextInput
                                                            label={t(
                                                                'base-host-form.override-host'
                                                            )}
                                                            onChange={(event) =>
                                                                updateTarget(target.localId, {
                                                                    overrideHost:
                                                                        event.currentTarget.value
                                                                })
                                                            }
                                                            value={target.overrideHost ?? ''}
                                                        />
                                                        <TextInput
                                                            label={t(
                                                                'base-host-form.override-path'
                                                            )}
                                                            onChange={(event) =>
                                                                updateTarget(target.localId, {
                                                                    overridePath:
                                                                        event.currentTarget.value
                                                                })
                                                            }
                                                            value={target.overridePath ?? ''}
                                                        />
                                                        <NumberInput
                                                            allowDecimal={false}
                                                            allowNegative={false}
                                                            label={t('base-host-form.weight')}
                                                            min={1}
                                                            onChange={(value) =>
                                                                updateTarget(target.localId, {
                                                                    weight:
                                                                        typeof value === 'number'
                                                                            ? value
                                                                            : 1
                                                                })
                                                            }
                                                            value={target.weight ?? 1}
                                                        />
                                                        <NumberInput
                                                            allowDecimal={false}
                                                            allowNegative={false}
                                                            label={t('base-host-form.priority')}
                                                            min={0}
                                                            onChange={(value) =>
                                                                updateTarget(target.localId, {
                                                                    priority:
                                                                        typeof value === 'number'
                                                                            ? value
                                                                            : 100
                                                                })
                                                            }
                                                            value={target.priority ?? 100}
                                                        />
                                                        <NumberInput
                                                            allowDecimal={false}
                                                            allowNegative={false}
                                                            label={t(
                                                                'base-host-form.max-assigned-users'
                                                            )}
                                                            min={1}
                                                            onChange={(value) =>
                                                                updateTarget(target.localId, {
                                                                    maxAssignedUsers:
                                                                        typeof value === 'number'
                                                                            ? value
                                                                            : null
                                                                })
                                                            }
                                                            value={
                                                                target.maxAssignedUsers ?? undefined
                                                            }
                                                        />
                                                        <Switch
                                                            checked={target.enabled ?? true}
                                                            color="teal.8"
                                                            label={t(
                                                                'base-host-form.target-enabled'
                                                            )}
                                                            onChange={(event) =>
                                                                updateTarget(target.localId, {
                                                                    enabled:
                                                                        event.currentTarget.checked
                                                                })
                                                            }
                                                        />
                                                    </SimpleGrid>
                                                )}

                                                <Group gap="xs">
                                                    <Button
                                                        onClick={() =>
                                                            setEditingTargetLocalId(
                                                                isEditing ? null : target.localId
                                                            )
                                                        }
                                                        size="xs"
                                                        variant="light"
                                                    >
                                                        {t('base-host-form.configure-target')}
                                                    </Button>
                                                    <Button
                                                        color="yellow"
                                                        leftSection={<TbPlayerPause size={16} />}
                                                        onClick={() =>
                                                            setStatus(target.localId, 'DRAINING')
                                                        }
                                                        size="xs"
                                                        variant="light"
                                                    >
                                                        {t('base-host-form.set-draining-short')}
                                                    </Button>
                                                    <Button
                                                        color="gray"
                                                        leftSection={<TbAlertTriangle size={16} />}
                                                        onClick={() =>
                                                            setStatus(target.localId, 'DISABLED')
                                                        }
                                                        size="xs"
                                                        variant="light"
                                                    >
                                                        {t('base-host-form.disable-target')}
                                                    </Button>
                                                    <Button
                                                        color="red"
                                                        leftSection={<TbSkull size={16} />}
                                                        onClick={() =>
                                                            setStatus(target.localId, 'DEAD')
                                                        }
                                                        size="xs"
                                                        variant="light"
                                                    >
                                                        {t('base-host-form.mark-dead-short')}
                                                    </Button>
                                                    <Button
                                                        color="red"
                                                        leftSection={<PiTrashDuotone size={16} />}
                                                        onClick={() => removeTarget(target.localId)}
                                                        size="xs"
                                                        variant="subtle"
                                                    >
                                                        {t('base-host-form.remove-target-short')}
                                                    </Button>
                                                    {(target.status ?? 'ACTIVE') !== 'ACTIVE' && (
                                                        <Button
                                                            color="teal"
                                                            leftSection={
                                                                <TbActivityHeartbeat size={16} />
                                                            }
                                                            onClick={() =>
                                                                setStatus(target.localId, 'ACTIVE')
                                                            }
                                                            size="xs"
                                                            variant="light"
                                                        >
                                                            {t('base-host-form.set-active-short')}
                                                        </Button>
                                                    )}
                                                </Group>
                                            </Stack>
                                        </Card>
                                    )
                                })}
                            </SimpleGrid>
                        </Stack>

                        <Modal
                            onClose={() => setTargetPickerOpen(false)}
                            opened={isTargetPickerOpen}
                            size="xl"
                            title={t('base-host-form.add-target-node')}
                        >
                            <Stack gap="md">
                                <Group align="flex-end">
                                    <TextInput
                                        label={t('base-host-form.search-target-nodes')}
                                        onChange={(event) =>
                                            setTargetSearch(event.currentTarget.value)
                                        }
                                        placeholder={t(
                                            'base-host-form.search-target-nodes-placeholder'
                                        )}
                                        value={targetSearch}
                                    />
                                    <Checkbox
                                        checked={showOnlyCompatible}
                                        label={t('base-host-form.show-compatible-only')}
                                        onChange={(event) =>
                                            setShowOnlyCompatible(event.currentTarget.checked)
                                        }
                                    />
                                </Group>

                                {!requiredInboundUuid && (
                                    <Alert color="yellow" variant="light">
                                        {t(
                                            'base-host-form.select-inbound-before-filtering-targets'
                                        )}
                                    </Alert>
                                )}

                                <Stack gap="sm">
                                    {filteredNodes.length === 0 && (
                                        <Alert color="gray" variant="light">
                                            {t('base-host-form.no-target-nodes-found')}
                                        </Alert>
                                    )}

                                    {filteredNodes.map((node) => {
                                        const nodeStatus = resolveLocalNodeStatus(node)
                                        const hasRequiredInbound = nodeHasRequiredInbound(
                                            node,
                                            requiredInboundUuid
                                        )
                                        const existingTarget = draft.targets.find(
                                            (target) => target.nodeUuid === node.uuid
                                        )
                                        const canAdd =
                                            !existingTarget && hasRequiredInbound !== false

                                        return (
                                            <Card
                                                key={node.uuid}
                                                padding="md"
                                                radius="sm"
                                                withBorder
                                            >
                                                <Group align="flex-start" justify="space-between">
                                                    <Stack gap={6}>
                                                        <Group gap="xs">
                                                            <Text fw={700}>{node.name}</Text>
                                                            <Badge variant="light">
                                                                {maskUuid(node.uuid)}
                                                            </Badge>
                                                        </Group>
                                                        <Text c="dimmed" size="sm">
                                                            {node.address}
                                                        </Text>
                                                        <Group gap="xs">
                                                            {nodeStatusBadge(nodeStatus, t)}
                                                            {localInboundCompatibilityBadge(
                                                                hasRequiredInbound,
                                                                t
                                                            )}
                                                            {existingTarget && (
                                                                <Badge color="gray" variant="light">
                                                                    {t(
                                                                        'base-host-form.target-node-already-added'
                                                                    )}
                                                                </Badge>
                                                            )}
                                                        </Group>
                                                        <Group gap="md">
                                                            <Text size="sm">
                                                                {t('base-host-form.assignments')}:{' '}
                                                                {existingTarget?.assignments ?? 0}
                                                            </Text>
                                                            <Text size="sm">
                                                                {t('base-host-form.traffic')}:{' '}
                                                                {existingTarget?.trafficBytes ??
                                                                    '-'}
                                                            </Text>
                                                        </Group>
                                                        {hasRequiredInbound === false && (
                                                            <Text c="red" size="sm">
                                                                {t(
                                                                    'base-host-form.validation-reason-missing-inbound'
                                                                )}
                                                            </Text>
                                                        )}
                                                        {nodeStatus !== 'connected' && (
                                                            <Text
                                                                c={
                                                                    nodeStatus === 'connecting'
                                                                        ? 'yellow'
                                                                        : 'red'
                                                                }
                                                                size="sm"
                                                            >
                                                                {t(
                                                                    'base-host-form.node-state-warning'
                                                                )}
                                                            </Text>
                                                        )}
                                                    </Stack>
                                                    <Button
                                                        disabled={!canAdd}
                                                        onClick={() => addTarget(node)}
                                                        size="xs"
                                                    >
                                                        {t('base-host-form.select-target-node')}
                                                    </Button>
                                                </Group>
                                            </Card>
                                        )
                                    })}
                                </Stack>
                            </Stack>
                        </Modal>

                        <Divider />

                        <Stack gap="xs">
                            <Group gap={4}>
                                <Text fw={600}>{t('base-host-form.preview-selection')}</Text>
                                <HelpTooltip
                                    description={String(
                                        t('base-host-form.help-preview-selection-description')
                                    )}
                                    label={String(t('base-host-form.preview-selection'))}
                                />
                            </Group>
                            <Group align="flex-end">
                                <TextInput
                                    disabled={!hostUuid}
                                    label={t('base-host-form.user-uuid-or-short-uuid')}
                                    onChange={(event) =>
                                        setPreviewUserUuid(event.currentTarget.value)
                                    }
                                    placeholder={t('base-host-form.user-uuid-or-short-uuid')}
                                    value={previewUserUuid}
                                />
                                <Button
                                    disabled={!hostUuid || !previewUserUuid.trim()}
                                    leftSection={<PiFlaskDuotone size={16} />}
                                    loading={isPreviewLoading}
                                    onClick={handlePreview}
                                    variant="light"
                                >
                                    {t('base-host-form.test-selection')}
                                </Button>
                            </Group>
                            {!hostUuid && (
                                <Text c="dimmed" size="xs">
                                    {t('base-host-form.preview-after-create')}
                                </Text>
                            )}
                            {isPreviewLoading && (
                                <Alert color="blue" variant="light">
                                    {t('base-host-form.preview-loading')}
                                </Alert>
                            )}
                            {previewError && (
                                <Alert color="red" variant="light">
                                    {previewError}
                                </Alert>
                            )}
                            {preview && <PreviewResult preview={preview} />}
                        </Stack>

                        <Divider />

                        <DecisionsAuditBlock
                            decisions={decisionsQuery.data ?? []}
                            hostUuid={hostUuid}
                            isLoading={decisionsQuery.isFetching}
                            onRefresh={() => decisionsQuery.refetch()}
                        />
                    </Stack>
                </SectionCard.Section>
            )}
        </SectionCard.Root>
    )
}

function HostBalancerRuntimeStatus({ settings }: { settings?: RemnawaveSettings }) {
    const { t } = useTranslation()

    if (!settings) {
        return null
    }

    if (!settings.hostBalancerEnvEnabled) {
        return (
            <Alert color="red" mt="sm" variant="light">
                {t('base-host-form.balancer-status-env-disabled')}
            </Alert>
        )
    }

    if (!settings.hostBalancerGlobalEnabled) {
        return (
            <Alert color="yellow" mt="sm" variant="light">
                {t('base-host-form.balancer-status-global-disabled')}
            </Alert>
        )
    }

    return (
        <Badge color="teal" mt="sm" variant="light">
            {t('base-host-form.balancer-status-global-enabled')}
        </Badge>
    )
}

function DecisionsAuditBlock({
    decisions,
    hostUuid,
    isLoading,
    onRefresh
}: {
    decisions: HostBalancerDecision[]
    hostUuid?: string
    isLoading: boolean
    onRefresh: () => void
}) {
    const { t } = useTranslation()
    const [expandedDecisionUuid, setExpandedDecisionUuid] = useState<string | null>(null)

    return (
        <Stack gap="xs">
            <Group justify="space-between">
                <Group gap={4}>
                    <Text fw={600}>{t('base-host-form.decisions-audit')}</Text>
                    <HelpTooltip
                        description={String(t('base-host-form.help-decisions-audit-description'))}
                        label={String(t('base-host-form.decisions-audit'))}
                    />
                </Group>
                <Button
                    disabled={!hostUuid}
                    loading={isLoading}
                    onClick={onRefresh}
                    size="xs"
                    variant="light"
                >
                    {t('base-host-form.refresh-decisions')}
                </Button>
            </Group>

            {!hostUuid && (
                <Text c="dimmed" size="xs">
                    {t('base-host-form.decisions-after-create')}
                </Text>
            )}

            {hostUuid && decisions.length === 0 && !isLoading && (
                <Alert color="gray" variant="light">
                    {t('base-host-form.no-decisions')}
                </Alert>
            )}

            {decisions.length > 0 && (
                <Stack gap="xs">
                    {decisions.map((decision) => {
                        const selectedTarget = decision.selectedTarget
                        const selectedTargetLabel =
                            selectedTarget?.nodeName ??
                            selectedTarget?.targetUuid ??
                            decision.targetUuid ??
                            '-'
                        const finalAddress = decision.finalHostOverrides
                            ? `${decision.finalHostOverrides.address}:${decision.finalHostOverrides.port}`
                            : '-'
                        const expanded = expandedDecisionUuid === decision.uuid

                        return (
                            <Card
                                key={decision.uuid}
                                onClick={() =>
                                    setExpandedDecisionUuid((current) =>
                                        current === decision.uuid ? null : decision.uuid
                                    )
                                }
                                padding="sm"
                                radius="sm"
                                style={{ cursor: 'pointer' }}
                                withBorder
                            >
                                <Stack gap="xs">
                                    <Group align="flex-start" justify="space-between">
                                        <Stack gap={2}>
                                            <Group gap="xs">
                                                <Text fw={700} size="sm">
                                                    {selectedTargetLabel}
                                                </Text>
                                                <Badge
                                                    color={
                                                        decision.assignmentAction === 'skipped'
                                                            ? 'gray'
                                                            : 'teal'
                                                    }
                                                    variant="light"
                                                >
                                                    {translateDecisionAssignmentAction(
                                                        decision.assignmentAction,
                                                        t
                                                    )}
                                                </Badge>
                                            </Group>
                                            <Text c="dimmed" size="xs">
                                                {decision.createdAt.toLocaleString()} ·{' '}
                                                {decision.userUuidMasked ?? decision.userUuid}
                                            </Text>
                                        </Stack>
                                        <Badge color={expanded ? 'blue' : 'gray'} variant="light">
                                            {decision.candidates.length} /{' '}
                                            {decision.excludedTargets.length}
                                        </Badge>
                                    </Group>

                                    <SimpleGrid cols={{ base: 1, sm: 3 }}>
                                        <TargetInfo
                                            label={t('base-host-form.decision-final-address')}
                                            value={finalAddress}
                                        />
                                        <TargetInfo
                                            label={t('base-host-form.strategy')}
                                            value={translateStrategyName(decision.strategy, t)}
                                        />
                                        <TargetInfo
                                            label={t('base-host-form.decision-reason')}
                                            value={translateDecisionReason(decision.reason, t)}
                                        />
                                    </SimpleGrid>

                                    {expanded && <DecisionDetail decision={decision} />}
                                </Stack>
                            </Card>
                        )
                    })}
                </Stack>
            )}
        </Stack>
    )
}

function DecisionDetail({ decision }: { decision: HostBalancerDecision }) {
    const { t } = useTranslation()
    const selectedTarget = decision.selectedTarget

    return (
        <Alert color="blue" variant="light">
            <Stack gap="sm">
                <SimpleGrid cols={{ base: 1, sm: 2 }}>
                    <TargetInfo
                        label={t('base-host-form.unavailable-policy')}
                        value={translateUnavailablePolicyName(decision.unavailablePolicy, t)}
                    />
                    <TargetInfo
                        label={t('base-host-form.selected-target')}
                        value={
                            selectedTarget
                                ? `${targetDisplayName(selectedTarget)} · ${targetAddressPort(selectedTarget)}`
                                : (decision.targetUuid ?? '-')
                        }
                    />
                </SimpleGrid>
                {decision.finalHostOverrides && (
                    <SimpleGrid cols={{ base: 1, sm: 2 }}>
                        <TargetInfo
                            label={t('base-host-form.preview-final-address')}
                            value={decision.finalHostOverrides.address}
                        />
                        <TargetInfo
                            label={t('base-host-form.preview-final-port')}
                            value={decision.finalHostOverrides.port}
                        />
                    </SimpleGrid>
                )}
                {selectedTarget && (
                    <DiagnosticsTable
                        rows={[selectedTarget]}
                        title={t('base-host-form.selected-target')}
                    />
                )}
                <DiagnosticsTable
                    rows={decision.candidates}
                    title={t('base-host-form.candidates')}
                />
                <DiagnosticsTable
                    excluded
                    rows={decision.excludedTargets}
                    title={t('base-host-form.excluded-targets')}
                />
                {decision.warnings.length > 0 && (
                    <Stack gap={4}>
                        <Text fw={600} size="sm">
                            {t('base-host-form.decision-warnings')}
                        </Text>
                        {decision.warnings.map((warning, index) => (
                            <Text c="yellow" key={`${warning}-${index}`} size="sm">
                                {translateDecisionReason(warning, t)}
                            </Text>
                        ))}
                    </Stack>
                )}
            </Stack>
        </Alert>
    )
}

function PreviewResult({ preview }: { preview: HostBalancerPreview }) {
    const { t } = useTranslation()
    const diagnostics = preview.diagnostics
    const selectedTarget = preview.selectedTarget ?? diagnostics.selectedTarget ?? null
    const finalHostOverrides = preview.finalHostOverrides ?? diagnostics.finalHostOverrides
    const resultMessage = resolvePreviewResultMessage(preview, t)
    const assignmentAction =
        preview.assignmentAction ?? mapLegacyPreviewAction(diagnostics.assignmentAction)
    const candidates = preview.candidates ?? diagnostics.candidates ?? []
    const excludedTargets = preview.excludedTargets ?? diagnostics.excludedTargets ?? []
    const fallbackPolicyResult = preview.fallbackPolicyResult ?? null

    return (
        <Alert color={selectedTarget ? 'teal' : 'yellow'} variant="light">
            <Stack gap="md">
                <Group justify="space-between">
                    <Text fw={700}>{t('base-host-form.preview-result')}</Text>
                    <Badge color={assignmentAction === 'would_fallback' ? 'yellow' : 'teal'}>
                        {translatePreviewAssignmentAction(assignmentAction, t)}
                    </Badge>
                </Group>

                <SimpleGrid cols={{ base: 1, sm: 2 }}>
                    <TargetInfo
                        label={t('base-host-form.preview-user')}
                        value={`${preview.shortUuidMasked ?? preview.shortUuid ?? '-'} / ${maskUuid(preview.resolvedUserUuid ?? preview.userUuid)}`}
                    />
                    <TargetInfo
                        label={t('base-host-form.preview-host')}
                        value={preview.hostRemark ?? preview.hostUuid}
                    />
                    <TargetInfo
                        label={t('base-host-form.strategy')}
                        value={translateStrategyName(preview.strategy ?? diagnostics.strategy, t)}
                    />
                    <TargetInfo
                        label={t('base-host-form.preview-selection-reason')}
                        value={resultMessage}
                    />
                </SimpleGrid>

                {selectedTarget ? (
                    <Card padding="sm" radius="sm" withBorder>
                        <Stack gap={4}>
                            <Text fw={600}>{t('base-host-form.selected-target')}</Text>
                            <Text size="sm">
                                {targetDisplayName(selectedTarget)} ·{' '}
                                {targetAddressPort(selectedTarget)}
                            </Text>
                            <Text c="dimmed" size="xs">
                                {maskUuid(selectedTarget.targetUuid)}
                            </Text>
                        </Stack>
                    </Card>
                ) : (
                    <Alert color="yellow" variant="light">
                        {fallbackPolicyResult
                            ? translateFallbackPolicyResult(fallbackPolicyResult.result, t)
                            : t('base-host-form.preview-no-candidates')}
                    </Alert>
                )}

                {finalHostOverrides && (
                    <SimpleGrid cols={{ base: 1, sm: 2 }}>
                        <TargetInfo
                            label={t('base-host-form.preview-final-address')}
                            value={finalHostOverrides.address}
                        />
                        <TargetInfo
                            label={t('base-host-form.preview-final-port')}
                            value={finalHostOverrides.port}
                        />
                    </SimpleGrid>
                )}

                {(preview.warnings ?? diagnostics.warnings).map((warning, index) => (
                    <Text c="yellow" key={`${warning}-${index}`} size="sm">
                        {translateDiagnosticText(warning, t)}
                    </Text>
                ))}

                <DiagnosticsTable rows={candidates} title={t('base-host-form.candidates')} />
                <DiagnosticsTable
                    excluded
                    rows={excludedTargets}
                    title={t('base-host-form.excluded-targets')}
                />
            </Stack>
        </Alert>
    )
}

function resolvePreviewResultMessage(preview: HostBalancerPreview, t: TFunction) {
    const diagnostics = preview.diagnostics
    const selectedTargetUuid =
        preview.selectedTarget?.targetUuid ??
        diagnostics.selectedTarget?.targetUuid ??
        diagnostics.selectedTargetUuid ??
        null

    if (selectedTargetUuid) {
        return translateSelectionReason(preview.strategy ?? diagnostics.strategy, diagnostics, t)
    }

    if (preview.fallbackPolicyResult) {
        return translateFallbackPolicyResult(preview.fallbackPolicyResult.result, t)
    }

    return String(t('base-host-form.preview-no-candidates'))
}

function DiagnosticsTable({
    excluded = false,
    rows,
    title
}: {
    excluded?: boolean
    rows: HostBalancerPreview['diagnostics']['candidates']
    title: string
}) {
    const { t } = useTranslation()

    if (!rows || rows.length === 0) {
        return null
    }

    return (
        <Stack gap={4}>
            <Text fw={600} size="sm">
                {title}
            </Text>
            <Table withRowBorders={false}>
                <Table.Tbody>
                    {rows.map((row) => (
                        <Table.Tr key={row.targetUuid}>
                            <Table.Td>
                                <Badge
                                    color={
                                        excluded
                                            ? row.severity === 'error'
                                                ? 'red'
                                                : 'yellow'
                                            : row.selected
                                              ? 'teal'
                                              : 'gray'
                                    }
                                    variant="light"
                                >
                                    {excluded
                                        ? translatePreviewSeverity(row.severity, t)
                                        : row.selected
                                          ? t('base-host-form.selected')
                                          : t('base-host-form.candidate')}
                                </Badge>
                            </Table.Td>
                            <Table.Td>
                                <Stack gap={2}>
                                    <Text fw={600} size="sm">
                                        {targetDisplayName(row)}
                                    </Text>
                                    <Text c="dimmed" size="xs">
                                        {targetAddressPort(row)} · {maskUuid(row.targetUuid)}
                                    </Text>
                                </Stack>
                            </Table.Td>
                            <Table.Td>
                                {t('base-host-form.traffic-score')}: {formatPreviewScore(row.score)}
                            </Table.Td>
                            <Table.Td>
                                {t('base-host-form.assignments')}: {row.assignments ?? 0}
                            </Table.Td>
                            <Table.Td>
                                {t('base-host-form.traffic')}: {row.trafficBytes ?? '-'}
                            </Table.Td>
                            <Table.Td>
                                {row.reason ? translateDiagnosticText(row.reason, t) : ''}
                            </Table.Td>
                        </Table.Tr>
                    ))}
                </Table.Tbody>
            </Table>
        </Stack>
    )
}

function mapLegacyPreviewAction(action: LegacyPreviewAction): PreviewSimulatorAction {
    if (action === 'reused') {
        return 'would_reuse'
    }

    return action
}

function translatePreviewAssignmentAction(action: PreviewSimulatorAction, t: TFunction) {
    const keys = {
        preview_only: 'base-host-form.preview-action-preview_only',
        would_create: 'base-host-form.preview-action-would_create',
        would_reuse: 'base-host-form.preview-action-would_reuse',
        would_reassign: 'base-host-form.preview-action-would_reassign',
        would_fallback: 'base-host-form.preview-action-would_fallback'
    } as const

    return String(t(keys[action]))
}

function translateFallbackPolicyResult(result: PreviewFallbackResult, t: TFunction) {
    const keys = {
        hidden: 'base-host-form.preview-host-hidden',
        original_host: 'base-host-form.preview-original-host',
        last_assignment: 'base-host-form.preview-last-assignment',
        none: 'base-host-form.preview-no-candidates'
    } as const

    return String(t(keys[result]))
}

function translatePreviewSeverity(
    severity: 'info' | 'warning' | 'error' | undefined,
    t: TFunction
) {
    if (severity === 'error') {
        return t('base-host-form.validation-error')
    }
    if (severity === 'warning') {
        return t('base-host-form.validation-warning')
    }

    return t('base-host-form.validation-unknown')
}

function translateSelectionReason(
    strategy: HostBalancerStrategy,
    diagnostics: HostBalancerPreview['diagnostics'],
    t: TFunction
) {
    if (diagnostics.assignmentAction === 'reused') {
        return String(t('base-host-form.preview-reason-sticky'))
    }

    const keys = {
        LEAST_ASSIGNED: 'base-host-form.preview-reason-least-assigned',
        WEIGHTED: 'base-host-form.preview-reason-weighted',
        LEAST_TRAFFIC: 'base-host-form.preview-reason-least-traffic',
        WEIGHTED_LEAST_TRAFFIC: 'base-host-form.preview-reason-weighted-traffic',
        PRIORITY_FAILOVER: 'base-host-form.preview-reason-priority',
        RANDOM: 'base-host-form.preview-reason-random'
    } as const

    return String(t(keys[strategy]))
}

function targetDisplayName(row: PreviewDiagnosticsRow) {
    return row.nodeName ?? row.nodeUuid ?? row.targetUuid
}

function targetAddressPort(row: PreviewDiagnosticsRow) {
    const address = row.address ?? row.nodeAddress ?? '-'
    const port = row.port ?? '-'

    return `${address}:${port}`
}

function formatPreviewScore(score: number | undefined) {
    if (score === undefined) {
        return '-'
    }

    return Number.isInteger(score) ? String(score) : score.toFixed(4)
}

function TargetInfo({ label, value }: { label: ReactNode; value: ReactNode }) {
    return (
        <Stack gap={2}>
            <Text c="dimmed" size="xs">
                {label}
            </Text>
            <Text component="div" fw={600} size="sm">
                {value}
            </Text>
        </Stack>
    )
}

function statusBadge(status: HostBalancerTargetStatus, t: TFunction) {
    const meta = {
        ACTIVE: { color: 'teal', label: t('base-host-form.status-active') },
        DRAINING: { color: 'yellow', label: t('base-host-form.status-draining') },
        DISABLED: { color: 'gray', label: t('base-host-form.status-disabled') },
        DEAD: { color: 'red', label: t('base-host-form.status-dead') }
    }[status]

    return (
        <Badge color={meta.color} variant="light">
            {meta.label}
        </Badge>
    )
}

function nodeStatusBadge(
    status: 'connected' | 'connecting' | 'disabled' | 'disconnected' | 'unknown',
    t: TFunction
) {
    const meta = {
        connected: { color: 'teal', label: t('base-host-form.node-status-connected') },
        connecting: { color: 'yellow', label: t('base-host-form.node-status-connecting') },
        disabled: { color: 'red', label: t('base-host-form.node-status-disabled') },
        disconnected: { color: 'red', label: t('base-host-form.node-status-disconnected') },
        unknown: { color: 'gray', label: t('base-host-form.node-status-unknown') }
    }[status]

    return (
        <Badge color={meta.color} variant="light">
            {meta.label}
        </Badge>
    )
}

function localInboundCompatibilityBadge(hasRequiredInbound: boolean | null, t: TFunction) {
    if (hasRequiredInbound === null) {
        return (
            <Badge color="gray" variant="light">
                {t('base-host-form.compatibility-unknown')}
            </Badge>
        )
    }

    return (
        <Badge color={hasRequiredInbound ? 'teal' : 'red'} variant="light">
            {hasRequiredInbound
                ? t('base-host-form.compatibility-compatible')
                : t('base-host-form.compatibility-missing-inbound')}
        </Badge>
    )
}

function inboundCompatibilityBadge(validation: HostBalancerTargetValidation | null, t: TFunction) {
    if (!validation || validation.hasRequiredInbound === null) {
        return (
            <Badge color="gray" variant="light">
                {t('base-host-form.compatibility-unknown')}
            </Badge>
        )
    }

    return (
        <Badge color={validation.hasRequiredInbound ? 'teal' : 'red'} variant="light">
            {validation.hasRequiredInbound
                ? t('base-host-form.compatibility-compatible')
                : t('base-host-form.compatibility-missing-inbound')}
        </Badge>
    )
}

function validationBadge(validation: HostBalancerTargetValidation | null, t: TFunction) {
    const severity = validation?.severity ?? 'warning'
    const meta = {
        ok: { color: 'teal', label: t('base-host-form.validation-ready') },
        warning: { color: 'yellow', label: t('base-host-form.validation-warning') },
        error: { color: 'red', label: t('base-host-form.validation-error') }
    }[severity]

    return (
        <Badge color={meta.color} variant="light">
            {validation ? meta.label : t('base-host-form.validation-unknown')}
        </Badge>
    )
}

function resolveLocalNodeStatus(
    node?: HostBalancerNode
): 'connected' | 'connecting' | 'disabled' | 'disconnected' | 'unknown' {
    if (!node) {
        return 'unknown'
    }
    if (node.isDisabled) {
        return 'disabled'
    }
    if (node.isConnecting) {
        return 'connecting'
    }
    if (node.isConnected) {
        return 'connected'
    }

    return 'disconnected'
}

function nodeHasRequiredInbound(node: HostBalancerNode, requiredInboundUuid?: string) {
    if (!requiredInboundUuid) {
        return null
    }

    return node.configProfile.activeInbounds.some((inbound) => inbound.uuid === requiredInboundUuid)
}

function strategyHelpKey(strategy: HostBalancerStrategy): HostBalancerHelpKey {
    const keys = {
        LEAST_ASSIGNED: 'base-host-form.help-strategy-least-assigned-description',
        WEIGHTED: 'base-host-form.help-strategy-weighted-description',
        LEAST_TRAFFIC: 'base-host-form.help-strategy-least-traffic-description',
        WEIGHTED_LEAST_TRAFFIC: 'base-host-form.help-strategy-weighted-least-traffic-description',
        PRIORITY_FAILOVER: 'base-host-form.help-strategy-priority-failover-description',
        RANDOM: 'base-host-form.help-strategy-random-description'
    } satisfies Record<HostBalancerStrategy, HostBalancerHelpKey>

    return keys[strategy]
}

function policyHelpKey(policy: HostBalancerUnavailablePolicy): HostBalancerHelpKey {
    const keys = {
        HIDE_HOST: 'base-host-form.help-policy-hide-host-description',
        ORIGINAL_HOST: 'base-host-form.help-policy-original-host-description',
        KEEP_LAST_IF_POSSIBLE: 'base-host-form.help-policy-keep-last-description'
    } satisfies Record<HostBalancerUnavailablePolicy, HostBalancerHelpKey>

    return keys[policy]
}

function translateDiagnosticText(message: string, t: TFunction): string {
    const selectedByStrategy = message.match(/^Selected target by ([A-Z_]+)\.$/)
    if (selectedByStrategy) {
        return String(
            t('base-host-form.diagnostic-selected-target-by-strategy', {
                strategy: selectedByStrategy[1]
            })
        )
    }

    const targetStatus = message.match(/^target status ([A-Z_]+)$/)
    if (targetStatus) {
        return String(
            t('base-host-form.diagnostic-target-status', {
                status: targetStatus[1]
            })
        )
    }

    const diagnosticKeys = {
        'Traffic data missing, fallback strategy used.':
            'base-host-form.diagnostic-traffic-fallback',
        'Host balancer settings do not exist.': 'base-host-form.diagnostic-settings-missing',
        'No eligible target selected.': 'base-host-form.diagnostic-no-eligible-target',
        'target disabled': 'base-host-form.diagnostic-target-disabled',
        'target draining': 'base-host-form.diagnostic-target-draining',
        'target node not found': 'base-host-form.diagnostic-target-node-not-found',
        'target node disabled': 'base-host-form.diagnostic-target-node-disabled',
        'target node disconnected': 'base-host-form.diagnostic-target-node-disconnected',
        'target node lacks required inbound': 'base-host-form.preview-excluded-missing-inbound'
    } as const

    const key = diagnosticKeys[message as keyof typeof diagnosticKeys]
    return key ? String(t(key)) : message
}

function translateDecisionReason(message: string, t: TFunction): string {
    const selected = message.match(/^selected:([A-Z_]+):([a-z_]+)$/)
    if (selected) {
        const strategy = translateStrategyName(selected[1], t)
        const action = selected[2]

        if (action === 'reused') {
            return String(t('base-host-form.decision-reason-selected-reused'))
        }
        if (action === 'created') {
            return String(
                t('base-host-form.decision-reason-selected-created', {
                    strategy
                })
            )
        }
        if (action === 'reassigned') {
            return String(
                t('base-host-form.decision-reason-selected-reassigned', {
                    strategy
                })
            )
        }

        return String(
            t('base-host-form.decision-reason-selected', {
                strategy,
                action: translateDecisionAssignmentAction(action, t)
            })
        )
    }

    const decisionKeys = {
        'target node lacks required inbound': 'base-host-form.decision-reason-missing-inbound',
        'target disabled': 'base-host-form.decision-reason-target-disabled',
        'target status DISABLED': 'base-host-form.decision-reason-target-disabled',
        'target node disconnected': 'base-host-form.decision-reason-node-disconnected',
        'node disconnected': 'base-host-form.decision-reason-node-disconnected',
        'target draining': 'base-host-form.diagnostic-target-draining',
        'target node disabled': 'base-host-form.diagnostic-target-node-disabled',
        'target node not found': 'base-host-form.diagnostic-target-node-not-found'
    } as const

    const key = decisionKeys[message as keyof typeof decisionKeys]
    return key ? String(t(key)) : translateDiagnosticText(message, t)
}

function translateDecisionAssignmentAction(action: string, t: TFunction): string {
    const actionKeys = {
        reused: 'base-host-form.decision-action-reused',
        created: 'base-host-form.decision-action-created',
        reassigned: 'base-host-form.decision-action-reassigned',
        skipped: 'base-host-form.decision-action-skipped'
    } as const

    const key = actionKeys[action as keyof typeof actionKeys]
    return key ? String(t(key)) : action
}

function translateStrategyName(strategy: string, t: TFunction): string {
    const strategyKeys = {
        LEAST_ASSIGNED: 'base-host-form.strategy-least-assigned',
        WEIGHTED: 'base-host-form.strategy-weighted',
        LEAST_TRAFFIC: 'base-host-form.strategy-least-traffic',
        WEIGHTED_LEAST_TRAFFIC: 'base-host-form.strategy-weighted-least-traffic',
        PRIORITY_FAILOVER: 'base-host-form.strategy-priority-failover',
        RANDOM: 'base-host-form.strategy-random'
    } as const

    const key = strategyKeys[strategy as keyof typeof strategyKeys]
    return key ? String(t(key)) : strategy
}

function translateUnavailablePolicyName(policy: string, t: TFunction): string {
    const policyKeys = {
        HIDE_HOST: 'base-host-form.policy-hide-host',
        ORIGINAL_HOST: 'base-host-form.policy-original-host',
        KEEP_LAST_IF_POSSIBLE: 'base-host-form.policy-keep-last'
    } as const

    const key = policyKeys[policy as keyof typeof policyKeys]
    return key ? String(t(key)) : policy
}

function maskUuid(uuid: string): string {
    if (uuid.length <= 13) {
        return uuid
    }

    return `${uuid.slice(0, 8)}...${uuid.slice(-4)}`
}

function resolvePreviewErrorMessage(error: unknown, t: TFunction): string {
    if (isAxiosError(error)) {
        if (error.response?.status === 404) {
            return String(t('base-host-form.preview-user-not-found'))
        }
        if (error.response?.status === 400) {
            return String(t('base-host-form.preview-user-required'))
        }

        const data = error.response?.data
        const message =
            typeof data?.message === 'string'
                ? data.message
                : typeof data?.error === 'string'
                  ? data.error
                  : null

        return message ?? String(t('base-host-form.preview-error-generic'))
    }

    if (error instanceof Error) {
        return error.message
    }

    return String(t('base-host-form.preview-error-generic'))
}

export function translateValidationReason(message: string, t: TFunction): string {
    const validationKeys = {
        'target node lacks required inbound': 'base-host-form.validation-reason-missing-inbound',
        'overrideAddress differs from selected node address':
            'base-host-form.validation-reason-override-address-mismatch',
        'address-only target: traffic/status checks unavailable':
            'base-host-form.validation-reason-address-only',
        'target node not found': 'base-host-form.diagnostic-target-node-not-found',
        'target node disabled': 'base-host-form.diagnostic-target-node-disabled',
        'target node disconnected': 'base-host-form.diagnostic-target-node-disconnected',
        'target disabled': 'base-host-form.diagnostic-target-disabled',
        'target draining': 'base-host-form.diagnostic-target-draining'
    } as const

    const targetStatus = message.match(/^target status ([A-Z_]+)$/)
    if (targetStatus) {
        return String(
            t('base-host-form.diagnostic-target-status', {
                status: targetStatus[1]
            })
        )
    }

    const key = validationKeys[message as keyof typeof validationKeys]
    return key ? String(t(key)) : message
}

function emptyToNull(value?: string | null) {
    return value && value.trim() !== '' ? value.trim() : null
}
