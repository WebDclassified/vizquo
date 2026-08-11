import type { ConfidenceLevel } from '../../shared/types';
import { Badge, type BadgeTone } from './Badge';

const CONFIDENCE_META: Record<ConfidenceLevel, { label: string; tone: BadgeTone }> = {
  detected: { label: 'Detected', tone: 'success' },
  derived: { label: 'Derived', tone: 'info' },
  inferred: { label: 'Inferred', tone: 'warning' },
  'ai-generated': { label: 'AI Generated', tone: 'accent' },
};

interface ConfidenceBadgeProps {
  level: ConfidenceLevel;
  score?: number;
  class?: string;
}

/** Product law #2: every non-directly-observed value is tagged with its level. */
export function ConfidenceBadge(props: ConfidenceBadgeProps) {
  const meta = CONFIDENCE_META[props.level];
  const score = props.score != null ? Math.round(props.score * 100) : null;
  return (
    <Badge
      tone={meta.tone}
      class={props.class}
      title={`${meta.label}${score != null ? ` · ${score}% confidence` : ''}`}
    >
      {meta.label}
      {score != null && <span class="opacity-70">{score}%</span>}
    </Badge>
  );
}
