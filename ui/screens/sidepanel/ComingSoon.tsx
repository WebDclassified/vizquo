import { Badge } from '../../components/Badge';

interface ComingSoonProps {
  phase: string;
  title: string;
  description: string;
  features: string[];
}

/**
 * Quality-bar rule: never fake a shipped capability. Panels that belong to a
 * later phase show this labeled gap instead of dead controls.
 */
export function ComingSoon(props: ComingSoonProps) {
  return (
    <div class="flex flex-col gap-3 p-4">
      <Badge tone="accent">Phase {props.phase}</Badge>
      <h1 class="text-[15px] font-semibold text-[var(--vq-fg)]">{props.title}</h1>
      <p class="text-[12.5px] leading-relaxed text-[var(--vq-fg-muted)]">{props.description}</p>
      <ul class="flex flex-col gap-1.5">
        <For each={props.features}>
          {(feature) => (
            <li class="flex items-start gap-2 text-[12.5px] text-[var(--vq-fg)]">
              <span
                class="mt-1.5 size-1 shrink-0 rounded-full bg-[var(--vq-accent)]"
                aria-hidden="true"
              />
              {feature}
            </li>
          )}
        </For>
      </ul>
      <p class="mt-1 border-t border-[var(--vq-border)] pt-3 text-[11px] text-[var(--vq-fg-subtle)]">
        This panel ships with its phase — nothing here is a placeholder, it's the next build
        increment.
      </p>
    </div>
  );
}
