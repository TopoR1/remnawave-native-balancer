import { RemnawaveSettings } from '@prisma/client';

import {
    TBrandingSettings,
    TOauth2Settings,
    TPasswordAuthSettings,
    TRemnawavePasskeySettings,
} from '@libs/contracts/models';

export class RemnawaveSettingsEntity implements RemnawaveSettings {
    public id: number;
    public passkeySettings: TRemnawavePasskeySettings;
    public oauth2Settings: TOauth2Settings;
    public passwordSettings: TPasswordAuthSettings;
    public brandingSettings: TBrandingSettings;
    public hostBalancerGlobalEnabled: boolean;
    public hostBalancerEnvEnabled?: boolean;
    public hostBalancerSummary?: {
        enabledHosts: number;
        activeTargets: number;
        warnings: number;
        errors: number;
    };

    constructor(
        remnawaveSettings: Partial<RemnawaveSettings> & {
            hostBalancerGlobalEnabled?: boolean;
            hostBalancerEnvEnabled?: boolean;
            hostBalancerSummary?: {
                enabledHosts: number;
                activeTargets: number;
                warnings: number;
                errors: number;
            };
        },
    ) {
        Object.assign(this, remnawaveSettings);
        this.hostBalancerGlobalEnabled = remnawaveSettings.hostBalancerGlobalEnabled ?? true;
        return this;
    }
}
