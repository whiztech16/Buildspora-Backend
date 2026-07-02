const cloudinary = require('cloudinary').v2;
const fs = require('fs');

cloudinary.config({
  cloud_name: 'weclgkpi',
  api_key: '938859816756637',
  api_secret: 'xlSKJApsdN2Gou4gM_tnM0dPrjc',
});

cloudinary.uploader.upload('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', { folder: 'test' }, (error, result) => {
  if (error) {
    console.error("Cloudinary error:", error);
  } else {
    console.log("Upload successful!", result.secure_url);
  }
});
