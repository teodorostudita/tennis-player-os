import { isAppOwner } from '../cloud/accountAccess.js?v=1.2.6';

export const OWNER_RESOURCE_FILE_LIMIT_BYTES = 200 * 1024 * 1024;
export const NON_OWNER_RESOURCE_FILE_LIMIT_BYTES = 5 * 1024 * 1024;
export const RESOURCE_UPLOAD_PRIVILEGE_ERROR_CODE = 'TPOS_RESOURCE_UPLOAD_PRIVILEGE';

export function resourceFileLimitBytes() {
  return isAppOwner()
    ? OWNER_RESOURCE_FILE_LIMIT_BYTES
    : NON_OWNER_RESOURCE_FILE_LIMIT_BYTES;
}

export function canUploadResourceFileSize(size) {
  const bytes = Number(size || 0);
  return Number.isFinite(bytes)
    && bytes >= 0
    && bytes <= resourceFileLimitBytes();
}

export function resourceUploadPrivilegeMessage() {
  return 'Non hai i privilegi necessari per caricare file superiori a 5 MB. Puoi aggiungere un link o un video YouTube, oppure chiedere all’Owner di caricare il file.';
}

export function assertResourceFileUploadAllowed(size) {
  if (canUploadResourceFileSize(size)) return;

  const error = new Error(
    isAppOwner()
      ? 'Il file supera il limite massimo di 200 MB.'
      : resourceUploadPrivilegeMessage(),
  );

  error.code = isAppOwner()
    ? 'TPOS_RESOURCE_FILE_TOO_LARGE'
    : RESOURCE_UPLOAD_PRIVILEGE_ERROR_CODE;

  throw error;
}
