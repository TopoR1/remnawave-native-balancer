import { z } from 'zod';

import { PasswordAuthSettingsSchema } from './password-auth-settings.schema';
import { BrandingSettingsSchema } from './branding-settings.schema';
import { PasskeySettingsSchema } from './passkey-settings.schema';
import { Oauth2SettingsSchema } from './oauth2-settings.schema';

export const RemnawaveSettingsSchema = z.object({
    passkeySettings: z.nullable(PasskeySettingsSchema),
    oauth2Settings: z.nullable(Oauth2SettingsSchema),
    passwordSettings: z.nullable(PasswordAuthSettingsSchema),
    brandingSettings: z.nullable(BrandingSettingsSchema),
    hostBalancerGlobalEnabled: z.boolean(),
    hostBalancerEnvEnabled: z.boolean(),
    hostBalancerSummary: z
        .object({
            enabledHosts: z.number().int().nonnegative(),
            activeTargets: z.number().int().nonnegative(),
            warnings: z.number().int().nonnegative(),
            errors: z.number().int().nonnegative(),
        })
        .optional(),
});

export type TRemnawaveSettings = z.infer<typeof RemnawaveSettingsSchema>;
