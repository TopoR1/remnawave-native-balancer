import type { DraftTarget } from './host-balancing-draft'
import type { TFunction } from 'i18next'

import { prettifyBytesUtil } from '../../../../utils/bytes/pretty-bytes/pretty-bytes.util.ts'

export function formatTargetAssignments(
    target: Pick<DraftTarget, 'assignments' | 'assignmentsCount'>,
    t: TFunction
) {
    if (typeof target.assignmentsCount === 'number') {
        return String(target.assignmentsCount)
    }
    if (typeof target.assignments === 'number') {
        return String(target.assignments)
    }

    return String(t('base-host-form.no-diagnostic-data'))
}

export function formatTargetTraffic(
    target: Pick<DraftTarget, 'formattedTraffic' | 'trafficBytes'>,
    t: TFunction
) {
    if (target.formattedTraffic) {
        return target.formattedTraffic
    }
    if (typeof target.trafficBytes === 'string') {
        return prettifyBytesUtil(target.trafficBytes)
    }

    return String(t('base-host-form.no-diagnostic-data'))
}
