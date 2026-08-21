import NiceModal, { useModal } from '@ebay/nice-modal-react'
import { Drawer } from '@mantine/core'
import { useForm, schemaResolver } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import { UpdateHostCommand } from '@remnawave/backend-contract'
import { type FormEvent, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PiListChecks } from 'react-icons/pi'

import { useNiceMantineModal } from '@shared/_modals/use-nice-modal'
import { queryClient } from '@shared/api'
import {
    QueryKeys,
    useGetConfigProfiles,
    useGetHostTags,
    useGetHostBalancer,
    useGetInternalSquads,
    useGetNodes,
    useGetSubscriptionTemplates,
    useUpdateHost,
    useUpdateHostBalancer,
    useUpdateHostBalancerTargets,
    useValidateHostBalancerTargets
} from '@shared/api/hooks'
import { LoadingScreen } from '@shared/ui'
import { BaseHostForm } from '@shared/ui/forms/hosts/base-host-form'
import {
    DEFAULT_HOST_BALANCING_DRAFT,
    HostBalancingDraft,
    hostBalancerToDraft,
    sanitizeHostBalancingDraft,
    translateValidationReason
} from '@shared/ui/forms/hosts/base-host-form/host-balancing-form'
import { saveHostBalancingDraft } from '@shared/ui/forms/hosts/base-host-form/host-balancing-save-flow'
import { BaseOverlayHeader } from '@shared/ui/overlays/base-overlay-header'
import { parseJsonField, stringifyJsonField } from '@shared/utils/misc'

interface IProps {
    host: UpdateHostCommand.Response['response']
}

