const CLOUD_NAME = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME;
const UPLOAD_PRESET = process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_RETRIES = 2;

function getUploadUrl() {
  return `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`;
}

function guessMimeType(uri, blobType) {
  if (blobType && blobType !== '' && blobType !== 'application/octet-stream') return blobType;
  const ext = uri.split('?')[0].split('.').pop().toLowerCase();
  const map = { png: 'image/png', gif: 'image/gif', webp: 'image/webp', heic: 'image/heic' };
  return map[ext] || 'image/jpeg';
}

async function attemptUpload(localUri, folder, onProgress) {
  // Fetch blob to validate size and detect MIME type
  const res = await fetch(localUri);
  if (!res.ok) throw new Error(`Could not read image file (HTTP ${res.status})`);
  const blob = await res.blob();

  if (blob.size > MAX_IMAGE_BYTES) {
    throw new Error(
      `Image is ${(blob.size / 1024 / 1024).toFixed(1)} MB — maximum allowed is 10 MB.`
    );
  }

  const mimeType = guessMimeType(localUri, blob.type);
  const filename = localUri.split('/').pop().split('?')[0] || 'photo.jpg';

  const formData = new FormData();
  // React Native requires { uri, type, name } for native file upload via FormData
  formData.append('file', { uri: localUri, type: mimeType, name: filename });
  formData.append('upload_preset', UPLOAD_PRESET);
  if (folder) formData.append('folder', folder);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    if (onProgress && xhr.upload) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          if (data.secure_url) {
            resolve(data.secure_url);
          } else {
            reject(new Error(data.error?.message || 'Upload succeeded but no URL was returned.'));
          }
        } catch {
          reject(new Error('Failed to parse Cloudinary response.'));
        }
      } else {
        let msg = `Upload failed (HTTP ${xhr.status})`;
        try { msg = JSON.parse(xhr.responseText).error?.message || msg; } catch {}
        reject(new Error(msg));
      }
    };

    xhr.onerror = () => reject(new Error('Network error during upload.'));
    xhr.ontimeout = () => reject(new Error('Upload timed out after 60 seconds.'));

    xhr.open('POST', getUploadUrl());
    xhr.timeout = 60000;
    xhr.send(formData);
  });
}

/**
 * Upload a local image URI to Cloudinary.
 *
 * @param {string} localUri  - Local file URI from ImagePicker / camera
 * @param {string} storagePath - Logical path (used to derive the Cloudinary folder)
 * @param {object} [opts]
 * @param {(pct: number) => void} [opts.onProgress] - Optional 0–100 progress callback
 * @returns {Promise<string>} Cloudinary secure_url
 */
export async function uploadImage(localUri, storagePath, { onProgress } = {}) {
  if (!localUri) throw new Error('Image URI is required');
  if (!CLOUD_NAME || !UPLOAD_PRESET) {
    throw new Error(
      'Cloudinary is not configured. ' +
      'Set EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME and EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET in .env.'
    );
  }

  // Derive Cloudinary folder from the storage path (everything except the last segment)
  const parts = storagePath ? storagePath.split('/') : [];
  const folder = parts.length > 1 ? parts.slice(0, -1).join('/') : (parts[0] || 'uploads');

  let lastError;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await attemptUpload(localUri, folder, onProgress);
    } catch (err) {
      lastError = err;
      if (attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
  }
  throw lastError;
}

/**
 * Returns true when the URI is a local file that hasn't been uploaded yet.
 * Accepts plain strings or { uri: string } objects from ImagePicker.
 */
export function needsUpload(uri) {
  const str = typeof uri === 'object' && uri !== null ? (uri.uri || '') : (uri || '');
  if (!str) return false;
  return !str.startsWith('https://') && !str.startsWith('http://');
}

/**
 * Extract the plain string URI from an ImagePicker result or a plain string.
 */
export function getLocalUri(uri) {
  if (!uri) return null;
  return typeof uri === 'object' ? (uri.uri || null) : uri;
}

/**
 * Logical path builders — these determine the Cloudinary folder structure.
 */
export const storagePaths = {
  donationPhoto: (donationId) => `donations/${donationId}/photo_${Date.now()}`,
  profilePic:    (userId)     => `profilePics/${userId}`,
  assessmentImage: (sessionId, index) => `foodQualityAssessments/${sessionId}/${index}`,
};
