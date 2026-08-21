import NiceModal, { useModal } from '@ebay/nice-modal-react'
import { Drawer } from '@mantine/core'
import { useForm, schemaResolver } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import { CreateHostCommand, SECURITY_LAYERS } from '@remnawave/backend-contract'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PiListChecks } from 'react-icons/pi'

import { useNiceMantineModal } from '@shared/_modals/use-nice-modal'
import { queryClient } from '@shared/api'
import {
    QueryKeys,
    useCreateHost,
    useGetConfigProfiles,
    useGetHostTags,
    useGetInternalSquads,
    useGetNodes,
    useGetSubscriptionTemplates,
    useUpdateHostBalancer,
    useUpdateHostBalancerTargets,
    useValidateHostBalancerTargets
} from '@shared/api/hooks'
import { LoadingScreen } from '@shared/ui'
import { BaseHostForm } from '@shared/ui/forms/hosts/base-host-form'
import { BaseOverlayHeader } from '@shared/ui/overlays/base-overlay-header'
import { parseJsonField } from '@shared/utils/misc'
import {
    DEFAULT_HOST_BALANCING_DRAFT,
    HostBalancingDraft,
    sanitizeHostBalancingDraft,
    translateValidationReason
} from '@shared/ui/forms/hosts/base-host-form/host-balancing-form'
import { saveHostBalancingDraft } from '@shared/ui/forms/hosts/base-host-form/host-balancing-save-flow'

