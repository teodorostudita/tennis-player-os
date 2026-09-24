export const TENNISTALKER_COMPANION = Object.freeze({
  expectedMajor: 1,
  currentVersion: '1.0.0',
  chromeWebStoreUrl: '',
  setupPath: 'companion.html',
  downloadPath: 'downloads/Tennis_Player_OS_Companion_v1.0.0.zip',
});

export function appAssetUrl(path) {
  const pageUrl = String(location.href || '').split('#')[0];
  const base = new URL('.', pageUrl);
  return new URL(path, base).href;
}

export function companionSetupUrl() {
  return TENNISTALKER_COMPANION.chromeWebStoreUrl
    || appAssetUrl(TENNISTALKER_COMPANION.setupPath);
}

export function companionDownloadUrl() {
  return appAssetUrl(TENNISTALKER_COMPANION.downloadPath);
}
