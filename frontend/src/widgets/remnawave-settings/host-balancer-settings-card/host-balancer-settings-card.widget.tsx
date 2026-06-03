import { Alert, Badge, Button, Group, Stack, Switch, Text } from '@mantine/core'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TbRouteAltLeft, TbShieldX } from 'react-icons/tb'

import { useUpdateRemnawaveSettings } from '@shared/api/hooks/remnawave-settings/remnawave-settings.mutation.hooks'
import { remnawaveSettingsQueryKeys } from '@shared/api/hooks/remnawave-settings/remnawave-settings.query.hooks'
import { SettingsCardShared } from '@shared/ui/settings-card'

interface IProps {
    hostBalancerGlobalEnabled: boolean
    hostBalancerEnvEnabled: boolean
}

export function HostBalancerSettingsCardWidget({
    hostBalancerGlobalEnabled,
    hostBalancerEnvEnabled
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
