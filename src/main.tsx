import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';

import App from './App.tsx';
import BrandNavigator from './components/BrandNavigator.tsx';
import PrivacyPolicy from './components/PrivacyPolicy.tsx';
import { ErrorBoundary } from './components/ErrorBoundary';
import { resolveRootView } from './services/navigation-routes';
import './index.css';

const rootView = resolveRootView(window.location.pathname, window.location.hash);
console.log('[routing] Resolved root view:', {
  rootView,
  pathname: window.location.pathname,
  hash: window.location.hash,
});
const RootApp = rootView === 'privacy-policy' ? PrivacyPolicy : (rootView === 'brand-navigator' ? BrandNavigator : App);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <RootApp />
    </ErrorBoundary>
  </StrictMode>,
);