export const EditHostDrawer = NiceModal.create((props: IProps) => {
    const { host } = props
    const { t } = useTranslation()

    const modal = useModal()
    const { modalProps, hide } = useNiceMantineModal({
        modal,
        drawer: true,
        onClose() {
            queryClient.refetchQueries({
                queryKey: QueryKeys.hosts.getAllTags.queryKey
            })
            queryClient.refetchQueries({
                queryKey: QueryKeys.hosts.getAllHosts.queryKey
            })
        }
    })

    const [advancedOpened, setAdvancedOpened] = useState(false)
    const [hostBalancingDraft, setHostBalancingDraft] = useState<HostBalancingDraft>(
        DEFAULT_HOST_BALANCING_DRAFT
    )
    const hydratedHostBalancerUuidRef = useRef<string | null>(null)

    const { data: configProfiles } = useGetConfigProfiles()
    const { data: nodes } = useGetNodes()
    const { data: templates } = useGetSubscriptionTemplates()
    const { data: internalSquads } = useGetInternalSquads()
    const { data: hostTags } = useGetHostTags()
    const { data: hostBalancer } = useGetHostBalancer({
        route: { hostUuid: host.uuid }
    })

    const form = useForm<UpdateHostCommand.RequestBody>({
        name: 'edit-host-form',
        mode: 'uncontrolled',
        validateInputOnBlur: true,
        onValuesChange: (values) => {
            if (typeof values.vlessRouteId === 'string' && values.vlessRouteId === '') {
                form.setFieldValue('vlessRouteId', null)
            }
        },
        validate: schemaResolver(UpdateHostCommand.RequestBodySchema.omit({ uuid: true }))
    })

    const { mutateAsync: updateHost, isPending: isUpdateHostPending } = useUpdateHost({
        mutationFns: {
            onSuccess: async () => {
                hide()
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

    useEffect(() => {
        if (configProfiles) {
            form.initialize({
                uuid: host.uuid,
                remark: host.remark,
                address: host.address,
                port: host.port,
                securityLayer: host.securityLayer,
                isDisabled: !host.isDisabled,
                sni: host.sni ?? undefined,
                host: host.host ?? undefined,
                path: host.path ?? undefined,
                alpn: host.alpn ?? undefined,
                fingerprint: host.fingerprint ?? undefined,
                inbound: {
                    configProfileUuid: host.inbound.configProfileUuid ?? '',
                    configProfileInboundUuid: host.inbound.configProfileInboundUuid ?? ''
                },
                serverDescription: host.serverDescription ?? undefined,
                xhttpExtraParams: stringifyJsonField(host.xhttpExtraParams),
                muxParams: stringifyJsonField(host.muxParams),
                sockoptParams: stringifyJsonField(host.sockoptParams),
                finalMask: stringifyJsonField(host.finalMask),
                mapper: host.mapper,
                tags: host.tags ?? undefined,
                isHidden: host.isHidden,
                overrideSniFromAddress: host.overrideSniFromAddress,
                keepSniBlank: host.keepSniBlank,
                vlessRouteId: host.vlessRouteId ?? undefined,
                pinnedPeerCertSha256: host.pinnedPeerCertSha256 ?? undefined,
                verifyPeerCertByName: host.verifyPeerCertByName ?? undefined,
                shuffleHost: host.shuffleHost ?? undefined,
                mihomoX25519: host.mihomoX25519 ?? undefined,
                mihomoIpVersion: host.mihomoIpVersion ?? undefined,
                nodes: host.nodes ?? undefined,
                xrayJsonTemplateUuid: host.xrayJsonTemplateUuid ?? undefined,
                excludedInternalSquads: host.excludedInternalSquads ?? undefined,
                excludeFromSubscriptionTypes: host.excludeFromSubscriptionTypes ?? undefined
            })
        }
    }, [configProfiles])

    useEffect(() => {
        setHostBalancingDraft((currentDraft) => {
            if (hydratedHostBalancerUuidRef.current === host.uuid && currentDraft.touched) {
                return currentDraft
            }
            hydratedHostBalancerUuidRef.current = host.uuid
            return hostBalancerToDraft(hostBalancer ?? null)
        })
    }, [host.uuid, hostBalancer])

    form.watch('inbound.configProfileInboundUuid', ({ value }) => {
        const { inbound } = form.getValues()
        if (!inbound?.configProfileUuid) {
            return
        }

        const configProfile = configProfiles?.configProfiles.find(
            (configProfile) => configProfile.uuid === inbound.configProfileUuid
        )
        if (configProfile) {
            form.setFieldValue(
                'port',
                configProfile.inbounds.find((inbound) => inbound.uuid === value)?.port ?? undefined
            )
        }
    })

    const saveHostBalancing = async () => {
        if (hostBalancingDraft.touched) {
            const { targets } = sanitizeHostBalancingDraft(hostBalancingDraft)
            const validation = await validateHostBalancerTargets({
                route: { hostUuid: host.uuid },
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
                    title: t('edit-host-modal.widget.error'),
                    message: `${t('base-host-form.cannot-save-active-invalid-targets')}\n${invalidReasons.join('\n')}\n${t('base-host-form.fix-or-disable-invalid-targets')}`,
                    color: 'red'
                })
                throw new Error('Host balancer targets validation failed')
            }
        }

        await saveHostBalancingDraft({
            draft: hostBalancingDraft,
            hostUuid: host.uuid,
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

    const handleSubmit = async (event?: FormEvent<HTMLFormElement>) => {
        event?.preventDefault()
        const shouldUpdateHost = form.isDirty() && form.isTouched()
        const shouldSaveBalancing = hostBalancingDraft.touched

        if (!shouldUpdateHost && !shouldSaveBalancing) return
        if (shouldUpdateHost && form.validate().hasErrors) return

        try {
            if (shouldUpdateHost) {
                const values = form.getValues()
                await updateHost({
                    variables: {
                        ...values,
                        isDisabled: !values.isDisabled,
                        uuid: host.uuid,
                        xhttpExtraParams: parseJsonField(values.xhttpExtraParams),
                        muxParams: parseJsonField(values.muxParams),
                        sockoptParams: parseJsonField(values.sockoptParams),
                        finalMask: parseJsonField(values.finalMask)
                    }
                })
            }
            if (shouldSaveBalancing) await saveHostBalancing()
            hide()
        } catch {
            // Mutation hooks display the actionable error.
        }
    }

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
                    subtitle={host.uuid}
                    title={t('edit-host-modal.widget.edit-host')}
                    withCopy={true}
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
                        isUpdateHostPending ||
                        isUpdateHostBalancerPending ||
                        isUpdateHostBalancerTargetsPending ||
                        isValidateHostBalancerTargetsPending
                    }
                    nodes={nodes}
                    onHostBalancingDraftChange={setHostBalancingDraft}
                    hostUuid={host.uuid}
                    setAdvancedOpened={setAdvancedOpened}
                    subscriptionTemplates={templates.templates}
                />
            )}
        </Drawer>
    )
})
