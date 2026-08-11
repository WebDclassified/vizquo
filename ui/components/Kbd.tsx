import type { ParentProps } from 'solid-js';

export function Kbd(props: ParentProps<{ class?: string }>) {
  return <kbd class={`vq-kbd ${props.class ?? ''}`}>{props.children}</kbd>;
}
