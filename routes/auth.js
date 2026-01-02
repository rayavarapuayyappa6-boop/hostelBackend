const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");

const User = require("../models/user");
const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");

const router = express.Router();

/* ==================================================
   OTP STORE (TEMP – MEMORY)
================================================== */
const otpStore = {};

/* ==================================================
   EMAIL VALIDATION
================================================== */
function isValidEmail(email) {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
}

/* ==================================================
   SEND OTP (EMAIL)
================================================== */
router.post("/send-otp", async (req, res) => {
  const { email } = req.body;

  if (!email || !isValidEmail(email)) {
    return res.status(400).json({ message: "Invalid email address" });
  }

  const otp = Math.floor(100000 + Math.random() * 900000);

  // store OTP
  otpStore[email] = otp;

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Hostel Portal OTP Verification",
      text: `Your OTP is ${otp}. It is valid for 5 minutes.`
    });

    res.json({ message: "OTP sent to email" });
  } catch (error) {
    console.error("OTP mail error:", error);
    res.status(500).json({ message: "Failed to send OTP" });
  }
});

/* ==================================================
   REGISTER (WITH OTP VERIFICATION)
================================================== */
router.post("/register", async (req, res) => {
  try {
    const { userId, role, email, otp, mobile, password } = req.body;

    /* 1️⃣ Validate fields */
    if (!userId || !role || !email || !otp || !mobile || !password) {
      return res.status(400).json({
        message: "All fields are required"
      });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({
        message: "Invalid email address"
      });
    }

    /* 2️⃣ OTP VERIFICATION */
    if (!otpStore[email]) {
      return res.status(400).json({
        message: "OTP not sent or expired"
      });
    }

    if (otpStore[email] != otp) {
      return res.status(400).json({
        message: "Invalid OTP"
      });
    }

    // OTP verified – delete it
    delete otpStore[email];

    /* 3️⃣ Check existing user */
    const existingUser = await User.findOne({ userId });
    if (existingUser) {
      return res.status(400).json({
        message: "User already exists"
      });
    }

    /* 4️⃣ Hash password */
    const hashedPassword = await bcrypt.hash(password, 10);

    /* 5️⃣ Create user */
    const newUser = new User({
      userId,
      role,
      email,
      mobile,
      password: hashedPassword
    });

    await newUser.save();

    /* 6️⃣ Success */
    res.status(201).json({
      message: "User registered successfully"
    });

  } catch (error) {
    console.error("Register error:", error);
    res.status(500).json({
      message: "Server error"
    });
  }
});

/* ==================================================
   LOGIN
================================================== */
router.post("/login", async (req, res) => {
  try {
    const { userId, password } = req.body;

    if (!userId || !password) {
      return res.status(400).json({
        message: "UserId and password are required"
      });
    }

    const user = await User.findOne({ userId });
    if (!user) {
      return res.status(400).json({
        message: "User not found"
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({
        message: "Invalid password"
      });
    }

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.json({
      message: "Login successful",
      token,
      role: user.role,
      userId: user.userId
    });

  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({
      message: "Server error"
    });
  }
});

/* ==================================================
   ROLE-BASED ROUTES
================================================== */
router.get(
  "/student",
  authMiddleware,
  roleMiddleware(["Student"]),
  (req, res) => res.json({ message: "Welcome Student Dashboard" })
);

router.get(
  "/admin",
  authMiddleware,
  roleMiddleware(["Admin"]),
  (req, res) => res.json({ message: "Welcome Admin Dashboard" })
);

router.get(
  "/mess",
  authMiddleware,
  roleMiddleware(["Mess"]),
  (req, res) => res.json({ message: "Welcome Mess Dashboard" })
);

/* ==================================================
   USER PROFILE
================================================== */
router.get("/me", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json(user);

  } catch (error) {
    console.error("Profile error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

/* ==================================================
   UPDATE STUDENT DETAILS
================================================== */
router.put("/update-profile", authMiddleware, async (req, res) => {
  try {
    const {
      hostelBlock,
      roomNumber,
      courseYear,
      branch,
      isInactiveToday
    } = req.body;

    // Find logged-in user
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Update only if values are provided
    if (hostelBlock !== undefined) user.hostelBlock = hostelBlock;
    if (roomNumber !== undefined) user.roomNumber = roomNumber;
    if (courseYear !== undefined) user.courseYear = courseYear;
    if (branch !== undefined) user.branch = branch;
    if (isInactiveToday !== undefined) user.isInactiveToday = isInactiveToday;

    await user.save();

    res.json({
      message: "Profile updated successfully",
      user
    });

  } catch (error) {
    console.error("Update profile error:", error);
    res.status(500).json({ message: "Server error" });
  }
});


/* ==================================================
   UPDATE SPECIFIC USER BY USER ID (ADMIN)
================================================== */
router.put(
  "/update-user/:userId",
  authMiddleware,
  roleMiddleware(["Admin"]),
  async (req, res) => {
    try {
      const { userId } = req.params;

      // ✅ Update safely without validation crash
      const updatedUser = await User.findOneAndUpdate(
        { userId },          // find by userId (not _id)
        { $set: req.body },  // update only provided fields
        { new: true }        // return updated document
      );

      if (!updatedUser) {
        return res.status(404).json({
          message: "User not found"
        });
      }

      res.json({
        message: "User updated successfully",
        user: updatedUser
      });

    } catch (error) {
      console.error("Admin update error:", error);
      res.status(500).json({
        message: "Server error"
      });
    }
  }
);
module.exports = router;






