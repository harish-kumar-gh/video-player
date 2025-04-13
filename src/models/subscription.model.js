import mongoose, { Schema } from "mongoose";
// restructure the schema

const subscriptionSchema = new Schema(
  {
    subsciber: {
      type: Schema.Types.ObjectId, // one who is subscribing
      ref: "User",
    },
    channel: {
      type: Schema.Types.ObjectId, // one to whom is being subscribed
      ref: "User",
    },
  },
  { timestamps: true }
);

export const Subsciption = mongoose.model("Subsciption", subscriptionSchema);
