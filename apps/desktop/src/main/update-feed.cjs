const GCS_BUCKET = 'shekinah-schoolmatrix-assets';

const UPDATE_FEEDS = {
  remote: `https://storage.googleapis.com/${GCS_BUCKET}/installers/remote`,
  server: `https://storage.googleapis.com/${GCS_BUCKET}/installers/server`,
};

const PUBLIC_API_BASE_URL = 'http://34.118.138.96';
const LOCAL_API_BASE_URL = 'http://127.0.0.1:3000';

module.exports = {
  GCS_BUCKET,
  UPDATE_FEEDS,
  PUBLIC_API_BASE_URL,
  LOCAL_API_BASE_URL,
};
