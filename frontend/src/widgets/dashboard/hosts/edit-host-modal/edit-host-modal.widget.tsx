import { UpdateHostCommand } from '@remnawave/backend-contract'
import { zodResolver } from 'mantine-form-zod-resolver'
import { notifications } from '@mantine/notifications'
import { type FormEvent, memo, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PiListChecks } from 'react-icons/pi'
import { modals } from '@mantine/modals'
import { useForm } from '@mantine/form'
import { Drawer } from '@mantine/core'
import consola from 'consola/browser'

import {
    HostBalancerTargetsValidation,
    QueryKeys,
    useCreateHost,
    useGetConfigProfiles,
    useGetInternalSquads,
    useGetHostBalancer,
    useGetNodes,
    useGetSubscriptionTemplates,
    useUpdateHost,
    useUpdateHostBalancer,
    useUpdateHostBalancerTargets,
    useValidateHostBalancerTargets
} from '@shared/api/hooks'
import { MODALS, useModalClose, useModalState } from '@entities/dashboard/modal-store'
import {
    DEFAULT_HOST_BALANCING_DRAFT,
    HostBalancingDraft,
    hostBalancerToDraft,
    sanitizeHostBalancingDraft,
    translateValidationReason
} from '@shared/ui/forms/hosts/base-host-form/host-balancing-form'
import { saveHostBalancingDraft } from '@shared/ui/forms/hosts/base-host-form/host-balancing-save-flow'
import { BaseOverlayHeader } from '@shared/ui/overlays/base-overlay-header'
import { BaseHostForm } from '@shared/ui/forms/hosts/base-host-form'
import { cloneString } from '@shared/utils/misc/clone-string'
import { queryClient } from '@shared/api'

const EMPTY_UUID = '00000000-0000-4000-8000-000000000000'

