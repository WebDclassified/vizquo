/**
 * Post-update highlight tour — launched from the What's New dialog.
 *
 * Unlike the first-run onboarding (which introduces the panels), this tour
 * points at the fixes and improvements that shipped in the update: the
 * always-ready context menu, the reliable connection handoff, and the cache
 * that survives clock skew. Steps stay UI-anchored so they work in every
 * panel layout.
 */
import { GuidedTour, type TourStep } from '../../components/GuidedTour';
import { closeWhatsNewTour, setUi, ui } from '../../stores/ui-store';

const STEPS: [TourStep, TourStep, TourStep] = [
  {
    title: 'Inspect from anywhere',
    body: 'Right-click any element on a page and pick "Inspect with Vizquo" — it now works on every page, even before inspect mode is on. No more duplicate-menu errors.',
    placement: 'center',
  },
  {
    title: 'Rock-solid connection',
    body: 'Granting access then inspecting no longer hits "Could not establish connection". The handoff is reliable even right after the browser restarts.',
    targetId: 'vq-nav',
    placement: 'below',
  },
  {
    title: 'Your work, safe',
    body: 'Scans and library entries are saved with clock-skew-proof ordering — nothing gets wrongly evicted, even if your system clock jumps.',
    targetId: 'vq-palette-btn',
    placement: 'below',
  },
];

export function WhatsNewTour() {
  function finish() {
    closeWhatsNewTour();
  }

  function advance() {
    if (ui.whatsNewTour.step >= STEPS.length - 1) {
      finish();
    } else {
      setUi('whatsNewTour', 'step', ui.whatsNewTour.step + 1);
    }
  }

  return (
    <GuidedTour
      steps={STEPS}
      visible={ui.whatsNewTour.visible}
      step={ui.whatsNewTour.step}
      done={ui.whatsNewTour.done}
      label="What's new"
      onClose={finish}
      onAdvance={advance}
    />
  );
}
