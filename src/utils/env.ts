/**
 * Environment variable utility functions
 * @module utils/env
 */

/**
 * Parses an environment variable as a boolean value
 *
 * @param {string} name - Name of the environment variable
 * @param {boolean} defaultValue - Default value if the environment variable is not set
 * @returns {boolean} Parsed boolean value
 *
 * @example
 * // Returns true if ENABLE_FEATURE is not defined or set to "true", "1", "yes", or "on"
 * const isFeatureEnabled = parseBooleanEnv('ENABLE_FEATURE', true);
 */
export const parseBooleanEnv = (name: string, defaultValue = false): boolean => {
  const value = process.env[name];

  if (value === undefined) {
    return defaultValue;
  }

  // These values are considered false
  if (['false', '0', 'no', 'off'].includes(value.toLowerCase())) {
    return false;
  }

  // These values are considered true
  if (['true', '1', 'yes', 'on'].includes(value.toLowerCase())) {
    return true;
  }

  // For any other value, return the default
  return defaultValue;
};
