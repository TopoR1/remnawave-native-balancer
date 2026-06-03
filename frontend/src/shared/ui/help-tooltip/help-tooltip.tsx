import { ActionIcon, HoverCard, Stack, Text } from '@mantine/core'
import { HiQuestionMarkCircle } from 'react-icons/hi'

type HelpTooltipProps = {
    description: string
    label: string
}

export function HelpTooltip({ description, label }: HelpTooltipProps) {
    return (
        <HoverCard
            closeDelay={150}
            openDelay={150}
            position="top-start"
            shadow="md"
            width={300}
            withArrow
        >
            <HoverCard.Target>
                <ActionIcon aria-label={label} color="gray" size="xs" variant="subtle">
                    <HiQuestionMarkCircle size={16} />
                </ActionIcon>
            </HoverCard.Target>
            <HoverCard.Dropdown>
                <Stack gap={4}>
                    <Text fw={600} size="sm">
                        {label}
                    </Text>
                    <Text c="dimmed" size="sm">
                        {description}
                    </Text>
                </Stack>
            </HoverCard.Dropdown>
        </HoverCard>
    )
}
