const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },

    role: {
      type: String,
      required: true,
      enum: ["Student", "Mess", "Admin"]
    },

    email: {
      type: String,
      required: true,
      unique: true
    },

    mobile: {
      type: String,
      required: true
    },

    /* 🔽 STUDENT DETAILS (NEW) */
    hostelBlock: {
      type: String,
      default: ""
    },

    roomNumber: {
      type: String,
      default: ""
    },

    courseYear: {
      type: String,
      default: ""
    },

    branch: {
      type: String,
      default: ""
    },

    /* 🔽 MESS / STATUS */
    isInactiveToday: {
      type: Boolean,
      default: false
    },

    password: {
      type: String,
      required: true
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model("User", userSchema);
