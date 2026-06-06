import { Alert, Badge, Button, Group, SimpleGrid, Stack, Switch, Text } from '@mantine/core'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TbRouteAltLeft, TbShieldX } from 'react-icons/tb'

import { useUpdateRemnawaveSettings } from '@shared/api/hooks/remnawave-settings/remnawave-settings.mutation.hooks'
import { remnawaveSettingsQueryKeys } from '@shared/api/hooks/remnawave-settings/remnawave-settings.query.hooks'
import { SettingsCardShared } from '@shared/ui/settings-card'

interface IProps {
    hostBalancerGlobalEnabled: boolean
    hostBalancerEnvEnabled: boolean
    hostBalancerSummary?: {
        enabledHosts: number
        activeTargets: number
        warnings: number
        errors: number
    }
}

export function HostBalancerSettingsCardWidget({
    hostBalancerGlobalEnabled,
    hostBalancerEnvEnabled,
    hostBalancerSummary
}: IProps) {
    const { t } = useTranslation()
    const [enabled, setEnabled] = useState(hostBalancerGlobalEnabled)
    const updateSettings = useUpdateRemnawaveSettings({
        mutationFns: {
            onSuccess: (_data, _variables, _context, queryClient) => {
                queryClient.invalidateQueries({
                    queryKey: remnawaveSettingsQueryKeys.getRemnawaveSettings.queryKey
                })
            }
        }
    })

    useEffect(() => {
        setEnabled(hostBalancerGlobalEnabled)
    }, [hostBalancerGlobalEnabled])

    const isDirty = enabled !== hostBalancerGlobalEnabled
    const summary = hostBalancerSummary ?? {
        enabledHosts: 0,
        activeTargets: 0,
        warnings: 0,
        errors: 0
    }

    return (
        <SettingsCardShared.Container>
            <SettingsCardShared.Header
                description={t('host-balancer-settings-card.description')}
                icon={<TbRouteAltLeft size={24} />}
                iconColor="teal"
                iconVariant="soft"
                title={t('host-balancer-settings-card.title')}
            />

            <SettingsCardShared.Content>
                <Stack gap="md">
                    <Group justify="space-between">
                        <Stack gap={4}>
                            <Text fw={500}>{t('host-balancer-settings-card.global-enabled')}</Text>
                            <Text c="dimmed" size="sm">
                                {t('host-balancer-settings-card.global-enabled-description')}
                            </Text>
                        </Stack>
                        <Switch
                            checked={enabled}
                            color="teal.8"
                            disabled={!hostBalancerEnvEnabled}
                            onChange={(event) => setEnabled(event.currentTarget.checked)}
                        />
                    </Group>

                    <Group justify="space-between">
                        <Text fw={500}>{t('host-balancer-settings-card.env-status')}</Text>
                        <Badge color={hostBalancerEnvEnabled ? 'teal' : 'red'} variant="light">
                            {hostBalancerEnvEnabled
                                ? t('host-balancer-settings-card.env-enabled')
                                : t('host-balancer-settings-card.env-disabled')}
                        </Badge>
                    </Group>

                    <Group justify="space-between">
                        <Text fw={500}>{t('host-balancer-settings-card.global-status')}</Text>
                        <Badge color={hostBalancerGlobalEnabled ? 'teal' : 'gray'} variant="light">
                            {hostBalancerGlobalEnabled
                                ? t('host-balancer-settings-card.global-enabled-status')
                                : t('host-balancer-settings-card.global-disabled-status')}
                        </Badge>
                    </Group>

                    <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="xs">
                        <SummaryMetric
                            label={t('host-balancer-settings-card.enabled-hosts')}
                            value={summary.enabledHosts}
                        />
                        <SummaryMetric
                            label={t('host-balancer-settings-card.active-targets')}
                            value={summary.activeTargets}
                        />
                        <SummaryMetric
                            color={summary.warnings > 0 ? 'yellow' : 'gray'}
                            label={t('host-balancer-settings-card.warnings')}
                            value={summary.warnings}
                        />
                        <SummaryMetric
                            color={summary.errors > 0 ? 'red' : 'gray'}
                            label={t('host-balancer-settings-card.errors')}
                            value={summary.errors}
                        />
                    </SimpleGrid>

                    {!hostBalancerEnvEnabled && (
                        <Alert color="red" icon={<TbShieldX size={18} />} variant="light">
                            {t('host-balancer-settings-card.env-disabled-warning')}
                        </Alert>
                    )}
                </Stack>
            </SettingsCardShared.Content>

            <SettingsCardShared.Bottom>
                <Group justify="flex-end">
                    <Button
                        color="teal"
                        disabled={!isDirty || !hostBalancerEnvEnabled}
                        loading={updateSettings.isPending}
                        onClick={() =>
                            updateSettings.mutate({
                                variables: { hostBalancerGlobalEnabled: enabled }
                            })
                        }
                        size="md"
                    >
                        {t('common.save')}
                    </Button>
                </Group>
            </SettingsCardShared.Bottom>
        </SettingsCardShared.Container>
    )
}

function SummaryMetric({
    label,
    value,
    color = 'teal'
}: {
    label: string
    value: number
    color?: string
}) {
    return (
        <Stack gap={2}>
            <Text c="dimmed" size="xs">
                {label}
            </Text>
            <Badge color={color} size="lg" variant="light">
                {value}
            </Badge>
        </Stack>
    )
}
