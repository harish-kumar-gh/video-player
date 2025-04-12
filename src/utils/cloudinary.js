import {v2 as cloudinary} from "cloudinary";
import { response } from "express";
import fs from "fs";

 // Configuration
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET, //
    });


const  uploadOnCloudinary = async (localFilePath) => {
    try {
        if(!localFilePath) return null;

        // upload the file on cloudinary
        const response = await cloudinary.uploader.upload(localFilePath, {
            resource_type: "auto"
        })

        // file uploaded successfully, check the response we get from the cloudinary
        console.log("file uploaded on cloudinary", response);
        
        fs.unlinkSync(localFilePath);

        return response;

    } catch (error) {
        fs.unlinkSync(localFilePath) // removes the locally saved temporary file as the uploading failed
        return null;
    }
}

export {uploadOnCloudinary}