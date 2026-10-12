/**
 * Project Vigilance — User Management Controller (Admin Only)
 * ============================================================
 * Allows administrative personnel to inspect user accounts, toggle active status,
 * and modify operational roles.
 */

const { User, APPROVED_ROLES } = require('../models/User');
const { ValidationError, NotFoundError, ForbiddenError } = require('../utils/errors');

/**
 * GET /api/v1/users
 * Lists all registered users in the system (without password hashes)
 */
async function listUsers(req, res, next) {
  try {
    const users = await User.find({}, '-password_hash').sort({ created_at: -1 });
    res.status(200).json({
      success: true,
      count: users.length,
      data: users,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * PATCH /api/v1/users/:id/status
 * Activates or deactivates a user account
 */
async function updateUserStatus(req, res, next) {
  try {
    const { id } = req.params;
    const { active } = req.body;

    if (typeof active !== 'boolean') {
      throw new ValidationError('Active status must be a boolean (true or false)');
    }

    // Prevent admin from deactivating their own account
    if (req.user.id === id && !active) {
      throw new ForbiddenError('Administrators cannot deactivate their own account');
    }

    const user = await User.findByIdAndUpdate(
      id,
      { active },
      { new: true, select: '-password_hash' }
    );

    if (!user) {
      throw new NotFoundError(`User not found with ID ${id}`);
    }

    res.status(200).json({
      success: true,
      message: `User account ${active ? 'activated' : 'deactivated'} successfully`,
      data: user,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * PATCH /api/v1/users/:id/role
 * Updates the assigned role for a user account
 */
async function updateUserRole(req, res, next) {
  try {
    const { id } = req.params;
    const { role } = req.body;

    if (!role || !APPROVED_ROLES.includes(role)) {
      throw new ValidationError(`Invalid role. Approved roles are: ${APPROVED_ROLES.join(', ')}`);
    }

    // Prevent admin from revoking their own admin role
    if (req.user.id === id && role !== 'ADMIN') {
      throw new ForbiddenError('Administrators cannot revoke their own ADMIN role');
    }

    const user = await User.findByIdAndUpdate(
      id,
      { role },
      { new: true, select: '-password_hash' }
    );

    if (!user) {
      throw new NotFoundError(`User not found with ID ${id}`);
    }

    res.status(200).json({
      success: true,
      message: `User role updated to ${role} successfully`,
      data: user,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listUsers,
  updateUserStatus,
  updateUserRole,
};
