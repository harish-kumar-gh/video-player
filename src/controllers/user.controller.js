import { asyncHandler } from "../utils/asyncHandler.js"
import { ApiError } from "../utils/ApiError.js"
import { User } from "../models/user.model.js"
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js"
import jwt from "jsonwebtoken";
import mongoose from "mongoose";

const generateAccessandRefreshToken = async (userId) => {
    try {

        const user = await User.findById(userId);
        const accessToken = user.generateAccessToken();
        const refreshToken = user.generateRefreshToken()

        // saving the refresh token in the database for future
        user.refreshToken = refreshToken;
        await user.save({ validateBeforeSave: false });

        return {accessToken, refreshToken };

    } catch (error){
        throw new ApiError(500, "Something went wrong while generating access and refresh token")
    }
}

const registerUser = asyncHandler( async (req, res) => {
    // get user details from frontend
    // validation - not empty
    // check if user already exists: username, email
    // check for images, check for avatar
    // upload them to cloudinary, avatar
    // create user object - create entry in db
    // remove password and refresh token field from response
    // check for user creation
    // return res

    const {fullname, email, username, password} = req.body

    // how does the request comes 
    console.log(req.body);

    if(
        [fullname, email, username, password].some((field) => field?.trim() === "")
    ){
        throw new ApiError(400, "All fields are required");
    }

    const existedUser = await User.findOne({
        $or: [ { username }, { email } ]
    })

    if(existedUser){
        throw new ApiError(409, "User with same email or username exist");
    }

    // how does the req files comes
    console.log(req.files);

    const avatarLocalPath = req.files?.avatar[0]?.path
    // const coverImageLocalPath = req.files?.coverImage[0]?.path

    let coverImageLocalPath;
    
    if(req.files && Array.isArray(req.files.coverImage) && req.files.coverImage.length > 0){
        coverImageLocalPath = req.files.coverImage[0].path;
    }

    if(!avatarLocalPath){
        throw new ApiError(400, "Avatar is required")
    }

    const avatar = await uploadOnCloudinary(avatarLocalPath);
    console.log("Avatar from Cloudinary:", avatar);
    const coverImage = await uploadOnCloudinary(coverImageLocalPath);

    if (!avatar) {
      throw new ApiError(400, "Avatar is required");
    }

    const user = await User.create({
        fullname,
        avatar: avatar.url,
        coverImage: coverImage?.url || "",
        email,
        password,
        username: username.toLowerCase()
    })

    const createdUser = await User.findById(user._id).select(
        "-password -refreshToken"
    )

    if(!createdUser){
        throw new ApiError(500, "Something went wrong while registering the user")
    }

    return res.status(201).json(
        new ApiResponse(200, createdUser, "User registered successfully")
    )

})

const loginUser = asyncHandler( async (req, res) => {
    // req body -> data
    // username or email
    // find the user
    // password check
    // access and refresh token
    // send cookie

    const {email, username, password} = req.body;
    console.log(email);
    

    if(!(username || email)){
        throw new ApiError(400, "Username or Email is required");
    }

    const user = await User.findOne({
        $or: [{username}, {email}]
    })

    if(!user){
        throw new ApiError(404, "User doesn't exist");
    }

    const isPasswordValid = await user.isPasswordCorrect(password);

    if(!isPasswordValid){
        throw new ApiError(401, "Invalid user credentials")
    }

    const {accessToken, refreshToken} = await generateAccessandRefreshToken(user._id);

    const loggenInUser = await User.findById(user._id).
    select("-password -refreshToken");

    const options = {
      httpOnly: true, // cookies will only modifiable by the server not the frontend
      secure: true, // cookie will only be sent over HTTPS connections (not HTTP)
    };

    // sending the access and refresh token outside the userobject
    return (
      res
        .status(200)
        .cookie("accessToken", accessToken, options)
        .cookie("refreshToken", refreshToken, options)
        // json response is for when the frontend wants to use or save the access and refresh token e.g on mobile
        .json(
          new ApiResponse(
            200,
            {
              user: loggenInUser,
              accessToken,
              refreshToken,
            },
            "User logged in successfully"
          )
        )
    );
})

const logoutUser = asyncHandler( async(req, res) => {

   await User.findByIdAndUpdate(
        req.user._id,
        {
            $unset: {
                refreshToken: 1, // removes the field from the document
            }
        },
        {
            new: true // returned response will get the new updated value
        }
    )

    const options = {
       httpOnly: true,
       secure: true
    };

    return res
    .status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(new ApiResponse(200, {}, "user logged out successfully"))
})

const refreshAccessToken = asyncHandler( async(req, res) => {
    const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken; // for mobile users

    if(!incomingRefreshToken){
        throw new ApiError(401, "Unauthorized request")
    }

    try {
        const decodedToken = jwt.verify(
            incomingRefreshToken, 
            process.env.REFRESH_TOKEN_SECRET
        );
        
        const user = await User.findById(decodedToken?._id)
    
        if (!user) {
          throw new ApiError(401, "Invalid access token");
        }
    
        if(incomingRefreshToken !== user.refreshToken){
            throw new ApiError(401, "Refresh is either expired or used");
        }
    
        const options = {
            httpOnly: true,
            secure: true
        }
    
        const {accessToken, newRefreshToken} = await generateAccessandRefreshToken(user._id);
    
        return res
        .status(200)
        .cookie("accessToken", accessToken, options)
        .cookie("refreshToken", newRefreshToken)
        .json(
            new ApiResponse(
                200,
                {accessToken, refreshToken: newRefreshToken},
                "Access token refreshed"
            )
        )
    } catch (error) {
        throw new ApiError(401, error?.message || "Invalid refresh token")
    }
})

