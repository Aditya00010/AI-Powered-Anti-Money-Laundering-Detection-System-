/**
 * Project Vigilance — User Model
 * ==============================
 * MongoDB / Mongoose model for system users and role-based access control.
 *
 * Security:
 * - Passwords are NEVER stored in plaintext.
 * - password_hash is automatically stripped when converted to JSON.
 * - Approved roles: ADMIN, INVESTIGATOR, COMPLIANCE_OFFICER, MANAGER.
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const APPROVED_ROLES = ['ADMIN', 'INVESTIGATOR', 'COMPLIANCE_OFFICER', 'MANAGER'];

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: [true, 'Username is required'],
      unique: true,
      trim: true,
      lowercase: true,
      minlength: [3, 'Username must be at least 3 characters'],
      maxlength: [50, 'Username cannot exceed 50 characters'],
      index: true,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      trim: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address'],
      index: true,
    },
    password_hash: {
      type: String,
      required: [true, 'Password hash is required'],
    },
    role: {
      type: String,
      required: [true, 'Role is required'],
      enum: {
        values: APPROVED_ROLES,
        message: '{VALUE} is not a valid role. Allowed roles: ' + APPROVED_ROLES.join(', '),
      },
      default: 'INVESTIGATOR',
      index: true,
    },
    active: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

// Hash password helper
userSchema.statics.hashPassword = async function (plainPassword) {
  const saltRounds = 10;
  return bcrypt.hash(plainPassword, saltRounds);
};

// Compare password instance method
userSchema.methods.comparePassword = async function (candidatePassword) {
  if (!candidatePassword || !this.password_hash) {
    return false;
  }
  return bcrypt.compare(candidatePassword, this.password_hash);
};

// Prevent password_hash from leaking in JSON serialization
userSchema.methods.toJSON = function () {
  const userObject = this.toObject();
  delete userObject.password_hash;
  return userObject;
};

const User = mongoose.model('User', userSchema);

module.exports = {
  User,
  APPROVED_ROLES,
};
