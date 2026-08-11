import '@unocss/reset/tailwind.css';
import 'virtual:uno.css';
import '@ui/theme.css';
import { App } from '@ui/screens/sidepanel/App';
import { render } from 'solid-js/web';

const root = document.getElementById('root');
if (root) {
  render(() => <App />, root);
}