export const EditHostModalWidget = memo(() => {
    const { t } = useTranslation()

    const { isOpen, internalState: host } = useModalState(MODALS.EDIT_HOST_MODAL)
    const close = useModalClose(MODALS.EDIT_HOST_MODAL)

    const [advancedOpened, setAdvancedOpened] = useState(false)
    const [hostBalancingDraft, setHostBalancingDraft] = useState<HostBalancingDraft>(
        DEFAULT_HOST_BALANCING_DRAFT
    )
    const hydratedHostBalancerUuidRef = useRef<string | null>(null)
    const [hostBalancingValidation, setHostBalancingValidation] =
        useState<HostBalancerTargetsValidation | null>(null)

    const { data: configProfiles } = useGetConfigProfiles()
    const { data: nodes } = useGetNodes()
    const { data: templates } = useGetSubscriptionTemplates()
    const { data: internalSquads } = useGetInternalSquads()
    const { data: hostBalancer } = useGetHostBalancer({
        route: { hostUuid: host?.uuid ?? EMPTY_UUID },
        rQueryParams: {
            enabled: Boolean(host?.uuid && isOpen)
        }
    })

    const form = useForm<UpdateHostCommand.Request>({
        name: 'edit-host-form',
        mode: 'uncontrolled',
        validateInputOnBlur: true,
        onValuesChange: (values) => {
            if (typeof values.vlessRouteId === 'string' && values.vlessRouteId === '') {
                form.setFieldValue('vlessRouteId', null)
            }
        },
        validate: zodResolver(UpdateHostCommand.RequestSchema.omit({ uuid: true }))
    })

    const handleClose = () => {
        close()

        setTimeout(() => {
            form.reset()
            form.resetDirty()
            form.resetTouched()
            setHostBalancingDraft(DEFAULT_HOST_BALANCING_DRAFT)
            setHostBalancingValidation(null)
            hydratedHostBalancerUuidRef.current = null
            setAdvancedOpened(false)
        }, 200)
    }

    const { mutateAsync: updateHost, isPending: isUpdateHostPending } = useUpdateHost({
        mutationFns: {
            onSuccess: async () => {
                await queryClient.refetchQueries({
                    queryKey: QueryKeys.hosts.getAllTags.queryKey
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

    const { mutate: createHost } = useCreateHost({
        mutationFns: {
            onSuccess: async () => {
                handleClose()
                await queryClient.refetchQueries({
                    queryKey: QueryKeys.hosts.getAllTags.queryKey
                })
            }
        }
    })

    useEffect(() => {
        if (host && configProfiles) {
            let xHttpExtraParamsParsed: null | object | string
            let muxParamsParsed: null | object | string
            let sockoptParamsParsed: null | object | string
            let finalMaskParsed: null | object | string

            if (typeof host.xHttpExtraParams === 'object' && host.xHttpExtraParams !== null) {
                xHttpExtraParamsParsed = JSON.stringify(host.xHttpExtraParams, null, 2)
            } else {
                xHttpExtraParamsParsed = ''
            }

            if (typeof host.muxParams === 'object' && host.muxParams !== null) {
                muxParamsParsed = JSON.stringify(host.muxParams, null, 2)
            } else {
                muxParamsParsed = ''
            }

            if (typeof host.sockoptParams === 'object' && host.sockoptParams !== null) {
                sockoptParamsParsed = JSON.stringify(host.sockoptParams, null, 2)
            } else {
                sockoptParamsParsed = ''
            }

            if (typeof host.finalMask === 'object' && host.finalMask !== null) {
                finalMaskParsed = JSON.stringify(host.finalMask, null, 2)
            } else {
                finalMaskParsed = ''
            }

            form.setValues({
                remark: host.remark,
                address: host.address,
                port: host.port,
                securityLayer: host.securityLayer,
                isDisabled: !host.isDisabled,
                sni: host.sni ?? undefined,
                host: host.host ?? undefined,
                path: host.path ?? undefined,
                alpn: (host.alpn as UpdateHostCommand.Request['alpn']) ?? undefined,
                fingerprint:
                    (host.fingerprint as UpdateHostCommand.Request['fingerprint']) ?? undefined,
                inbound: {
                    configProfileUuid: host.inbound.configProfileUuid ?? '',
                    configProfileInboundUuid: host.inbound.configProfileInboundUuid ?? ''
                },
                serverDescription: host.serverDescription ?? undefined,
                xHttpExtraParams: xHttpExtraParamsParsed,
                muxParams: muxParamsParsed,
                sockoptParams: sockoptParamsParsed,
                finalMask: finalMaskParsed,
                tag: host.tag ?? undefined,
                isHidden: host.isHidden,
                overrideSniFromAddress: host.overrideSniFromAddress,
                keepSniBlank: host.keepSniBlank,
                vlessRouteId: host.vlessRouteId ?? undefined,
                allowInsecure: host.allowInsecure ?? undefined,
                shuffleHost: host.shuffleHost ?? undefined,
                mihomoX25519: host.mihomoX25519 ?? undefined,
                nodes: host.nodes ?? undefined,
                xrayJsonTemplateUuid: host.xrayJsonTemplateUuid ?? undefined,
                excludedInternalSquads: host.excludedInternalSquads ?? undefined,
                excludeFromSubscriptionTypes: host.excludeFromSubscriptionTypes ?? undefined
            })
        }
    }, [host, configProfiles])

    useEffect(() => {
        if (host) {
            setHostBalancingDraft((currentDraft) => {
                const isSameHost = hydratedHostBalancerUuidRef.current === host.uuid

                if (isSameHost && currentDraft.touched) {
                    return currentDraft
                }

                hydratedHostBalancerUuidRef.current = host.uuid

                return hostBalancerToDraft(hostBalancer ?? null)
            })
        }
    }, [host, hostBalancer])

    const saveHostBalancing = async (hostUuid: string) => {
        if (hostBalancingDraft.touched) {
            const { targets } = sanitizeHostBalancingDraft(hostBalancingDraft)
            const validation = await validateHostBalancerTargets({
                route: { hostUuid },
                variables: { targets }
            })
            setHostBalancingValidation(validation)

            const hasActiveInvalidTarget = validation.targets.some(
                (target, index) =>
                    target.severity === 'error' &&
                    targets[index]?.enabled !== false &&
                    targets[index]?.status === 'ACTIVE'
            )

            if (hasActiveInvalidTarget) {
                const errors = validation.targets.flatMap((target, index) => {
                    if (
                        target.severity !== 'error' ||
                        targets[index]?.enabled === false ||
                        targets[index]?.status !== 'ACTIVE'
                    ) {
                        return []
                    }

                    return target.reasons.map((reason) => translateValidationReason(reason, t))
                })

                notifications.show({
                    title: t('edit-host-modal.widget.error'),
                    message: `${t('base-host-form.cannot-save-active-invalid-targets')}\n${errors.join('\n')}\n${t('base-host-form.fix-or-disable-invalid-targets')}`,
                    color: 'red'
                })
                throw new Error('Host balancer targets validation failed')
            }
        }

        await saveHostBalancingDraft({
            draft: hostBalancingDraft,
            hostUuid,
            notifySuccess: () => {
                notifications.show({
                    title: t('common.success'),
                    message: t('base-host-form.balancer-settings-saved'),
                    color: 'teal'
                })
            },
            refetchSettings: async (refetchHostUuid) =>
                queryClient.refetchQueries({
                    queryKey: QueryKeys.hostBalancers.getSettings(refetchHostUuid).queryKey
                }),
            setDraft: setHostBalancingDraft,
            updateSettings: updateHostBalancer,
            updateTargets: updateHostBalancerTargets
        })
    }

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

    form.watch('allowInsecure', ({ value }) => {
        if (value === true) {
            modals.openConfirmModal({
                title: t('edit-host-modal.widget.are-you-sure'),
                children: t(
                    'edit-host-modal.widget.allowing-insecure-connections-can-lead-to-security-risks-we-do-not-recommend-enabling-this-option'
                ),
                centered: true,
                labels: {
                    confirm: t('edit-host-modal.widget.proceed'),
                    cancel: t('edit-host-modal.widget.cancel')
                },
                confirmProps: {
                    color: 'red'
                },
                onConfirm: () => {
                    form.setFieldValue('allowInsecure', true)
                },
                onCancel: () => {
                    form.setFieldValue('allowInsecure', false)
                }
            })
        }
    })

    const handleSubmit = async (event?: FormEvent<HTMLFormElement>) => {
        event?.preventDefault()

        if (!host) {
            return
        }

        const shouldUpdateHost = form.isDirty() && form.isTouched()
        const shouldSaveBalancing = hostBalancingDraft.touched

        if (!shouldUpdateHost && !shouldSaveBalancing) {
            return
        }

        if (shouldUpdateHost) {
            const validation = form.validate()
            if (validation.hasErrors) {
                return
            }
        }

        const values = form.getValues()

        let xHttpExtraParams
        let muxParams
        let sockoptParams
        let finalMask

        try {
            if (values.xHttpExtraParams === '') {
                xHttpExtraParams = null
            } else {
                xHttpExtraParams = JSON.parse(values.xHttpExtraParams as unknown as string)
            }
        } catch (error) {
            consola.error(error)
            xHttpExtraParams = null
            // silence
        }

        try {
            if (values.muxParams === '') {
                muxParams = null
            } else {
                muxParams = JSON.parse(values.muxParams as unknown as string)
            }
        } catch (error) {
            consola.error(error)
            muxParams = null
            // silence
        }

        try {
            if (values.sockoptParams === '') {
                sockoptParams = null
            } else {
                sockoptParams = JSON.parse(values.sockoptParams as unknown as string)
            }
        } catch (error) {
            consola.error(error)
            sockoptParams = null
            // silence
        }

        try {
            if (values.finalMask === '') {
                finalMask = null
            } else {
                finalMask = JSON.parse(values.finalMask as unknown as string)
            }
        } catch (error) {
            consola.error(error)
            finalMask = null
            // silence
        }

        try {
            if (shouldUpdateHost) {
                await updateHost({
                    variables: {
                        ...values,
                        isDisabled: !values.isDisabled,
                        uuid: host.uuid,
                        xHttpExtraParams,
                        muxParams,
                        sockoptParams,
                        finalMask,
                        tag: values.tag === '' ? null : values.tag
                    }
                })
            }
            if (shouldSaveBalancing) {
                await saveHostBalancing(host.uuid)
            }
            handleClose()
            await queryClient.refetchQueries({
                queryKey: QueryKeys.hosts.getAllTags.queryKey
            })
        } catch {
            // handled by mutation hooks
        }
    }

    const handleCloneHost = () => {
        if (!host) {
            return
        }

        if (!host.inbound.configProfileInboundUuid || !host.inbound.configProfileUuid) {
            notifications.show({
                title: t('edit-host-modal.widget.error'),
                message: t('edit-host-modal.widget.dangling-host-cannot-be-cloned'),
                color: 'red'
            })

            return
        }

        createHost({
            variables: {
                ...host,
                remark: cloneString(host.remark),
                port: host.port,

                isDisabled: true,
                path: host.path ?? undefined,
                sni: host.sni ?? undefined,
                host: host.host ?? undefined,
                alpn: (host.alpn as UpdateHostCommand.Request['alpn']) ?? undefined,
                xHttpExtraParams: host.xHttpExtraParams ?? undefined,
                muxParams: host.muxParams ?? undefined,
                fingerprint:
                    (host.fingerprint as UpdateHostCommand.Request['fingerprint']) ?? undefined,
                inbound: {
                    configProfileUuid: host.inbound.configProfileUuid,
                    configProfileInboundUuid: host.inbound.configProfileInboundUuid
                },
                serverDescription: host.serverDescription ?? undefined,
                sockoptParams: host.sockoptParams ?? undefined,
                tag: host.tag ?? undefined,
                overrideSniFromAddress: host.overrideSniFromAddress,
                keepSniBlank: host.keepSniBlank,
                vlessRouteId: host.vlessRouteId ?? undefined,
                allowInsecure: host.allowInsecure ?? undefined,
                nodes: host.nodes ?? undefined,
                xrayJsonTemplateUuid: host.xrayJsonTemplateUuid ?? undefined,
                excludedInternalSquads: host.excludedInternalSquads ?? undefined,
                finalMask: host.finalMask ?? undefined
            }
        })
    }

    return (
        <Drawer
            keepMounted={false}
            onClose={handleClose}
            opened={isOpen}
            overlayProps={{ backgroundOpacity: 0.6, blur: 0 }}
            padding="lg"
            position="right"
            size="68.75rem"
            title={
                <BaseOverlayHeader
                    iconColor="teal"
                    IconComponent={PiListChecks}
                    iconVariant="soft"
                    subtitle={host?.uuid}
                    title={t('edit-host-modal.widget.edit-host')}
                    withCopy={true}
                />
            }
        >
            {host && (
                <BaseHostForm
                    advancedOpened={advancedOpened}
                    configProfiles={configProfiles?.configProfiles ?? []}
                    form={form}
                    hostBalancingDraft={hostBalancingDraft}
                    hostUuid={host.uuid}
                    handleCloneHost={handleCloneHost}
                    handleSubmit={handleSubmit}
                    internalSquads={internalSquads?.internalSquads ?? []}
                    isSubmitting={
                        isUpdateHostPending ||
                        isUpdateHostBalancerPending ||
                        isUpdateHostBalancerTargetsPending ||
                        isValidateHostBalancerTargetsPending
                    }
                    nodes={nodes!}
                    onHostBalancingDraftChange={setHostBalancingDraft}
                    onHostBalancingValidationChange={setHostBalancingValidation}
                    setAdvancedOpened={setAdvancedOpened}
                    subscriptionTemplates={templates?.templates ?? []}
                />
            )}
        </Drawer>
    )
})
