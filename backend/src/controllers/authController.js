/**
 * Project Vigilance — Authentication Controller
 * ============================================
 * Handles user registration, credential verification, and JWT issuance.
 *
 * Security:
 * - Public registration cannot create ADMIN or other privileged roles (defaults to INVESTIGATOR).
 * - Passwords are securely hashed with bcrypt (never stored plaintext).
 * - Passwords and password hashes are never returned in responses.
 */

const jwt = require('jsonwebtoken');
const { jwtSecret, jwtExpiresIn } = require('../config/env');
const { User, APPROVED_ROLES } = require('../models/User');
const { ValidationError, UnauthorizedError, ForbiddenError } = require('../utils/errors');

/**
 * Generates signed JWT token for authenticated user
 */
function generateToken(user) {
  return jwt.sign(
    {
      id: user._id.toString(),
      username: user.username,
      role: user.role,
    },
    jwtSecret,
    { expiresIn: jwtExpiresIn }
  );
}

/**
 * POST /api/v1/auth/register
 */
async function register(req, res, next) {
  try {
    const { username, email, password, role } = req.body || {};

    if (!username || typeof username !== 'string' || !username.trim()) {
      throw new ValidationError('Username is required');
    }
    if (!email || typeof email !== 'string' || !email.trim()) {
      throw new ValidationError('Valid email is required');
    }
    if (!password || typeof password !== 'string' || password.length < 6) {
      throw new ValidationError('Password is required and must be at least 6 characters long');
    }

    const cleanUsername = username.trim().toLowerCase();
    const cleanEmail = email.trim().toLowerCase();

    // Check existing username/email
    const existingUser = await User.findOne({
      $or: [{ username: cleanUsername }, { email: cleanEmail }],
    });

    if (existingUser) {
      throw new ValidationError('A user with that username or email already exists');
    }

    // Role assignment security guardrail:
    // Public registration ALWAYS defaults to INVESTIGATOR.
    // Privileged roles (ADMIN, COMPLIANCE_OFFICER, MANAGER) can ONLY be assigned
    // if the registration request is executed by an authenticated ADMIN.
    let assignedRole = 'INVESTIGATOR';
    if (req.user && req.user.role === 'ADMIN' && role) {
      if (!APPROVED_ROLES.includes(role)) {
        throw new ValidationError(`Invalid role specified. Approved: ${APPROVED_ROLES.join(', ')}`);
      }
      assignedRole = role;
    }

    const password_hash = await User.hashPassword(password);

    const newUser = await User.create({
      username: cleanUsername,
      email: cleanEmail,
      password_hash,
      role: assignedRole,
      active: true,
    });

    const token = generateToken(newUser);

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      token,
      user: newUser.toJSON(),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/v1/auth/login
 */
async function login(req, res, next) {
  try {
    const { username, email, password } = req.body || {};

    const loginIdentifier = (username || email || '').trim().toLowerCase();
    if (!loginIdentifier) {
      throw new ValidationError('Username or email is required');
    }
    if (!password || typeof password !== 'string') {
      throw new ValidationError('Password is required');
    }

    // Find user by either username or email
    const user = await User.findOne({
      $or: [{ username: loginIdentifier }, { email: loginIdentifier }],
    });

    if (!user) {
      throw new UnauthorizedError('Invalid credentials');
    }

    if (!user.active) {
      throw new ForbiddenError('Account is deactivated. Please contact your AML administrator.');
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      throw new UnauthorizedError('Invalid credentials');
    }

    const token = generateToken(user);

    res.status(200).json({
      success: true,
      message: 'Authentication successful',
      token,
      user: user.toJSON(),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/auth/me
 */
async function getCurrentUser(req, res, next) {
  try {
    if (!req.user) {
      throw new UnauthorizedError('Not authenticated');
    }

    res.status(200).json({
      success: true,
      user: req.user,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  register,
  login,
  getCurrentUser,
  generateToken,
};
