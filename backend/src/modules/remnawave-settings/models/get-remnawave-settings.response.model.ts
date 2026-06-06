import {
    TBrandingSettings,
    TOauth2Settings,
    TPasswordAuthSettings,
    TRemnawavePasskeySettings,
} from '@libs/contracts/models';

import { RemnawaveSettingsEntity } from '../entities';

export class RemnawaveSettingsResponseModel {
    public passkeySettings: TRemnawavePasskeySettings;
    public oauth2Settings: TOauth2Settings;
    public passwordSettings: TPasswordAuthSettings;
    public brandingSettings: TBrandingSettings;
    public hostBalancerGlobalEnabled: boolean;
    public hostBalancerEnvEnabled: boolean;
    public hostBalancerSummary: {
        enabledHosts: number;
        activeTargets: number;
        warnings: number;
        errors: number;
    };

    constructor(entity: RemnawaveSettingsEntity) {
        this.passkeySettings = entity.passkeySettings;
        this.oauth2Settings = entity.oauth2Settings;
        this.passwordSettings = entity.passwordSettings;
        this.brandingSettings = entity.brandingSettings;
        this.hostBalancerGlobalEnabled = entity.hostBalancerGlobalEnabled;
        this.hostBalancerEnvEnabled = entity.hostBalancerEnvEnabled ?? false;
        this.hostBalancerSummary = entity.hostBalancerSummary ?? {
            enabledHosts: 0,
            activeTargets: 0,
            warnings: 0,
            errors: 0,
        };
    }
}
