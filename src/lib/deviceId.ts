/**
 * Device Identification System
 * 
 * Generates and persists a unique device ID per browser/device.
 * This prevents conflicts when the same user has multiple sessions
 * open on different devices.
 */

const STORAGE_KEY = 'device_id';

/**
 * Generates a unique device ID using timestamp + random UUID fragment
 */
function generateDeviceId(): string {
  const timestamp = Date.now().toString(36);
  const randomPart = crypto.randomUUID().split('-')[0];
  return `${timestamp}-${randomPart}`;
}

/**
 * Gets the device ID from localStorage, creating one if it doesn't exist.
 * The device ID persists across browser sessions.
 */
export function getDeviceId(): string {
  try {
    let deviceId = localStorage.getItem(STORAGE_KEY);
    
    if (!deviceId) {
      deviceId = generateDeviceId();
      localStorage.setItem(STORAGE_KEY, deviceId);
      console.log('📱 New device ID generated:', deviceId);
    }
    
    return deviceId;
  } catch (error) {
    // Fallback for cases where localStorage is not available
    console.warn('Could not access localStorage for device ID:', error);
    return generateDeviceId();
  }
}

/**
 * Forces generation of a new device ID.
 * Useful for testing or when user explicitly wants to reset device identity.
 */
export function resetDeviceId(): string {
  try {
    const newDeviceId = generateDeviceId();
    localStorage.setItem(STORAGE_KEY, newDeviceId);
    console.log('📱 Device ID reset:', newDeviceId);
    return newDeviceId;
  } catch (error) {
    console.warn('Could not reset device ID:', error);
    return generateDeviceId();
  }
}

/**
 * Checks if a given device ID matches the current device.
 */
export function isCurrentDevice(deviceId: string | null | undefined): boolean {
  if (!deviceId) return false;
  return deviceId === getDeviceId();
}