export const CreateHostDrawer = NiceModal.create(() => {
    const { t } = useTranslation()

    const modal = useModal()
    const { modalProps, hide } = useNiceMantineModal({
        modal,
        drawer: true
    })

    const { data: configProfiles } = useGetConfigProfiles()
    const { data: nodes } = useGetNodes()
    const { data: internalSquads } = useGetInternalSquads()
    const { data: templates } = useGetSubscriptionTemplates()
    const { data: hostTags } = useGetHostTags()

    const [advancedOpened, setAdvancedOpened] = useState(false)
    const [hostBalancingDraft, setHostBalancingDraft] = useState<HostBalancingDraft>(
        DEFAULT_HOST_BALANCING_DRAFT
    )

    const form = useForm<CreateHostCommand.RequestBody>({
        mode: 'uncontrolled',
        name: 'create-host-form',
        validateInputOnBlur: true,
        onValuesChange: (values) => {
            if (typeof values.vlessRouteId === 'string' && values.vlessRouteId === '') {
                form.setFieldValue('vlessRouteId', null)
            }
        },
        validate: schemaResolver(CreateHostCommand.RequestBodySchema),

        initialValues: {
            securityLayer: SECURITY_LAYERS.DEFAULT,
            port: 0,
            remark: '',
            address: '',
            inbound: {
                configProfileUuid: '',
                configProfileInboundUuid: ''
            }
        }
    })

    const { mutateAsync: createHost, isPending: isCreateHostPending } = useCreateHost({
        mutationFns: {
            onSuccess: async () => {
                hide()

                await queryClient.refetchQueries({
                    queryKey: QueryKeys.hosts.getAllTags.queryKey
                })

                await queryClient.refetchQueries({
                    queryKey: QueryKeys.hosts.getAllHosts.queryKey
                })
            }
        }
    })
    const { mutateAsync: updateHostBalancer, isPending: isUpdateHostBalancerPending } =
        useUpdateHostBalancer()
    const {
        mutateAsync: updateHostBalancerTargets,
        isPending: isUpdateHostBalancerTargetsPending
    } = useUpdateHostBalancerTargets()
    const {
        mutateAsync: validateHostBalancerTargets,
        isPending: isValidateHostBalancerTargetsPending
    } = useValidateHostBalancerTargets()

    const saveHostBalancing = async (hostUuid: string) => {
        if (hostBalancingDraft.touched) {
            const { targets } = sanitizeHostBalancingDraft(hostBalancingDraft)
            const validation = await validateHostBalancerTargets({
                route: { hostUuid },
                variables: { targets }
            })
            const invalidReasons = validation.targets.flatMap((target, index) =>
                target.severity === 'error' &&
                targets[index]?.enabled !== false &&
                targets[index]?.status === 'ACTIVE'
                    ? target.reasons.map((reason) => translateValidationReason(reason, t))
                    : []
            )
            if (invalidReasons.length > 0) {
                notifications.show({
                    title: t('create-host-modal.widget.error'),
                    message: `${t('base-host-form.cannot-save-active-invalid-targets')}\n${invalidReasons.join('\n')}\n${t('base-host-form.fix-or-disable-invalid-targets')}`,
                    color: 'red'
                })
                throw new Error('Host balancer targets validation failed')
            }
        }

        await saveHostBalancingDraft({
            draft: hostBalancingDraft,
            hostUuid,
            notifySuccess: () =>
                notifications.show({
                    title: t('common.success'),
                    message: t('base-host-form.balancer-settings-saved'),
                    color: 'teal'
                }),
            refetchSettings: (uuid) =>
                queryClient.refetchQueries({
                    queryKey: QueryKeys.hostBalancers.getSettings(uuid).queryKey
                }),
            setDraft: setHostBalancingDraft,
            updateSettings: updateHostBalancer,
            updateTargets: updateHostBalancerTargets
        })
    }

    const handleSubmit = form.onSubmit(async (values) => {
        if (!values.inbound.configProfileInboundUuid || !values.inbound.configProfileUuid) {
            notifications.show({
                title: t('create-host-modal.widget.error'),
                message: t('create-host-modal.widget.please-select-the-config-profile-and-inbound'),
                color: 'red'
            })

            return null
        }

        try {
            const createdHost = await createHost({
                variables: {
                    ...values,
                    isDisabled: !values.isDisabled,
                    sockoptParams: parseJsonField(values.sockoptParams),
                    muxParams: parseJsonField(values.muxParams),
                    xhttpExtraParams: parseJsonField(values.xhttpExtraParams),
                    finalMask: parseJsonField(values.finalMask),
                    inbound: {
                        configProfileInboundUuid: values.inbound.configProfileInboundUuid,
                        configProfileUuid: values.inbound.configProfileUuid
                    }
                }
            })
            await saveHostBalancing(createdHost.uuid)
            hide()
        } catch {
            // Mutation hooks display the actionable error.
        }

        return null
    })

    form.watch('inbound.configProfileInboundUuid', ({ value }) => {
        const { configProfileUuid } = form.getValues().inbound
        if (!configProfileUuid) {
            return
        }

        const configProfile = configProfiles?.configProfiles.find(
            (configProfile) => configProfile.uuid === configProfileUuid
        )
        if (configProfile) {
            form.setFieldValue(
                'port',
                configProfile.inbounds.find((inbound) => inbound.uuid === value)?.port ?? 0
            )
        }
    })

    return (
        <Drawer
            {...modalProps}
            padding="lg"
            position="right"
            size="68.75rem"
            title={
                <BaseOverlayHeader
                    iconColor="teal"
                    IconComponent={PiListChecks}
                    iconVariant="soft"
                    title={t('create-host-modal.widget.new-host')}
                />
            }
        >
            {!configProfiles || !nodes || !templates || !internalSquads || !hostTags ? (
                <LoadingScreen />
            ) : (
                <BaseHostForm
                    advancedOpened={advancedOpened}
                    configProfiles={configProfiles.configProfiles}
                    form={form}
                    handleSubmit={handleSubmit}
                    hostBalancingDraft={hostBalancingDraft}
                    hostTags={hostTags.tags}
                    internalSquads={internalSquads.internalSquads}
                    isSubmitting={
                        isCreateHostPending ||
                        isUpdateHostBalancerPending ||
                        isUpdateHostBalancerTargetsPending ||
                        isValidateHostBalancerTargetsPending
                    }
                    nodes={nodes}
                    onHostBalancingDraftChange={setHostBalancingDraft}
                    setAdvancedOpened={setAdvancedOpened}
                    subscriptionTemplates={templates.templates}
                />
            )}
        </Drawer>
    )
})
