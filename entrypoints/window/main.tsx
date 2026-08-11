/**
 * Detachable window (Phase 8) — the same side-panel App rendered in a popup
 * window, opened from the inspector toolbar ("detach"). Reusing <App /> keeps
 * one code path for connection, state, and messaging; the window simply has
 * more room for the inspector's split panes.
 */
import '@unocss/reset/tailwind.css';
import 'virtual:uno.css';
import '@ui/theme.css';
import { App } from '@ui/screens/sidepanel/App';
import { render } from 'solid-js/web';

const root = document.getElementById('root');
if (root) {
  render(() => <App />, root);
}
