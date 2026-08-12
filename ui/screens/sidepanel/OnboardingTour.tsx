import { SETTING_KEYS } from '../../../shared/constants';
import { GuidedTour, type TourStep } from '../../components/GuidedTour';
import { persist } from '../../stores/persisted-store';
import { setUi, ui } from '../../stores/ui-store';

const STEPS: [TourStep, TourStep, TourStep] = [
  {
    title: 'Welcome to Vizquo',
    body: 'A design-intelligence layer for the web: inspect anything, understand everything, build faster. Everything runs locally — nothing leaves the browser.',
    placement: 'center',
  },
  {
    title: 'Inspect any page',
    body: 'Open Inspect to connect to the current tab. The element inspector with CSS source tracing lands in Phase 2 — the pipeline is already live.',
    targetId: 'vq-nav',
    placement: 'below',
  },
  {
    title: 'Command palette',
    body: 'Press Ctrl/⌘ K to run any command — switch themes, jump between panels, check the connection, and more.',
    targetId: 'vq-palette-btn',
    placement: 'below',
  },
];

export function OnboardingTour() {
  function finish() {
    persist(SETTING_KEYS.onboardingCompleted, 'completed');
    setUi('onboarding', { visible: false, step: 0, done: true });
  }

  function advance() {
    if (ui.onboarding.step >= STEPS.length - 1) {
      finish();
    } else {
      setUi('onboarding', 'step', ui.onboarding.step + 1);
    }
  }

  return (
    <GuidedTour
      steps={STEPS}
      visible={ui.onboarding.visible}
      step={ui.onboarding.step}
      done={ui.onboarding.done}
      label="Tour"
      onClose={finish}
      onAdvance={advance}
    />
  );
}
