/**
 * Project Vigilance - MongoDB Database Connection Module
 * ======================================================
 * Manages Mongoose connection lifecycle, events, and health status.
 */

const mongoose = require('mongoose');
const { mongodbUri } = require('./env');

let isConnected = false;

/**
 * Connect to MongoDB with timeout and resilience
 */
async function connectDB() {
  if (isConnected) {
    return;
  }

  try {
    const conn = await mongoose.connect(mongodbUri, {
      serverSelectionTimeoutMS: 5000,
    });
    isConnected = true;
    console.log(`[MongoDB] Connected successfully to host: ${conn.connection.host}, database: ${conn.connection.name}`);
  } catch (err) {
    isConnected = false;
    console.error(`[MongoDB] Connection error: ${err.message}`);
    // Non-fatal: Allow Express to operate with ML service even if MongoDB is momentarily down
  }

  mongoose.connection.on('disconnected', () => {
    isConnected = false;
    console.warn('[MongoDB] Connection disconnected.');
  });

  mongoose.connection.on('reconnected', () => {
    isConnected = true;
    console.log('[MongoDB] Connection re-established.');
  });
}

/**
 * Disconnect from MongoDB
 */
async function disconnectDB() {
  if (!isConnected) return;
  try {
    await mongoose.disconnect();
    isConnected = false;
    console.log('[MongoDB] Disconnected cleanly.');
  } catch (err) {
    console.error(`[MongoDB] Disconnect error: ${err.message}`);
  }
}

/**
 * Returns current MongoDB connectivity state
 */
function isDBConnected() {
  return mongoose.connection.readyState === 1;
}

module.exports = {
  connectDB,
  disconnectDB,
  isDBConnected,
};
