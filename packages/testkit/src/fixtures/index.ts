export { armConsoleGuard } from './console-guard.js';
export { apexPageUrl, gotoApexPage, normalizeTitle } from './session.js';
export {
  assessNavigationSafety,
  navigateViaUiPath,
  gotoApexPageAuto,
  type NavigationMode,
  type NavigationSafetyAssessment,
} from './navigation.js';
export { login, loginAndSaveState, type ApexCredentials, type LoginOptions } from './auth.js';
export { callRegionMethodAndWaitForEvent, waitForRegionEvent } from './lifecycle.js';
export {
  coverageEnabled,
  recordCoverageTouch,
  recordButtonCoverageTouch,
  type CoverageKind,
  type CoverageTouch,
  type CoverageRuntimeLocator,
  type ButtonCoverageIdentity,
} from './coverage.js';