const changeCurrentPassword = asyncHandler( async(req, res) => {
    const {oldPassword, newPassword} = req.body;

    const user = await User.findById(req?.user._id)
    const isPasswordCorrect = await user.isPasswordCorrect(oldPassword);

    if(!isPasswordCorrect){
        throw new ApiError(400, "Invalid password");
    }

    user.password = newPassword;
    await user.save({validateBeforeSave: false}) // so that other validation doesn't run

    return res
    .status(200)
    .json(new ApiResponse(200, {}, "Password changed successully"))
})


const getCurrentUser = asyncHandler( async( req, res) => {

    return res
    .status(200)
    .json(new ApiResponse(200, req.user, "current user fetched successfully"));
})


const updateAccountDetails = asyncHandler( async(req, res) => {

    const {fullname, email} = req.body;

    if(!fullname || !email){
        throw new ApiError(400, "All fields are required")
    }

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: {
                fullname,
                email
            }
        },
        {new: true} // information after updation will be returned
    ).select("-password")

    return res
    .status(200)
    .json(new ApiResponse(200, user, "Account details updated successfully"))
})

const updateUserAvatar = asyncHandler( async(req, res) => {
//   TODO: Delete the old avatar
  
    const avatarLocalPath = req.file?.path;

  if (!avatarLocalPath) {
    throw new ApiError(400, "Avatar file is missing");
  }

  const avatar = await uploadOnCloudinary(avatarLocalPath);

  if (!avatar.url) {
    throw new ApiError(400, "Error while uploading the avatar");
  }

  const user = await User.findByIdAndUpdate(
    req.user?._id,
    {
      avatar: avatar.url,
    },
    { new: true }
  ).select("-password");

  return res
    .status(200)
    .json(
        new ApiResponse(200, user, "Avatar updated successfully")
    );

})

const updateUserCoverImage = asyncHandler( async(req, res) => {
  //   TODO: Delete the old cover Image

  const coverImageLocalPath = req.file?.path;

  if (!coverImageLocalPath) {
    throw new ApiError(400, "Cover Image file is missing");
  }

  const newCoverImage = await uploadOnCloudinary(coverImageLocalPath);

  if (!coverImage.url) {
    throw new ApiError(400, "Error while uploading the cover Image");
  }

  const user = await User.findByIdAndUpdate(
    req.user?._id,
    {
      coverImage: newCoverImage.url,
    },
    { new: true }
  ).select("-password");

  return res
    .status(200)
    .json(new ApiResponse(200, user, "Cover Image updated successfully"));
})

const getUserChannelProfile = asyncHandler(async (req, res) => {

    const {username} = req.params;

    if(!username?.trim()){
        throw new ApiError(400, "Username is missing")
    }

    const channel = await User.aggregate([
      {
        $match: {
          username: username?.toLowerCase(),
        },
      },
      {
        $lookup: {
          from: "subscriptions",
          localField: "_id",
          foreignField: "channel",
          as: "subscribers",
        },
      },
      {
        $lookup: {
          from: "subscriptions",
          localField: "_id",
          foreignField: "subscriber",
          as: "subscribedTo",
        },
      },
      {
        $addFields: {
          subscriberCount: {
            $size: "$subscribers",
          },
          channelsSubscribedToCounnt: {
            $size: "$subscribedTo",
          },
          isSubscribed: {
            $cond: {
              if: { $in: [req.user?._id, "$subscribers.subscriber"] },
              then: true,
              else: false,
            },
          },
        },
      },
      {
        $project: {
          fullname: 1,
          username: 1,
          subscriberCount: 1,
          channelsSubscribedToCounnt: 1,
          isSubscribed: 1,
          avatar: 1,
          coverImage: 1,
          email: 1
        },
      },
    ]);

    console.log(channel);
    
    if(!channel?.length){
        throw new ApiError(404, "channel doesn't exist")
    }

    return res
    .status(200)
    .json(
        new ApiResponse(200, channel[0], "User channel fetched succsessfully")
    )
})

const getWatchHistory = asyncHandler(async(req, res) => {

    const user = await User.aggregate([
      {
        $match: {
          _id: new mongoose.Types.ObjectId(req.user._id.toString()) // this will give a proper id as in mongodb req.user._id will give a string not the actual id
        }
      },
      {
        $lookup: {
          $lookup: {
            from: "videos",
            localField: "watchHistory",
            foreignField: "_id",
            as: "watchHistory",
            pipeline: [
              {

                $lookup: {
                  from: "users",
                  localField: "owner",
                  foreignField: "_id",
                  as: "owner",

                  pipeline:[
                    {
                    $project: {
                      fullname: 1,
                      username: 1,
                      avatar: 1,
                    }
                  }
                  ]
                }
              },
              {

                $addFields: {
                  owner:{
                    $first: "$owner",
                  }
                }
              }
            ]
          }
        }
      }
  ])

  return res
  .status(200)
  .json(
    new ApiResponse(200, user[0].watchHistory, "Watch History fetched successfully")
  )
})

export {
  registerUser,
  loginUser,
  logoutUser,
  refreshAccessToken,
  changeCurrentPassword,
  getCurrentUser,
  updateAccountDetails,
  updateUserAvatar,
  updateUserCoverImage,
  getUserChannelProfile,
  getWatchHistory,
};