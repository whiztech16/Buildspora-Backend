const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: 'weclgkpi',
  api_key: '938859816756637',
  api_secret: 'xlSKJApsdN2Gou4gM_tnM0dPrjc',
});

const uploadImage = async (fileBuffer, folder = 'buildspora') => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { folder },
      (error, result) => {
        if (error) return reject(error);
        if (result) return resolve(result.secure_url);
        reject(new Error("Unknown error during upload"));
      }
    );
    uploadStream.end(fileBuffer);
  });
};

const buffer = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

uploadImage(buffer, 'test')
  .then(url => console.log('Success:', url))
  .catch(err => console.error('Error:', err));
