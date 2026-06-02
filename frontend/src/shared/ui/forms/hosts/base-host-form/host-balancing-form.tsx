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
import { useTranslation } from 'react-i18next'
import { TFunction } from 'i18next'
import { PiFlaskDuotone, PiPlus, PiScalesDuotone, PiTrashDuotone } from 'react-icons/pi'
import { TbActivityHeartbeat, TbAlertTriangle, TbPlayerPause, TbSkull } from 'react-icons/tb'
import { nanoid } from 'nanoid'
import { useMemo, useState } from 'react'
import { GetAllNodesCommand } from '@remnawave/backend-contract'

import {
    HostBalancer,
    HostBalancerPreview,
    HostBalancerPreviewSchema,
    HostBalancerStrategy,
    HostBalancerTargetInput,
    HostBalancerTargetStatus,
    HostBalancerTrafficMetric,
    HostBalancerUnavailablePolicy,
    useResolveUser
} from '@shared/api/hooks'
import { instance } from '@shared/api'
import { BaseOverlayHeader } from '@shared/ui/overlays/base-overlay-header'
import { SectionCard } from '@shared/ui/section-card'

type DraftTarget = HostBalancerTargetInput & {
    localId: string
    assignments?: number
    trafficBytes?: string | null
}

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

type IProps = {
    draft: HostBalancingDraft
    hostUuid?: string
    nodes: GetAllNodesCommand.Response['response']
    onChange: (draft: HostBalancingDraft) => void
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

export function HostBalancingForm({ draft, hostUuid, nodes, onChange }: IProps) {
    const { t } = useTranslation()
    const [previewUserUuid, setPreviewUserUuid] = useState('')
    const [preview, setPreview] = useState<HostBalancerPreview | null>(null)
    const [isPreviewLoading, setPreviewLoading] = useState(false)
    const resolveUser = useResolveUser()

    const nodeOptions = useMemo(
        () =>
            nodes.map((node) => ({
                value: node.uuid,
                label: `${node.name} (${node.address})`
            })),
        [nodes]
    )

    const isTrafficStrategy = TRAFFIC_STRATEGIES.includes(draft.strategy)

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
        if (!hostUuid || !previewUserUuid) {
            return
        }

        setPreviewLoading(true)
        try {
            const user = await resolveUser.mutateAsync({
                variables: UUID_PATTERN.test(previewUserUuid)
                    ? { uuid: previewUserUuid }
                    : { shortUuid: previewUserUuid }
            })
            const response = await instance.get(`/api/host-balancers/${hostUuid}/preview`, {
                params: { userUuid: user.uuid }
            })
            const parsed = await HostBalancerPreviewSchema.parseAsync(response.data.response)
            setPreview(parsed)
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
                            <Table miw={1120} striped withTableBorder>
                                <Table.Thead>
                                    <Table.Tr>
                                        <Table.Th>{t('base-host-form.target-node')}</Table.Th>
                                        <Table.Th>{t('base-host-form.override-address')}</Table.Th>
                                        <Table.Th>{t('base-host-form.override-port')}</Table.Th>
                                        <Table.Th>{t('base-host-form.weight')}</Table.Th>
                                        <Table.Th>{t('base-host-form.priority')}</Table.Th>
                                        <Table.Th>
                                            {t('base-host-form.max-assigned-users')}
                                        </Table.Th>
                                        <Table.Th>{t('base-host-form.traffic')}</Table.Th>
                                        <Table.Th>{t('base-host-form.assignments')}</Table.Th>
                                        <Table.Th>{t('base-host-form.status')}</Table.Th>
                                        <Table.Th>{t('base-host-form.actions')}</Table.Th>
                                    </Table.Tr>
                                </Table.Thead>
                                <Table.Tbody>
                                    {draft.targets.length === 0 && (
                                        <Table.Tr>
                                            <Table.Td colSpan={10}>
                                                <Text c="dimmed" ta="center">
                                                    {t('base-host-form.no-balancer-targets')}
                                                </Text>
                                            </Table.Td>
                                        </Table.Tr>
                                    )}

                                    {draft.targets.map((target) => (
                                        <Table.Tr key={target.localId}>
                                            <Table.Td>
                                                <Select
                                                    clearable
                                                    data={nodeOptions}
                                                    onChange={(value) =>
                                                        updateTarget(target.localId, {
                                                            nodeUuid: value || null
                                                        })
                                                    }
                                                    placeholder={t('base-host-form.select-node')}
                                                    value={target.nodeUuid ?? null}
                                                />
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
                                    disabled={!hostUuid || !previewUserUuid}
                                    leftSection={<PiFlaskDuotone size={16} />}
                                    loading={isPreviewLoading || resolveUser.isPending}
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
                            {preview && <PreviewResult preview={preview} />}
                        </Stack>
                    </Stack>
                </SectionCard.Section>
            )}
        </SectionCard.Root>
    )
}

function PreviewResult({ preview }: { preview: HostBalancerPreview }) {
    const { t } = useTranslation()
    const diagnostics = preview.diagnostics

    return (
        <Alert color={diagnostics.selectedTargetUuid ? 'teal' : 'yellow'} variant="light">
            <Stack gap="xs">
                <Group>
                    <Text fw={600}>{t('base-host-form.selected-target')}:</Text>
                    <Text>{diagnostics.selectedTargetUuid ?? '-'}</Text>
                </Group>
                <Text size="sm">
                    {diagnostics.reasons
                        .map((reason) => translateDiagnosticText(reason, t))
                        .join(' ') || t('base-host-form.no-selection-reason')}
                </Text>
                {diagnostics.warnings.map((warning) => (
                    <Text c="yellow" key={warning} size="sm">
                        {translateDiagnosticText(warning, t)}
                    </Text>
                ))}
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
        'target node lacks required inbound':
            'base-host-form.diagnostic-target-node-lacks-required-inbound'
    } as const

    const key = diagnosticKeys[message as keyof typeof diagnosticKeys]
    return key ? String(t(key)) : message
}

function emptyToNull(value?: string | null) {
    return value && value.trim() !== '' ? value.trim() : null
}
