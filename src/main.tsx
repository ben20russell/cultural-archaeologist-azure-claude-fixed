import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';

import App from './App.tsx';
import BrandNavigator from './components/BrandNavigator.tsx';
import PrivacyPolicy from './components/PrivacyPolicy.tsx';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';

const isPrivacyPolicyRoute = window.location.pathname === '/privacy-policy';
const isBrandNavigatorRoute = window.location.pathname === '/brand-navigator';
const RootApp = isPrivacyPolicyRoute ? PrivacyPolicy : (isBrandNavigatorRoute ? BrandNavigator : App);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <RootApp />
    </ErrorBoundary>
  </StrictMode>,
);
