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
export { refreshRegionAndWait, fetchFacetCountsAndWait, waitForRegionEvent } from './lifecycle.js';
export {
  coverageEnabled,
  recordCoverageTouch,
  recordRegionCoverageTouch,
  recordButtonCoverageTouch,
  type CoverageKind,
  type CoverageTouch,
  type CoverageRuntimeLocator,
  type RegionCoverageIdentity,
  type ButtonCoverageIdentity,
} from './coverage.js';
