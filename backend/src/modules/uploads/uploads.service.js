const crypto = require('crypto');
const AppError = require('../../core/errors/AppError');
const ErrorCodes = require('../../core/errors/errorCodes');

const EVENT_IMAGE_FOLDERS = {
  thumbnail: 'eventhub/events/thumbnails',
  banner: 'eventhub/events/banners',
};

function requireCloudinaryConfig() {
  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;

  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
    throw new AppError('Cloudinary is not configured', 500, ErrorCodes.INTERNAL_SERVER_ERROR);
  }

  return { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET };
}

function signUploadParams(params, apiSecret) {
  const payload = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');

  return crypto.createHash('sha1').update(`${payload}${apiSecret}`).digest('hex');
}

class UploadsService {
  createEventImageSignature(type = 'banner') {
    const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } =
      requireCloudinaryConfig();
    const timestamp = Math.floor(Date.now() / 1000);
    const folder = EVENT_IMAGE_FOLDERS[type] || EVENT_IMAGE_FOLDERS.banner;
    const params = {
      folder,
      timestamp,
    };

    return {
      cloud_name: CLOUDINARY_CLOUD_NAME,
      upload_url: `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
      fields: {
        ...params,
        api_key: CLOUDINARY_API_KEY,
        signature: signUploadParams(params, CLOUDINARY_API_SECRET),
      },
    };
  }

  createAvatarSignature() {
    const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } =
      requireCloudinaryConfig();
    const timestamp = Math.floor(Date.now() / 1000);
    const folder = 'eventhub/users/avatar';
    const params = {
      folder,
      timestamp,
    };

    return {
      cloud_name: CLOUDINARY_CLOUD_NAME,
      upload_url: `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
      fields: {
        ...params,
        api_key: CLOUDINARY_API_KEY,
        signature: signUploadParams(params, CLOUDINARY_API_SECRET),
      },
    };
  }

  createOrganizerAvatarSignature() {
    const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } =
      requireCloudinaryConfig();
    const timestamp = Math.floor(Date.now() / 1000);
    const folder = 'eventhub/organizers/avatar';
    const params = {
      folder,
      timestamp,
    };

    return {
      cloud_name: CLOUDINARY_CLOUD_NAME,
      upload_url: `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
      fields: {
        ...params,
        api_key: CLOUDINARY_API_KEY,
        signature: signUploadParams(params, CLOUDINARY_API_SECRET),
      },
    };
  }

  createPolicyDocumentSignature() {
    const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } =
      requireCloudinaryConfig();
    const timestamp = Math.floor(Date.now() / 1000);
    const folder = 'eventhub/platform-policies';
    const params = {
      folder,
      timestamp,
    };

    return {
      cloud_name: CLOUDINARY_CLOUD_NAME,
      upload_url: `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/raw/upload`,
      fields: {
        ...params,
        api_key: CLOUDINARY_API_KEY,
        signature: signUploadParams(params, CLOUDINARY_API_SECRET),
      },
    };
  }

  createPolicyPdfSignature() {
    return this.createPolicyDocumentSignature();
  }
}

module.exports = new UploadsService();
