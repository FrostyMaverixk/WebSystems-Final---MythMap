import { CLOUDINARY_CONFIG, isCloudinaryConfigured } from '../config/appConfig.js';
import { isLocalDemoMode } from './firebase.js';

export const ALLOWED_IMAGE_TYPES = Object.freeze([
  'image/png',
  'image/jpeg',
  'image/webp',
]);

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

export function isImageUploadEnabled() {
  return isCloudinaryConfigured || isLocalDemoMode;
}

export function validateMythImage(file) {
  if (!file) {
    return { valid: false, error: 'Please choose an image file.' };
  }
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return {
      valid: false,
      error: 'Only PNG, JPEG, and WebP images are allowed (SVG and other file types are blocked).',
    };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    return {
      valid: false,
      error: `Image is too large (${mb} MB). Maximum allowed size is 5 MB.`,
    };
  }
  return { valid: true };
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read the selected image file.'));
    reader.readAsDataURL(file);
  });
}

async function localPreviewUpload(file, { onProgress, signal } = {}) {
  if (signal?.aborted) throw new DOMException('Upload cancelled.', 'AbortError');
  onProgress?.(25);
  const rawUrl = await readAsDataUrl(file);
  if (signal?.aborted) throw new DOMException('Upload cancelled.', 'AbortError');
  onProgress?.(70);

  // Downscale oversized images for localStorage demo persistence if browser canvas is available.
  if (typeof document !== 'undefined' && typeof Image !== 'undefined') {
    try {
      const resized = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          const maxDim = 960;
          const scale = Math.min(1, maxDim / Math.max(img.width || 1, img.height || 1));
          const width = Math.max(1, Math.round(img.width * scale));
          const height = Math.max(1, Math.round(img.height * scale));
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(rawUrl);
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          const outType = file.type === 'image/png' ? 'image/png' : 'image/webp';
          resolve(canvas.toDataURL(outType, 0.85));
        };
        img.onerror = () => reject(new Error('Invalid image data.'));
        img.src = rawUrl;
      });
      if (signal?.aborted) throw new DOMException('Upload cancelled.', 'AbortError');
      onProgress?.(100);
      return { imageUrl: resized };
    } catch {
      // Fallback to raw data URL if canvas resize fails.
    }
  }

  onProgress?.(100);
  return { imageUrl: rawUrl };
}

/**
 * Isolated upload adapter (Cloudinary Unsigned Upload + Local Demo fallback).
 * Switching image providers later (e.g. Firebase Storage) only requires editing this file.
 */
export function uploadMythImage(file, { onProgress, signal } = {}) {
  const check = validateMythImage(file);
  if (!check.valid) {
    return Promise.reject(new Error(check.error));
  }
  if (!isCloudinaryConfigured) {
    if (isLocalDemoMode) {
      return localPreviewUpload(file, { onProgress, signal });
    }
    return Promise.reject(
      new Error('Image uploads are not configured. Set VITE_CLOUDINARY_CLOUD_NAME and VITE_CLOUDINARY_UPLOAD_PRESET.')
    );
  }

  const endpoint = `https://api.cloudinary.com/v1_1/${encodeURIComponent(CLOUDINARY_CONFIG.cloudName)}/image/upload`;
  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', CLOUDINARY_CONFIG.uploadPreset);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', endpoint);
    xhr.timeout = 30000;

    const handleAbort = () => {
      xhr.abort();
      reject(new DOMException('Upload cancelled.', 'AbortError'));
    };
    if (signal) {
      if (signal.aborted) {
        handleAbort();
        return;
      }
      signal.addEventListener('abort', handleAbort, { once: true });
    }

    const cleanup = () => {
      signal?.removeEventListener('abort', handleAbort);
    };

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && typeof onProgress === 'function') {
        const percent = Math.min(100, Math.round((event.loaded / event.total) * 100));
        onProgress(percent);
      }
    };

    xhr.onerror = () => {
      cleanup();
      reject(new Error('Network error while uploading image. Please check your connection and try again.'));
    };

    xhr.ontimeout = () => {
      cleanup();
      reject(new Error('Image upload timed out. Please try a smaller file or try again.'));
    };

    xhr.onload = () => {
      cleanup();
      let data = null;
      try {
        data = JSON.parse(xhr.responseText || '{}');
      } catch {
        reject(new Error('Unexpected response from image upload service.'));
        return;
      }

      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(data?.error?.message || `Image upload failed (${xhr.status}).`));
        return;
      }

      const secureUrl = typeof data?.secure_url === 'string' ? data.secure_url.trim() : '';
      if (!secureUrl.startsWith('https://') || secureUrl.length > 500) {
        reject(new Error('Image service returned an invalid URL.'));
        return;
      }

      if (typeof onProgress === 'function') onProgress(100);
      resolve({ imageUrl: secureUrl });
    };

    xhr.send(formData);
  });
}
