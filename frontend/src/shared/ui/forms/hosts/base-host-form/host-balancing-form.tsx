import {
    ActionIcon,
    Alert,
    Badge,
    Button,
    Card,
    Checkbox,
    CopyButton,
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
import {
    PiCheckDuotone,
    PiCopyDuotone,
    PiFlaskDuotone,
    PiPlus,
    PiScalesDuotone,
    PiTrashDuotone
} from 'react-icons/pi'
import { TbActivityHeartbeat, TbAlertTriangle, TbPlayerPause, TbSkull } from 'react-icons/tb'
import { nanoid } from 'nanoid'
import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { GetAllNodesCommand } from '@remnawave/backend-contract'

import {
    HostBalancerDecision,
    HostBalancerPreview,
    HostBalancerPreviewSchema,
    QueryKeys,
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
import { instance, queryClient } from '@shared/api'
import { resolveCountryCode } from '@shared/utils/misc/resolve-country-code'
import { prettyBytesUtil } from '@shared/utils/bytes'
import { BaseOverlayHeader } from '@shared/ui/overlays/base-overlay-header'
import { HelpTooltip } from '@shared/ui/help-tooltip'
import { SectionCard } from '@shared/ui/section-card'

export {
    DEFAULT_HOST_BALANCING_DRAFT,
    hostBalancerToDraft,
    patchHostBalancingDraft,
    sanitizeHostBalancingDraft,
    shouldEnableHostSave,
    updateHostBalancingTarget
} from './host-balancing-draft'
export type { HostBalancingDraft } from './host-balancing-draft'

import {
    DraftTarget,
    HostBalancingDraft,
    patchHostBalancingDraft,
    sanitizeHostBalancingDraft,
    updateHostBalancingTarget
} from './host-balancing-draft'
import {
    decisionCandidatesCount,
    decisionExcludedCount,
    decisionFinalAddress,
    decisionReasonTranslation,
    decisionSelectedTargetLabel,
    decisionTargetAddressPort
} from './host-balancing-decision-display'
import { formatTargetAssignments, formatTargetTraffic } from './host-balancing-target-display'

type HostBalancerNode = GetAllNodesCommand.Response['response'][number]
type HostBalancerConfigProfile = {
    inbounds: {
        network: null | string
        profileUuid: string
        tag: string
        type: string
        uuid: string
    }[]
    name: string
    uuid: string
}
type PreviewSimulatorAction =
    | 'preview_only'
    | 'would_create'
    | 'would_reuse'
    | 'would_reassign'
    | 'would_fallback'
type LegacyPreviewAction = 'preview_only' | 'reused' | 'would_create' | 'would_reassign'
type PreviewFallbackResult = 'hidden' | 'original_host' | 'last_assignment' | 'none'
type PreviewDiagnosticsRow = NonNullable<NonNullable<HostBalancerPreview['candidates']>[number]>
type PreviewDiagnosticsTrafficSource =
    PreviewDiagnosticsRow extends { trafficSource?: infer Source } ? Source : never
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
type DescribedSelectOption = {
    description: string
    label: string
    value: string
}

type IProps = {
    configProfiles: HostBalancerConfigProfile[]
    draft: HostBalancingDraft
    hostPort?: number
    hostUuid?: string
    nodes: GetAllNodesCommand.Response['response']
    onChange: (draft: HostBalancingDraft) => void
    onValidationChange?: (validation: HostBalancerTargetsValidation | null) => void
    requiredInboundUuid?: string
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const HOST_BALANCER_BUILD_MARKER = 'Native Host Balancer UI'
const TRAFFIC_STRATEGIES: HostBalancerStrategy[] = ['LEAST_TRAFFIC', 'WEIGHTED_LEAST_TRAFFIC']

export function HostBalancingForm({
    configProfiles,
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
    const configProfileByUuid = useMemo(
        () => new Map(configProfiles.map((profile) => [profile.uuid, profile])),
        [configProfiles]
    )
    const refetchHostBalancerSettings = () => {
        if (!hostUuid) {
            return Promise.resolve()
        }

        return queryClient.refetchQueries({
            queryKey: QueryKeys.hostBalancers.getSettings(hostUuid).queryKey
        })
    }

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
        const validationByLocalId = new Map(
            draft.targets.map((target, index) => [target.localId, validation?.targets[index]])
        )
        const activeValid = activeTargets.filter((target) => {
            const targetValidation = validationByLocalId.get(target.localId)
            return targetValidation ? targetValidation.severity !== 'error' : false
        }).length
        const incompatible = (validation?.targets ?? []).filter(
            (target) => target.hasRequiredInbound === false
        ).length

        return {
            total: draft.targets.length,
            active: activeTargets.length,
            activeValid,
            valid: validation?.summary.valid ?? draft.targets.length,
            errors: validation?.summary.errors ?? 0,
            incompatible,
            assignments: draft.targets.reduce(
                (sum, target) => sum + (target.assignmentsCount ?? target.assignments ?? 0),
                0
            )
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
    const strategyOptions: DescribedSelectOption[] = [
        {
            value: 'LEAST_ASSIGNED',
            label: String(t('base-host-form.strategy-least-assigned')),
            description: String(t('base-host-form.help-strategy-least-assigned-description'))
        },
        {
            value: 'WEIGHTED',
            label: String(t('base-host-form.strategy-weighted')),
            description: String(t('base-host-form.help-strategy-weighted-description'))
        },
        {
            value: 'LEAST_TRAFFIC',
            label: String(t('base-host-form.strategy-least-traffic')),
            description: String(t('base-host-form.help-strategy-least-traffic-description'))
        },
        {
            value: 'WEIGHTED_LEAST_TRAFFIC',
            label: String(t('base-host-form.strategy-weighted-least-traffic')),
            description: String(t('base-host-form.help-strategy-weighted-least-traffic-description'))
        },
        {
            value: 'PRIORITY_FAILOVER',
            label: String(t('base-host-form.strategy-priority-failover')),
            description: String(t('base-host-form.help-strategy-priority-failover-description'))
        },
        {
            value: 'RANDOM',
            label: String(t('base-host-form.strategy-random')),
            description: String(t('base-host-form.help-strategy-random-description'))
        }
    ]
    const policyOptions: DescribedSelectOption[] = [
        {
            value: 'HIDE_HOST',
            label: String(t('base-host-form.policy-hide-host')),
            description: String(t('base-host-form.help-policy-hide-host-description'))
        },
        {
            value: 'ORIGINAL_HOST',
            label: String(t('base-host-form.policy-original-host')),
            description: String(t('base-host-form.help-policy-original-host-description'))
        },
        {
            value: 'KEEP_LAST_IF_POSSIBLE',
            label: String(t('base-host-form.policy-keep-last')),
            description: String(t('base-host-form.help-policy-keep-last-description'))
        }
    ]

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
                <HostBalancerRuntimeStatus hostEnabled={draft.enabled} settings={remnawaveSettings} />
            </SectionCard.Section>

            {draft.enabled && (
                <SectionCard.Section>
                    <Stack gap="md">
                        <Group align="flex-start" grow>
                            <Stack flex={1} gap={4}>
                                <Select
                                    allowDeselect={false}
                                    data={strategyOptions}
                                    label={helpLabel(
                                        'base-host-form.strategy',
                                        'base-host-form.help-strategy-description'
                                    )}
                                    onChange={(value) =>
                                        patchDraft({ strategy: value as HostBalancerStrategy })
                                    }
                                    renderOption={({ option }) => (
                                        <DescribedSelectItem
                                            option={option as DescribedSelectOption}
                                        />
                                    )}
                                    value={draft.strategy}
                                />
                                <Text c="dimmed" size="xs">
                                    {t(strategyHelpKey(draft.strategy))}
                                </Text>
                            </Stack>
                            <Stack flex={1} gap={4}>
                                <Select
                                    allowDeselect={false}
                                    data={policyOptions}
                                    label={helpLabel(
                                        'base-host-form.unavailable-policy',
                                        'base-host-form.help-unavailable-policy-description'
                                    )}
                                    onChange={(value) =>
                                        patchDraft({
                                            unavailablePolicy:
                                                value as HostBalancerUnavailablePolicy
                                        })
                                    }
                                    renderOption={({ option }) => (
                                        <DescribedSelectItem
                                            option={option as DescribedSelectOption}
                                        />
                                    )}
                                    value={draft.unavailablePolicy}
                                />
                                <Text c="dimmed" size="xs">
                                    {t(policyHelpKey(draft.unavailablePolicy))}
                                </Text>
                            </Stack>
                        </Group>

                        <Group align="flex-start" grow>
                            <Stack flex={1} gap={4}>
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
                                <Text c="dimmed" size="xs">
                                    {t('base-host-form.help-sticky-assignments-description')}
                                </Text>
                            </Stack>
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
                            {draft.targets.length > 0 && validation && targetSummary.activeValid === 0 && (
                                <Alert color="red" variant="light">
                                    {t('base-host-form.no-valid-active-targets-warning')}
                                </Alert>
                            )}
                            {draft.targets.length > 0 && validation && targetSummary.incompatible === draft.targets.length && (
                                <Alert color="red" variant="light">
                                    {t('base-host-form.all-targets-incompatible-warning')}
                                </Alert>
                            )}

                            <SimpleGrid cols={{ base: 1, xl: 2 }}>
                                {draft.targets.map((target, index) => {
                                    const targetValidation = validation?.targets[index] ?? null
                                    const node = target.nodeUuid
                                        ? nodeByUuid.get(target.nodeUuid)
                                        : undefined
                                    const nodeName =
                                        target.nodeName ??
                                        targetValidation?.nodeName ??
                                        node?.name ??
                                        t('base-host-form.target-node-not-selected')
                                    const nodeAddress =
                                        target.nodeAddress ??
                                        targetValidation?.nodeAddress ??
                                        node?.address ??
                                        '-'
                                    const subscriptionAddress =
                                        target.overrideAddress ||
                                        t('base-host-form.original-host-address')
                                    const subscriptionPort = target.overridePort ?? hostPort ?? '-'
                                    const nodeStatus =
                                        targetValidation?.nodeStatus ?? resolveLocalNodeStatus(node)
                                    const profileInbound = targetProfileInboundLabel(
                                        target,
                                        node,
                                        configProfileByUuid,
                                        requiredInboundUuid,
                                        t
                                    )
                                    const isActiveTarget =
                                        target.enabled !== false &&
                                        (target.status ?? 'ACTIVE') === 'ACTIVE'
                                    const participates =
                                        isActiveTarget &&
                                        (targetValidation?.severity ?? 'warning') === 'ok'
                                    const participationReason = targetParticipationReason(
                                        target,
                                        targetValidation,
                                        nodeStatus,
                                        t
                                    )
                                    const hasMissingInbound =
                                        targetValidation?.hasRequiredInbound === false ||
                                        target.compatibilityStatus === 'missing_inbound'
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
                                                    <Stack gap={4}>
                                                        <NodeTitle
                                                            address={nodeAddress}
                                                            node={node}
                                                            title={nodeName}
                                                        />
                                                        <CompactIdCopy
                                                            label={String(
                                                                t('base-host-form.node-id')
                                                            )}
                                                            value={target.nodeUuid}
                                                        />
                                                    </Stack>
                                                    <Stack align="flex-end" gap={4}>
                                                        <Group gap={4} justify="flex-end" wrap="wrap">
                                                            <Badge color="dark" variant="light">
                                                                {t(
                                                                    'base-host-form.target-admin-status'
                                                                )}
                                                            </Badge>
                                                            {statusBadge(target.status ?? 'ACTIVE', t)}
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
                                                        <Group gap={4} justify="flex-end" wrap="wrap">
                                                            <Badge color="dark" variant="light">
                                                                {t(
                                                                    'base-host-form.technical-state'
                                                                )}
                                                            </Badge>
                                                            {validationBadge(targetValidation, t)}
                                                        </Group>
                                                <Group gap={4} justify="flex-end" wrap="wrap">
                                                    <Badge color="dark" variant="light">
                                                        {t('base-host-form.selection-state')}
                                                    </Badge>
                                                    {participationBadge(participates, t)}
                                                </Group>
                                                {!participates && !hasMissingInbound && (
                                                    <Text c="red" size="xs" ta="right">
                                                        {participationReason}
                                                    </Text>
                                                )}
                                            </Stack>
                                        </Group>

                                                <SimpleGrid cols={{ base: 1, sm: 2 }}>
                                                    <TargetInfo
                                                        label={t(
                                                            'base-host-form.profile-inbound'
                                                        )}
                                                        value={profileInbound}
                                                    />
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
                                                        value={targetCompatibilityBadge(
                                                            target,
                                                            targetValidation,
                                                            t
                                                        )}
                                                    />
                                                    <TargetInfo
                                                        label={t('base-host-form.assignments')}
                                                        value={formatTargetAssignments(target, t)}
                                                    />
                                                    <TargetInfo
                                                        label={t('base-host-form.traffic')}
                                                        value={formatTargetTraffic(target, t)}
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
                            title={
                                <Text fw={700} size="lg">
                                    {t('base-host-form.add-target-node')}
                                </Text>
                            }
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
                                        const profileInbound = targetProfileInboundLabel(
                                            existingTarget ??
                                                ({ localId: `node-picker-${node.uuid}` } as DraftTarget),
                                            node,
                                            configProfileByUuid,
                                            requiredInboundUuid,
                                            t
                                        )
                                        const disabledReason = targetNodePickerDisabledReason({
                                            existingTarget: !!existingTarget,
                                            hasRequiredInbound,
                                            nodeStatus,
                                            t
                                        })
                                        const canAdd = !disabledReason

                                        return (
                                            <Card
                                                key={node.uuid}
                                                padding="md"
                                                radius="sm"
                                                withBorder
                                            >
                                                <Group align="flex-start" justify="space-between">
                                                    <Stack gap="xs">
                                                        <NodeTitle
                                                            address={node.address}
                                                            node={node}
                                                            title={node.name}
                                                        />
                                                        <CompactIdCopy
                                                            label={String(
                                                                t('base-host-form.node-id')
                                                            )}
                                                            value={node.uuid}
                                                        />
                                                        <SimpleGrid cols={{ base: 1, sm: 2 }}>
                                                            <TargetInfo
                                                                label={t(
                                                                    'base-host-form.profile-inbound'
                                                                )}
                                                                value={profileInbound}
                                                            />
                                                            <TargetInfo
                                                                label={t(
                                                                    'base-host-form.assignments'
                                                                )}
                                                                value={
                                                                    existingTarget
                                                                        ? formatTargetAssignments(
                                                                              existingTarget,
                                                                              t
                                                                          )
                                                                        : t(
                                                                              'base-host-form.no-diagnostic-data'
                                                                          )
                                                                }
                                                            />
                                                            <TargetInfo
                                                                label={t('base-host-form.traffic')}
                                                                value={
                                                                    existingTarget
                                                                        ? formatTargetTraffic(
                                                                              existingTarget,
                                                                              t
                                                                          )
                                                                        : node.trafficUsedBytes ===
                                                                                null ||
                                                                            node.trafficUsedBytes ===
                                                                                undefined
                                                                          ? t(
                                                                                'base-host-form.no-diagnostic-data'
                                                                            )
                                                                          : prettyBytesUtil(
                                                                                node.trafficUsedBytes,
                                                                                true
                                                                            )
                                                                }
                                                            />
                                                            <TargetInfo
                                                                label={t(
                                                                    'base-host-form.node-status'
                                                                )}
                                                                value={nodeStatusBadge(
                                                                    nodeStatus,
                                                                    t
                                                                )}
                                                            />
                                                        </SimpleGrid>
                                                        <Group gap="xs" wrap="wrap">
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
                                                            {!disabledReason && (
                                                                <Badge color="teal" variant="light">
                                                                    {t(
                                                                        'base-host-form.compatibility-compatible'
                                                                    )}
                                                                </Badge>
                                                            )}
                                                        </Group>
                                                        {disabledReason && (
                                                            <Alert
                                                                color={
                                                                    existingTarget ? 'gray' : 'red'
                                                                }
                                                                title={
                                                                    hasRequiredInbound === false
                                                                        ? t(
                                                                              'base-host-form.missing-inbound-alert-title'
                                                                          )
                                                                        : undefined
                                                                }
                                                                variant="light"
                                                            >
                                                                {hasRequiredInbound === false
                                                                    ? t(
                                                                          'base-host-form.missing-inbound-alert-description'
                                                                      )
                                                                    : disabledReason}
                                                            </Alert>
                                                        )}
                                                    </Stack>
                                                    <Button
                                                        disabled={!canAdd}
                                                        onClick={() => addTarget(node)}
                                                        size="xs"
                                                        title={disabledReason ?? undefined}
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
                            onRefresh={async () => {
                                await Promise.all([
                                    decisionsQuery.refetch(),
                                    refetchHostBalancerSettings()
                                ])
                            }}
                        />
                    </Stack>
                </SectionCard.Section>
            )}
        </SectionCard.Root>
    )
}

function HostBalancerRuntimeStatus({
    hostEnabled,
    settings
}: {
    hostEnabled: boolean
    settings?: RemnawaveSettings
}) {
    const { t } = useTranslation()

    if (!settings) {
        return null
    }

    return (
        <Group gap="xs" mt="sm">
            <Badge color={settings.hostBalancerEnvEnabled ? 'teal' : 'red'} variant="light">
                {settings.hostBalancerEnvEnabled
                    ? t('base-host-form.balancer-status-env-enabled')
                    : t('base-host-form.balancer-status-env-disabled')}
            </Badge>
            <Badge color={settings.hostBalancerGlobalEnabled ? 'teal' : 'yellow'} variant="light">
                {settings.hostBalancerGlobalEnabled
                    ? t('base-host-form.balancer-status-global-enabled')
                    : t('base-host-form.balancer-status-global-disabled')}
            </Badge>
            <Badge color={hostEnabled ? 'teal' : 'gray'} variant="light">
                {hostEnabled
                    ? t('base-host-form.balancer-status-host-enabled')
                    : t('base-host-form.balancer-status-host-disabled')}
            </Badge>
        </Group>
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
                        const selectedTargetLabel = decisionSelectedTargetLabel(decision)
                        const finalAddress = decisionFinalAddress(decision)
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
                                                    {selectedTargetLabel === '-'
                                                        ? t('base-host-form.no-selected-target')
                                                        : selectedTargetLabel}
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
                                        <Group gap={4} justify="flex-end">
                                            <Badge
                                                color={expanded ? 'blue' : 'gray'}
                                                variant="light"
                                            >
                                                {t(
                                                    'base-host-form.decision-candidates-count',
                                                    {
                                                        count: decisionCandidatesCount(decision)
                                                    }
                                                )}
                                            </Badge>
                                            <Badge
                                                color={
                                                    decisionExcludedCount(decision) > 0
                                                        ? 'yellow'
                                                        : 'gray'
                                                }
                                                variant="light"
                                            >
                                                {t('base-host-form.decision-excluded-count', {
                                                    count: decisionExcludedCount(decision)
                                                })}
                                            </Badge>
                                        </Group>
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
                                ? `${targetDisplayName(selectedTarget)} · ${decisionTargetAddressPort(selectedTarget)}`
                                : t('base-host-form.no-selected-target')
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
                                {targetProfileLabel(selectedTarget, t)}
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

                {fallbackPolicyResult && (
                    <Alert color="yellow" variant="light">
                        <Stack gap={2}>
                            <Text fw={600} size="sm">
                                {t('base-host-form.fallback-policy-result')}
                            </Text>
                            <Text size="sm">
                                {translateUnavailablePolicyName(fallbackPolicyResult.policy, t)}:{' '}
                                {translateFallbackPolicyResult(fallbackPolicyResult.result, t)}
                            </Text>
                        </Stack>
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

function DescribedSelectItem({ option }: { option: DescribedSelectOption }) {
    return (
        <Stack gap={2}>
            <Text fw={600} size="sm">
                {option.label}
            </Text>
            <Text c="dimmed" size="xs">
                {option.description}
            </Text>
        </Stack>
    )
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
                                        {targetAddressPort(row)}
                                    </Text>
                                    <Text c="dimmed" size="xs">
                                        {targetProfileLabel(row, t)}
                                    </Text>
                                </Stack>
                            </Table.Td>
                            <Table.Td>
                                {t('base-host-form.traffic-score')}: {formatPreviewScore(row.score)}
                            </Table.Td>
                            <Table.Td>
                                {t('base-host-form.assignments')}: {formatAssignmentsSnapshot(row, t)}
                            </Table.Td>
                            <Table.Td>
                                {t('base-host-form.traffic')}: {formatTrafficSnapshot(row, t)}
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
    const name = row.nodeName ?? row.nodeAddress ?? row.address ?? '-'
    return row.countryEmoji ? `${row.countryEmoji} ${name}` : name
}

function targetAddressPort(row: PreviewDiagnosticsRow) {
    const address = row.address ?? row.nodeAddress ?? '-'
    const port = row.port ?? '-'

    return `${address}:${port}`
}

function targetProfileLabel(row: PreviewDiagnosticsRow, t: TFunction) {
    if (!row.inboundTag && (row.inboundName || row.inboundType || row.profileName)) {
        const profile = row.profileName ?? t('base-host-form.node-profile-not-found')
        const inbound = row.inboundName ?? t('base-host-form.inbound-unknown')
        const protocol = row.inboundType
            ? `${row.inboundType}${row.inboundNetwork ? `/${row.inboundNetwork}` : ''}`
            : null

        return [profile, inbound, protocol].filter(Boolean).join(' · ')
    }

    if (row.inboundTag) {
        const profile = row.profileName ?? t('base-host-form.node-profile-not-found')
        return `${profile} · ${row.inboundName ?? row.inboundTag} · ${row.inboundType ?? '-'}${row.inboundNetwork ? `/${row.inboundNetwork}` : ''}`
    }

    if (row.inboundUuid) {
        return `${t('base-host-form.node-profile-not-found')} · ${t('base-host-form.inbound-unknown')}`
    }

    return String(t('base-host-form.node-profile-unknown'))
}

function formatAssignmentsSnapshot(row: PreviewDiagnosticsRow, t: TFunction) {
    const value = row.assignmentsCount ?? row.assignments
    if (value === undefined) {
        return String(t('base-host-form.no-diagnostic-data'))
    }

    return `${value} (${t('base-host-form.diagnostic-snapshot-value')})`
}

function formatTrafficSnapshot(row: PreviewDiagnosticsRow, t: TFunction) {
    if (row.trafficBytes === undefined || row.trafficBytes === null) {
        return String(t('base-host-form.no-diagnostic-data'))
    }

    return `${prettyBytesUtil(row.trafficBytes)} (${translateDiagnosticSource(row.trafficSource, t)})`
}

function translateDiagnosticSource(
    source: PreviewDiagnosticsTrafficSource | undefined,
    t: TFunction
) {
    const keys = {
        snapshot: 'base-host-form.diagnostic-snapshot-value',
        node_current: 'base-host-form.diagnostic-current-node-value',
        not_loaded: 'base-host-form.no-diagnostic-data',
        unavailable: 'base-host-form.no-diagnostic-data'
    } as const

    return String(t(keys[source ?? 'not_loaded']))
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

function CompactIdCopy({ label, value }: { label: string; value?: string | null }) {
    const { t } = useTranslation()

    if (!value) {
        return null
    }

    return (
        <Group gap={4} wrap="nowrap">
            <Text c="dimmed" ff="monospace" size="xs">
                {label}: {maskUuid(value)}
            </Text>
            <CopyButton timeout={1500} value={value}>
                {({ copied, copy }) => (
                    <ActionIcon
                        aria-label={String(t('base-host-form.copy-id'))}
                        color={copied ? 'teal' : 'gray'}
                        onClick={(event) => {
                            event.stopPropagation()
                            copy()
                        }}
                        size="xs"
                        variant="subtle"
                    >
                        {copied ? <PiCheckDuotone size={12} /> : <PiCopyDuotone size={12} />}
                    </ActionIcon>
                )}
            </CopyButton>
        </Group>
    )
}

function NodeTitle({
    address,
    node,
    title
}: {
    address: ReactNode
    node?: HostBalancerNode
    title: ReactNode
}) {
    return (
        <Group align="flex-start" gap="sm" wrap="nowrap">
            <Group mt={2}>{node ? resolveCountryCode(node.countryCode, 22) : resolveCountryCode('XX', 22)}</Group>
            <Stack gap={2}>
                <Text fw={700}>{title}</Text>
                <Text c="dimmed" size="sm">
                    {address}
                </Text>
            </Stack>
        </Group>
    )
}

function targetProfileInboundLabel(
    target: DraftTarget,
    node: HostBalancerNode | undefined,
    configProfileByUuid: Map<string, HostBalancerConfigProfile>,
    requiredInboundUuid: string | undefined,
    t: TFunction
) {
    const backendInboundName = target.inboundName ?? target.inboundTag
    if (backendInboundName || target.inboundType || target.profileName) {
        const profile = target.profileName ?? String(t('base-host-form.node-profile-not-found'))
        const inbound = backendInboundName ?? String(t('base-host-form.inbound-unknown'))
        const protocol = target.inboundType
            ? `${target.inboundType}${target.inboundNetwork ? `/${target.inboundNetwork}` : ''}`
            : null

        return [profile, inbound, protocol].filter(Boolean).join(' · ')
    }

    if (!node) {
        return String(t('base-host-form.node-profile-unknown'))
    }

    const inbound = requiredInboundUuid
        ? node.configProfile.activeInbounds.find((item) => item.uuid === requiredInboundUuid)
        : undefined

    const profileUuid = node.configProfile.activeConfigProfileUuid ?? inbound?.profileUuid ?? null
    const profile = profileUuid
        ? (configProfileByUuid.get(profileUuid)?.name ?? String(t('base-host-form.node-profile-not-found')))
        : String(t('base-host-form.node-profile-not-found'))

    if (!inbound) {
        return `${profile} · ${t('base-host-form.required-inbound-not-found')}`
    }

    return `${profile} · ${inbound.tag} · ${inbound.type}${inbound.network ? `/${inbound.network}` : ''}`
}

function participationBadge(participates: boolean, t: TFunction) {
    return (
        <Badge color={participates ? 'teal' : 'red'} variant="light">
            {participates
                ? t('base-host-form.target-participates')
                : t('base-host-form.target-not-participating')}
        </Badge>
    )
}

function targetParticipationReason(
    target: DraftTarget,
    validation: HostBalancerTargetValidation | null,
    nodeStatus: 'connected' | 'connecting' | 'disabled' | 'disconnected' | 'unknown',
    t: TFunction
) {
    if (target.enabled === false) {
        return String(t('base-host-form.target-not-participating-disabled'))
    }
    if ((target.status ?? 'ACTIVE') === 'DRAINING') {
        return String(t('base-host-form.target-not-participating-draining'))
    }
    if ((target.status ?? 'ACTIVE') === 'DISABLED' || (target.status ?? 'ACTIVE') === 'DEAD') {
        return String(t('base-host-form.target-not-participating-status'))
    }
    if (validation?.hasRequiredInbound === false) {
        return String(t('base-host-form.validation-reason-missing-inbound'))
    }
    if (nodeStatus === 'disabled') {
        return String(t('base-host-form.validation-reason-node-disabled'))
    }
    if (nodeStatus === 'disconnected' || nodeStatus === 'connecting') {
        return String(t('base-host-form.validation-reason-node-disconnected'))
    }
    if (validation?.reasons[0]) {
        return translateValidationReason(validation.reasons[0], t)
    }

    return String(t('base-host-form.validation-pending-warning'))
}

function targetNodePickerDisabledReason({
    existingTarget,
    hasRequiredInbound,
    nodeStatus,
    t
}: {
    existingTarget: boolean
    hasRequiredInbound: boolean | null
    nodeStatus: 'connected' | 'connecting' | 'disabled' | 'disconnected' | 'unknown'
    t: TFunction
}) {
    if (existingTarget) {
        return String(t('base-host-form.target-node-already-added'))
    }
    if (hasRequiredInbound === false) {
        return String(t('base-host-form.validation-reason-missing-inbound'))
    }
    if (nodeStatus === 'disabled') {
        return String(t('base-host-form.validation-reason-node-disabled'))
    }
    if (nodeStatus === 'disconnected') {
        return String(t('base-host-form.validation-reason-node-disconnected'))
    }
    if (nodeStatus === 'connecting') {
        return String(t('base-host-form.validation-reason-node-connecting'))
    }

    return null
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

function targetCompatibilityBadge(
    target: DraftTarget,
    validation: HostBalancerTargetValidation | null,
    t: TFunction
) {
    if (validation) {
        return inboundCompatibilityBadge(validation, t)
    }

    const status = target.compatibilityStatus
    if (status === 'compatible') {
        return (
            <Badge color="teal" variant="light">
                {t('base-host-form.compatibility-compatible')}
            </Badge>
        )
    }
    if (status === 'missing_inbound') {
        return (
            <Badge color="red" variant="light">
                {t('base-host-form.compatibility-missing-inbound')}
            </Badge>
        )
    }
    if (status === 'node_disabled') {
        return (
            <Badge color="red" variant="light">
                {t('base-host-form.node-status-disabled')}
            </Badge>
        )
    }
    if (status === 'node_disconnected') {
        return (
            <Badge color="red" variant="light">
                {t('base-host-form.node-status-disconnected')}
            </Badge>
        )
    }

    return (
        <Badge color="gray" variant="light">
            {t('base-host-form.compatibility-unknown')}
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
    return decisionReasonTranslation(
        message,
        (key, values) => String(t(key as never, values as never)),
        (strategy) => translateStrategyName(strategy, t),
        (action) => translateDecisionAssignmentAction(action, t)
    )
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
