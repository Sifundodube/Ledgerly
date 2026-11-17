import type { UploadResult } from './api';
import { apiBaseUrl, getAccessToken, refreshAccessToken } from './tokenStore';
import { ApiError } from './api';

export function uploadCsv(
  fileOrUri: any,
  filename: string,
  onProgress: (progress: number) => void
): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const send = (token: string | null, retried: boolean): void => {
      const form = new FormData();

      // Fix for Web Browser vs Mobile App
      if (typeof fileOrUri === 'string') {
        // Mobile approach
        form.append('file', {
          uri: fileOrUri,
          name: filename,
          type: 'text/csv',
        } as unknown as Blob);
      } else {
        // Web approach (fileOrUri is a File object)
        form.append('file', fileOrUri, filename);
      }

      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${apiBaseUrl()}/api/uploads`);
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.timeout = 90_000;

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && event.total > 0)
          onProgress(
            Math.min(99, Math.round((event.loaded / event.total) * 100))
          );
      };

      xhr.onload = () => {
        if (xhr.status === 401 && !retried) {
          void refreshAccessToken().then((renewed) => {
            if (renewed) send(renewed, true);
            else
              reject(
                new ApiError(401, 'Your session expired. Please sign in again.')
              );
          });
          return;
        }
        let body: unknown;
        try {
          body = JSON.parse(xhr.responseText);
        } catch {
          body = undefined;
        }
        if (xhr.status < 200 || xhr.status >= 300) {
          const message =
            body && typeof body === 'object' && 'error' in body
              ? String(body.error)
              : `Upload failed (${xhr.status})`;
          reject(new ApiError(xhr.status, message, body));
          return;
        }
        onProgress(100);
        resolve(body as UploadResult);
      };
      xhr.onerror = () =>
        reject(
          new Error(
            'Upload could not reach Ledgerly. Check your network and API URL.'
          )
        );
      xhr.ontimeout = () =>
        reject(new Error('Upload timed out. Check your connection and retry.'));
      xhr.send(form);
    };
    try {
      send(getAccessToken(), false);
    } catch (error) {
      reject(error);
    }
  });
}
