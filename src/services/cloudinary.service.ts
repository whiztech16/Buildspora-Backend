import { v2 as cloudinary } from 'cloudinary';
import { env } from '../env';

cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key: env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET,
});

export const uploadImage = async (fileBuffer: Buffer, folder: string = 'buildspora'): Promise<string> => {
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

export default cloudinary;
