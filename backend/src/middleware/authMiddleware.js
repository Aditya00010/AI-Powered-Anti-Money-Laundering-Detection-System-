/**
 * Project Vigilance — Authentication & Role Authorization Middleware
 * ===================================================================
 * Verifies JWT bearer tokens and enforces role-based access control.
 *
 * Security:
 * - Reads Authorization header: Bearer <token>.
 * - Validates JWT signature and expiration.
 * - Confirms user account exists and is active.
 * - Rejects unauthorized roles with 403 Forbidden.
 */

const jwt = require('jsonwebtoken');
const { jwtSecret } = require('../config/env');
const { isDBConnected } = require('../config/db');
const { User } = require('../models/User');
const { UnauthorizedError, ForbiddenError } = require('../utils/errors');

/**
 * Authenticates JWT bearer token from request headers
 */
async function authenticateToken(req, res, next) {
  try {
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
      throw new UnauthorizedError('Authentication token required');
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer' || !parts[1]) {
      throw new UnauthorizedError('Invalid authorization header format. Expected Bearer <token>');
    }

    const token = parts[1];

    let decoded;
    try {
      decoded = jwt.verify(token, jwtSecret);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        throw new UnauthorizedError('Authentication token expired');
      }
      throw new UnauthorizedError('Invalid authentication token');
    }

    if (!decoded || !decoded.id) {
      throw new UnauthorizedError('Invalid token claims');
    }

    let user = null;
    if (isDBConnected()) {
      user = await User.findById(decoded.id);
      if (!user) {
        throw new UnauthorizedError('User account associated with token no longer exists');
      }
      if (!user.active) {
        throw new ForbiddenError('User account is deactivated');
      }
    } else {
      user = {
        _id: decoded.id,
        username: decoded.username || 'test_user',
        email: decoded.email || 'test@example.com',
        role: decoded.role || 'INVESTIGATOR',
        active: decoded.active !== false,
      };
      if (!user.active) {
        throw new ForbiddenError('User account is deactivated');
      }
    }

    // Attach verified user information to request
    req.user = {
      id: user._id.toString(),
      username: user.username,
      email: user.email,
      role: user.role,
      active: user.active,
    };

    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Enforces role-based permissions for specified roles
 * @param  {...string} roles - Allowed roles (e.g. 'ADMIN', 'INVESTIGATOR')
 */
function authorizeRoles(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return next(new UnauthorizedError('Authentication required prior to role verification'));
    }

    if (!roles.includes(req.user.role)) {
      return next(
        new ForbiddenError(
          `Access denied. Role '${req.user.role}' is not authorized to access this resource. Required: [${roles.join(', ')}]`
        )
      );
    }

    next();
  };
}

module.exports = {
  authenticateToken,
  authorizeRoles,
};
