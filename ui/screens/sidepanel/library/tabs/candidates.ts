/**
 * Shared candidate loading for the Compare and Reports tabs: every stored
 * inspection referenced by history, plus the live inspection from the store.
 * The live inspection is added by the tabs (it is not part of the library).
 */
import { createSignal, onMount } from 'solid-js';
import type { Inspection } from '../../../../../shared/types';
import { analysis } from '../../../../stores/analysis-store';
import { loadInspectionCandidates } from '../library-client';

export interface CandidateOption {
  id: string;
  label: string;
  inspection: Inspection;
}

/** Signal getter for history-backed candidates; loads once on mount. */
export function useHistoryCandidates(): () => CandidateOption[] {
  const [history, setHistory] = createSignal<CandidateOption[]>([]);
  onMount(() => {
    void loadInspectionCandidates().then(setHistory);
  });
  return history;
}

/** All pickable candidates: the live inspection first, then stored history. */
export function allCandidates(history: () => CandidateOption[]): () => CandidateOption[] {
  return () => {
    const list: CandidateOption[] = [];
    const live = analysis.inspection;
    if (live) {
      list.push({
        id: 'current',
        label: live.page.title || live.page.url || 'Current page',
        inspection: live,
      });
    }
    list.push(...history());
    return list;
  };
}
