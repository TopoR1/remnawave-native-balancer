import {
    ActionIcon,
    Alert,
    Badge,
    Button,
    Divider,
    Group,
    NumberInput,
    ScrollArea,
    Select,
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
import { useEffect, useMemo, useState } from 'react'
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
import { SectionCard } from '@shared/ui/section-card'

type DraftTarget = HostBalancerTargetInput & {
    localId: string
    assignments?: number
    trafficBytes?: string | null
}
type HostBalancerNode = GetAllNodesCommand.Response['response'][number]

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

type IProps = {
    draft: HostBalancingDraft
    hostPort?: number
    hostUuid?: string
    nodes: GetAllNodesCommand.Response['response']
    onChange: (draft: HostBalancingDraft) => void
    onValidationChange?: (validation: HostBalancerTargetsValidation | null) => void
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
    onValidationChange
}: IProps) {
    const { t } = useTranslation()
    const [previewUserUuid, setPreviewUserUuid] = useState('')
    const [preview, setPreview] = useState<HostBalancerPreview | null>(null)
    const [previewError, setPreviewError] = useState<string | null>(null)
    const [validation, setValidation] = useState<HostBalancerTargetsValidation | null>(null)
    const [isPreviewLoading, setPreviewLoading] = useState(false)
    const { mutateAsync: validateTargetsAsync } = useValidateHostBalancerTargets()
    const { data: remnawaveSettings } = useGetRemnawaveSettings()
    const decisionsQuery = useGetHostBalancerDecisions({
        route: { hostUuid: hostUuid ?? '' },
        query: { limit: 50 },
        rQueryParams: {
            enabled: !!hostUuid
        }
    })

    const nodeOptions = useMemo(
        () =>
            nodes.map((node) => ({
                value: node.uuid,
                label: `${node.name} (${node.address})`
            })),
        [nodes]
    )
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

        return () => {
            isCurrent = false
        }
    }, [hostUuid, onValidationChange, validateTargetsAsync, validationPayload])

    const patchDraft = (patch: Partial<HostBalancingDraft>) => {
        onChange({
            ...draft,
            ...patch,
            touched: true
        })
    }

    const updateTarget = (localId: string, patch: Partial<DraftTarget>) => {
        patchDraft({
            targets: draft.targets.map((target) =>
                target.localId === localId ? { ...target, ...patch } : target
            )
        })
    }

    const addTarget = () => {
        patchDraft({
            targets: [
                ...draft.targets,
                {
                    localId: nanoid(),
                    nodeUuid: null,
                    enabled: true,
                    status: 'ACTIVE',
                    weight: 1,
                    priority: 100,
                    maxAssignedUsers: null,
                    overrideAddress: null,
                    overridePort: null,
                    overrideSni: null,
                    overrideHost: null,
                    overridePath: null
                }
            ]
        })
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

    return (
        <SectionCard.Root>
            <span data-native-host-balancer-ui={HOST_BALANCER_BUILD_MARKER} hidden />
            <SectionCard.Section>
                <Group justify="space-between">
                    <BaseOverlayHeader
                        iconColor="teal"
                        IconComponent={PiScalesDuotone}
                        iconVariant="soft"
                        title={t('base-host-form.balancing')}
                        titleOrder={5}
                    />
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
                                label={t('base-host-form.strategy')}
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
                                label={t('base-host-form.unavailable-policy')}
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
                                label={t('base-host-form.sticky-assignments')}
                                onChange={(event) =>
                                    patchDraft({ stickyEnabled: event.currentTarget.checked })
                                }
                            />
                            {isTrafficStrategy && (
                                <Switch
                                    checked={draft.rebalanceExistingAssignmentsByTraffic}
                                    color="teal.8"
                                    label={t(
                                        'base-host-form.rebalance-existing-assignments-by-traffic'
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
                                label={t('base-host-form.traffic-metric')}
                                onChange={(value) =>
                                    patchDraft({
                                        trafficMetric: value as HostBalancerTrafficMetric
                                    })
                                }
                                value={draft.trafficMetric ?? 'CURRENT_PERIOD'}
                            />
                        )}

                        <Divider />

                        <Group justify="space-between">
                            <Text fw={600}>{t('base-host-form.targets')}</Text>
                            <Button
                                leftSection={<PiPlus size={16} />}
                                onClick={addTarget}
                                size="xs"
                            >
                                {t('base-host-form.add-target')}
                            </Button>
                        </Group>

                        <ScrollArea>
                            <Table miw={1960} striped withTableBorder>
                                <Table.Thead>
                                    <Table.Tr>
                                        <Table.Th>{t('base-host-form.target-node')}</Table.Th>
                                        <Table.Th>{t('base-host-form.node-name')}</Table.Th>
                                        <Table.Th>{t('base-host-form.node-address')}</Table.Th>
                                        <Table.Th>{t('base-host-form.override-address')}</Table.Th>
                                        <Table.Th>{t('base-host-form.override-port')}</Table.Th>
                                        <Table.Th>{t('base-host-form.override-sni')}</Table.Th>
                                        <Table.Th>{t('base-host-form.override-host')}</Table.Th>
                                        <Table.Th>{t('base-host-form.override-path')}</Table.Th>
                                        <Table.Th>{t('base-host-form.weight')}</Table.Th>
                                        <Table.Th>{t('base-host-form.priority')}</Table.Th>
                                        <Table.Th>
                                            {t('base-host-form.max-assigned-users')}
                                        </Table.Th>
                                        <Table.Th>{t('base-host-form.traffic')}</Table.Th>
                                        <Table.Th>{t('base-host-form.assignments')}</Table.Th>
                                        <Table.Th>{t('base-host-form.node-status')}</Table.Th>
                                        <Table.Th>
                                            {t('base-host-form.inbound-compatibility')}
                                        </Table.Th>
                                        <Table.Th>{t('base-host-form.validation')}</Table.Th>
                                        <Table.Th>{t('base-host-form.target-enabled')}</Table.Th>
                                        <Table.Th>{t('base-host-form.status')}</Table.Th>
                                        <Table.Th>{t('base-host-form.actions')}</Table.Th>
                                    </Table.Tr>
                                </Table.Thead>
                                <Table.Tbody>
                                    {draft.targets.length === 0 && (
                                        <Table.Tr>
                                            <Table.Td colSpan={19}>
                                                <Text c="dimmed" ta="center">
                                                    {t('base-host-form.no-balancer-targets')}
                                                </Text>
                                            </Table.Td>
                                        </Table.Tr>
                                    )}

                                    {draft.targets.map((target, index) => (
                                        <Table.Tr key={target.localId}>
                                            <Table.Td>
                                                <Select
                                                    clearable
                                                    data={nodeOptions}
                                                    onChange={(value) => {
                                                        const node = value
                                                            ? nodeByUuid.get(value)
                                                            : null
                                                        updateTarget(target.localId, {
                                                            nodeUuid: value || null,
                                                            overrideAddress:
                                                                node?.address ??
                                                                target.overrideAddress ??
                                                                null,
                                                            overridePort:
                                                                hostPort ??
                                                                node?.port ??
                                                                target.overridePort ??
                                                                null
                                                        })
                                                    }}
                                                    placeholder={t('base-host-form.select-node')}
                                                    value={target.nodeUuid ?? null}
                                                />
                                            </Table.Td>
                                            <Table.Td>
                                                {validation?.targets[index]?.nodeName ??
                                                    (target.nodeUuid
                                                        ? (nodeByUuid.get(target.nodeUuid)?.name ??
                                                          '-')
                                                        : '-')}
                                            </Table.Td>
                                            <Table.Td>
                                                {validation?.targets[index]?.nodeAddress ??
                                                    (target.nodeUuid
                                                        ? (nodeByUuid.get(target.nodeUuid)
                                                              ?.address ?? '-')
                                                        : '-')}
                                            </Table.Td>
                                            <Table.Td>
                                                <TextInput
                                                    onChange={(event) =>
                                                        updateTarget(target.localId, {
                                                            overrideAddress:
                                                                event.currentTarget.value
                                                        })
                                                    }
                                                    value={target.overrideAddress ?? ''}
                                                />
                                                {target.nodeUuid &&
                                                    target.overrideAddress &&
                                                    nodeByUuid.get(target.nodeUuid)?.address &&
                                                    target.overrideAddress !==
                                                        nodeByUuid.get(target.nodeUuid)
                                                            ?.address && (
                                                        <Text c="yellow" mt={4} size="xs">
                                                            {t(
                                                                'base-host-form.override-address-mismatch-warning'
                                                            )}
                                                        </Text>
                                                    )}
                                                {target.nodeUuid && !target.overrideAddress && (
                                                    <Text c="yellow" mt={4} size="xs">
                                                        {t(
                                                            'base-host-form.target-original-address-warning'
                                                        )}
                                                    </Text>
                                                )}
                                            </Table.Td>
                                            <Table.Td>
                                                <NumberInput
                                                    allowDecimal={false}
                                                    allowNegative={false}
                                                    hideControls
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
                                            </Table.Td>
                                            <Table.Td>
                                                <TextInput
                                                    onChange={(event) =>
                                                        updateTarget(target.localId, {
                                                            overrideSni: event.currentTarget.value
                                                        })
                                                    }
                                                    value={target.overrideSni ?? ''}
                                                />
                                            </Table.Td>
                                            <Table.Td>
                                                <TextInput
                                                    onChange={(event) =>
                                                        updateTarget(target.localId, {
                                                            overrideHost: event.currentTarget.value
                                                        })
                                                    }
                                                    value={target.overrideHost ?? ''}
                                                />
                                            </Table.Td>
                                            <Table.Td>
                                                <TextInput
                                                    onChange={(event) =>
                                                        updateTarget(target.localId, {
                                                            overridePath: event.currentTarget.value
                                                        })
                                                    }
                                                    value={target.overridePath ?? ''}
                                                />
                                            </Table.Td>
                                            <Table.Td>
                                                <NumberInput
                                                    allowDecimal={false}
                                                    allowNegative={false}
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
                                            </Table.Td>
                                            <Table.Td>
                                                <NumberInput
                                                    allowDecimal={false}
                                                    allowNegative={false}
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
                                            </Table.Td>
                                            <Table.Td>
                                                <NumberInput
                                                    allowDecimal={false}
                                                    allowNegative={false}
                                                    min={1}
                                                    onChange={(value) =>
                                                        updateTarget(target.localId, {
                                                            maxAssignedUsers:
                                                                typeof value === 'number'
                                                                    ? value
                                                                    : null
                                                        })
                                                    }
                                                    value={target.maxAssignedUsers ?? undefined}
                                                />
                                            </Table.Td>
                                            <Table.Td>{target.trafficBytes ?? '-'}</Table.Td>
                                            <Table.Td>{target.assignments ?? '-'}</Table.Td>
                                            <Table.Td>
                                                {nodeStatusBadge(
                                                    validation?.targets[index]?.nodeStatus ??
                                                        resolveLocalNodeStatus(
                                                            target.nodeUuid
                                                                ? nodeByUuid.get(target.nodeUuid)
                                                                : undefined
                                                        ),
                                                    t
                                                )}
                                            </Table.Td>
                                            <Table.Td>
                                                {inboundCompatibilityBadge(
                                                    validation?.targets[index] ?? null,
                                                    t
                                                )}
                                            </Table.Td>
                                            <Table.Td>
                                                {validationBadge(
                                                    validation?.targets[index] ?? null,
                                                    t
                                                )}
                                                {validation?.targets[index]?.reasons.map(
                                                    (reason) => (
                                                        <Text
                                                            c={
                                                                validation.targets[index]
                                                                    .severity === 'error'
                                                                    ? 'red'
                                                                    : 'yellow'
                                                            }
                                                            key={reason}
                                                            mt={4}
                                                            size="xs"
                                                        >
                                                            {translateValidationReason(reason, t)}
                                                        </Text>
                                                    )
                                                )}
                                            </Table.Td>
                                            <Table.Td>
                                                <Switch
                                                    checked={target.enabled ?? true}
                                                    color="teal.8"
                                                    onChange={(event) =>
                                                        updateTarget(target.localId, {
                                                            enabled: event.currentTarget.checked
                                                        })
                                                    }
                                                />
                                            </Table.Td>
                                            <Table.Td>
                                                {statusBadge(target.status ?? 'ACTIVE', t)}
                                            </Table.Td>
                                            <Table.Td>
                                                <Group gap={4} wrap="nowrap">
                                                    <Tooltip label={t('base-host-form.set-active')}>
                                                        <ActionIcon
                                                            color="teal"
                                                            onClick={() =>
                                                                setStatus(target.localId, 'ACTIVE')
                                                            }
                                                            variant="subtle"
                                                        >
                                                            <TbActivityHeartbeat size={16} />
                                                        </ActionIcon>
                                                    </Tooltip>
                                                    <Tooltip
                                                        label={t('base-host-form.set-draining')}
                                                    >
                                                        <ActionIcon
                                                            color="yellow"
                                                            onClick={() =>
                                                                setStatus(
                                                                    target.localId,
                                                                    'DRAINING'
                                                                )
                                                            }
                                                            variant="subtle"
                                                        >
                                                            <TbPlayerPause size={16} />
                                                        </ActionIcon>
                                                    </Tooltip>
                                                    <Tooltip
                                                        label={t('base-host-form.disable-target')}
                                                    >
                                                        <ActionIcon
                                                            color="gray"
                                                            onClick={() =>
                                                                setStatus(
                                                                    target.localId,
                                                                    'DISABLED'
                                                                )
                                                            }
                                                            variant="subtle"
                                                        >
                                                            <TbAlertTriangle size={16} />
                                                        </ActionIcon>
                                                    </Tooltip>
                                                    <Tooltip label={t('base-host-form.mark-dead')}>
                                                        <ActionIcon
                                                            color="red"
                                                            onClick={() =>
                                                                setStatus(target.localId, 'DEAD')
                                                            }
                                                            variant="subtle"
                                                        >
                                                            <TbSkull size={16} />
                                                        </ActionIcon>
                                                    </Tooltip>
                                                    <Tooltip
                                                        label={t('base-host-form.remove-target')}
                                                    >
                                                        <ActionIcon
                                                            color="red"
                                                            onClick={() =>
                                                                removeTarget(target.localId)
                                                            }
                                                            variant="subtle"
                                                        >
                                                            <PiTrashDuotone size={16} />
                                                        </ActionIcon>
                                                    </Tooltip>
                                                </Group>
                                            </Table.Td>
                                        </Table.Tr>
                                    ))}
                                </Table.Tbody>
                            </Table>
                        </ScrollArea>

                        <Divider />

                        <Stack gap="xs">
                            <Text fw={600}>{t('base-host-form.preview-selection')}</Text>
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
    const expandedDecision =
        decisions.find((decision) => decision.uuid === expandedDecisionUuid) ?? null

    return (
        <Stack gap="xs">
            <Group justify="space-between">
                <Text fw={600}>{t('base-host-form.decisions-audit')}</Text>
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
                <ScrollArea>
                    <Table miw={1100} withRowBorders>
                        <Table.Thead>
                            <Table.Tr>
                                <Table.Th>{t('base-host-form.decision-time')}</Table.Th>
                                <Table.Th>{t('base-host-form.decision-user')}</Table.Th>
                                <Table.Th>{t('base-host-form.decision-target')}</Table.Th>
                                <Table.Th>{t('base-host-form.strategy')}</Table.Th>
                                <Table.Th>{t('base-host-form.decision-reason')}</Table.Th>
                                <Table.Th>
                                    {t('base-host-form.decision-assignment-action')}
                                </Table.Th>
                                <Table.Th>{t('base-host-form.decision-final-address')}</Table.Th>
                                <Table.Th>{t('base-host-form.candidates')}</Table.Th>
                                <Table.Th>{t('base-host-form.excluded-targets')}</Table.Th>
                                <Table.Th>{t('base-host-form.decision-warnings')}</Table.Th>
                            </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                            {decisions.map((decision) => (
                                <Table.Tr
                                    key={decision.uuid}
                                    onClick={() =>
                                        setExpandedDecisionUuid((current) =>
                                            current === decision.uuid ? null : decision.uuid
                                        )
                                    }
                                    style={{ cursor: 'pointer' }}
                                >
                                    <Table.Td>{decision.createdAt.toLocaleString()}</Table.Td>
                                    <Table.Td>{maskUuid(decision.userUuid)}</Table.Td>
                                    <Table.Td>{decision.targetUuid ?? '-'}</Table.Td>
                                    <Table.Td>{decision.strategy}</Table.Td>
                                    <Table.Td>
                                        {translateDecisionReason(decision.reason, t)}
                                    </Table.Td>
                                    <Table.Td>
                                        {translateDecisionAssignmentAction(
                                            decision.assignmentAction,
                                            t
                                        )}
                                    </Table.Td>
                                    <Table.Td>
                                        {decision.finalHostOverrides
                                            ? `${decision.finalHostOverrides.address}:${decision.finalHostOverrides.port}`
                                            : '-'}
                                    </Table.Td>
                                    <Table.Td>{decision.candidates.length}</Table.Td>
                                    <Table.Td>{decision.excludedTargets.length}</Table.Td>
                                    <Table.Td>
                                        {decision.warnings.length > 0
                                            ? decision.warnings
                                                  .map((warning) =>
                                                      translateDecisionReason(warning, t)
                                                  )
                                                  .join(', ')
                                            : '-'}
                                    </Table.Td>
                                </Table.Tr>
                            ))}
                        </Table.Tbody>
                    </Table>
                </ScrollArea>
            )}

            {expandedDecision && <DecisionDetail decision={expandedDecision} />}
        </Stack>
    )
}

function DecisionDetail({ decision }: { decision: HostBalancerDecision }) {
    const { t } = useTranslation()

    return (
        <Alert color="blue" variant="light">
            <Stack gap="xs">
                <Group>
                    <Text fw={600}>{t('base-host-form.unavailable-policy')}:</Text>
                    <Text>{decision.unavailablePolicy}</Text>
                </Group>
                <Group>
                    <Text fw={600}>{t('base-host-form.selected-target')}:</Text>
                    <Text>{decision.selectedTarget?.targetUuid ?? decision.targetUuid ?? '-'}</Text>
                </Group>
                {decision.finalHostOverrides && (
                    <Group gap="lg">
                        <Text size="sm">
                            {t('base-host-form.preview-final-address')}:{' '}
                            {decision.finalHostOverrides.address}
                        </Text>
                        <Text size="sm">
                            {t('base-host-form.preview-final-port')}:{' '}
                            {decision.finalHostOverrides.port}
                        </Text>
                    </Group>
                )}
                <DiagnosticsTable
                    rows={decision.candidates}
                    title={t('base-host-form.candidates')}
                />
                <DiagnosticsTable
                    rows={decision.excludedTargets}
                    title={t('base-host-form.excluded-targets')}
                />
                {decision.warnings.map((warning, index) => (
                    <Text c="yellow" key={`${warning}-${index}`} size="sm">
                        {translateDecisionReason(warning, t)}
                    </Text>
                ))}
            </Stack>
        </Alert>
    )
}

function PreviewResult({ preview }: { preview: HostBalancerPreview }) {
    const { t } = useTranslation()
    const diagnostics = preview.diagnostics
    const selectedTargetLabel =
        diagnostics.selectedTarget?.targetUuid ?? diagnostics.selectedTargetUuid ?? null
    const finalHostOverrides = diagnostics.finalHostOverrides
    const resultMessage = resolvePreviewResultMessage(preview, t)

    return (
        <Alert color={diagnostics.selectedTargetUuid ? 'teal' : 'yellow'} variant="light">
            <Stack gap="xs">
                <Group>
                    <Text fw={600}>{t('base-host-form.selected-target')}:</Text>
                    <Text>{selectedTargetLabel ?? '-'}</Text>
                </Group>
                <Text fw={600} size="sm">
                    {resultMessage}
                </Text>
                <Group>
                    <Text fw={600} size="sm">
                        {t('base-host-form.preview-assignment-action')}:
                    </Text>
                    <Badge
                        color={diagnostics.assignmentAction === 'preview_only' ? 'gray' : 'teal'}
                    >
                        {t(`base-host-form.preview-action-${diagnostics.assignmentAction}`)}
                    </Badge>
                </Group>
                {diagnostics.existingAssignment && (
                    <Group>
                        <Text fw={600} size="sm">
                            {t('base-host-form.preview-existing-assignment')}:
                        </Text>
                        <Text size="sm">{diagnostics.existingAssignment.targetUuid}</Text>
                    </Group>
                )}
                <Text size="sm">
                    {diagnostics.reasons
                        .map((reason) => translateDiagnosticText(reason, t))
                        .join(' ') || t('base-host-form.no-selection-reason')}
                </Text>
                {diagnostics.warnings.map((warning, index) => (
                    <Text c="yellow" key={`${warning}-${index}`} size="sm">
                        {translateDiagnosticText(warning, t)}
                    </Text>
                ))}
                {finalHostOverrides && (
                    <Group gap="lg">
                        <Text size="sm">
                            {t('base-host-form.preview-final-address')}:{' '}
                            {finalHostOverrides.address}
                        </Text>
                        <Text size="sm">
                            {t('base-host-form.preview-final-port')}: {finalHostOverrides.port}
                        </Text>
                    </Group>
                )}
                <DiagnosticsTable
                    rows={diagnostics.candidates ?? []}
                    title={t('base-host-form.candidates')}
                />
                <DiagnosticsTable
                    rows={diagnostics.excludedTargets ?? []}
                    title={t('base-host-form.excluded-targets')}
                />
            </Stack>
        </Alert>
    )
}

function resolvePreviewResultMessage(preview: HostBalancerPreview, t: TFunction) {
    const diagnostics = preview.diagnostics
    const selectedTargetUuid =
        diagnostics.selectedTarget?.targetUuid ?? diagnostics.selectedTargetUuid ?? null

    if (selectedTargetUuid) {
        return String(
            t('base-host-form.preview-will-select-target', {
                targetUuid: selectedTargetUuid
            })
        )
    }

    if ((diagnostics.candidates ?? []).length === 0) {
        if (diagnostics.unavailablePolicy === 'ORIGINAL_HOST' && diagnostics.finalHostOverrides) {
            return String(t('base-host-form.preview-original-host'))
        }
        if (diagnostics.unavailablePolicy === 'HIDE_HOST') {
            return String(t('base-host-form.preview-host-hidden'))
        }

        return String(t('base-host-form.preview-no-candidates'))
    }

    return String(t('base-host-form.preview-no-candidates'))
}

function DiagnosticsTable({
    rows,
    title
}: {
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
                                <Badge color={row.selected ? 'teal' : 'gray'} variant="light">
                                    {row.selected
                                        ? t('base-host-form.selected')
                                        : t('base-host-form.candidate')}
                                </Badge>
                            </Table.Td>
                            <Table.Td>{row.targetUuid}</Table.Td>
                            <Table.Td>
                                {t('base-host-form.traffic-score')}: {row.score ?? '-'}
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
        return String(
            t('base-host-form.decision-reason-selected', {
                strategy: translateStrategyName(selected[1], t),
                action: translateDecisionAssignmentAction(selected[2], t)
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

function translateValidationReason(message: string, t: TFunction): string {
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
