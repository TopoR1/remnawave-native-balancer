import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const file = resolve(root, 'src/shared/ui/forms/hosts/base-host-form/host-balancing-form.tsx')
const source = readFileSync(file, 'utf8')

const allowedLiteralPatterns = [
    /^@/,
    /^\./,
    /^\//,
    /^#[A-Za-z0-9]/,
    /^base-host-form\./,
    /^api\/host-balancers\//,
    /^[A-Z0-9_/-]+$/,
    /^[a-z0-9_.:/-]+$/,
    /^[0-9a-f{}[\]().+*^$|\\?=-]+$/i,
    /^(ACTIVE|DRAINING|DISABLED|DEAD)$/,
    /^(LEAST_ASSIGNED|WEIGHTED|RANDOM|PRIORITY_FAILOVER|LEAST_TRAFFIC|WEIGHTED_LEAST_TRAFFIC)$/,
    /^(HIDE_HOST|ORIGINAL_HOST|KEEP_LAST_IF_POSSIBLE|CURRENT_PERIOD|LAST_24H|LAST_6H|LAST_1H)$/,
    /^(teal|yellow|gray|red|dimmed|light|subtle|soft|xs|sm|md)$/,
    /^(center|space-between|flex-start|nowrap)$/,
    /^Native Host Balancer UI$/,
    /^Traffic data missing, fallback strategy used\.$/,
    /^Host balancer settings do not exist\.$/,
    /^No eligible target selected\.$/,
    /^Selected target by \([A-Z_]\+\)\.\$$/,
    /^target (disabled|draining|node not found|node disabled|node disconnected|node lacks required inbound)$/,
    /^target status [A-Z_]+$/,
    /^node disconnected$/,
    /^overrideAddress differs from selected node address$/,
    /^address-only target: traffic\/status checks unavailable$/,
    /^target status \([A-Z_]\+\)\$$/
]

const lines = source.split('\n')
const findings = []
const stringLiteralPattern = /(['"`])((?:\\.|(?!\1).)*[A-Za-z][\sA-Za-z.,:/-]*(?:\\.|(?!\1).)*)\1/g

for (const [index, line] of lines.entries()) {
    if (/^\s*import\s/.test(line)) continue

    for (const match of line.matchAll(stringLiteralPattern)) {
        const value = match[2]

        if (
            value.includes('${') ||
            line.includes('t(') ||
            line.includes('import(') ||
            line.includes('match(') ||
            line.includes('diagnosticKeys') ||
            allowedLiteralPatterns.some((pattern) => pattern.test(value))
        ) {
            continue
        }

        findings.push(`${index + 1}: ${value}`)
    }
}

if (findings.length > 0) {
    console.log('Potential hardcoded English in host-balancing-form.tsx:')
    console.log(findings.join('\n'))
    process.exitCode = 1
} else {
    console.log('No suspicious hardcoded English found in host-balancing-form.tsx.')
}
