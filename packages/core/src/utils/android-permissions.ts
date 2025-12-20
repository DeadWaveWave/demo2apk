/**
 * Android Permissions Configuration
 * 
 * This module provides utilities for managing Android permissions
 * during APK packaging.
 */

/**
 * Standard Android permissions mapping
 * Key: shorthand name used in API
 * Value: full Android permission string
 */
export const ANDROID_PERMISSIONS: Record<string, string> = {
  // Network
  INTERNET: 'android.permission.INTERNET',
  ACCESS_NETWORK_STATE: 'android.permission.ACCESS_NETWORK_STATE',
  ACCESS_WIFI_STATE: 'android.permission.ACCESS_WIFI_STATE',
  
  // Storage
  READ_EXTERNAL_STORAGE: 'android.permission.READ_EXTERNAL_STORAGE',
  WRITE_EXTERNAL_STORAGE: 'android.permission.WRITE_EXTERNAL_STORAGE',
  
  // Camera & Media
  CAMERA: 'android.permission.CAMERA',
  RECORD_AUDIO: 'android.permission.RECORD_AUDIO',
  
  // Location
  ACCESS_FINE_LOCATION: 'android.permission.ACCESS_FINE_LOCATION',
  ACCESS_COARSE_LOCATION: 'android.permission.ACCESS_COARSE_LOCATION',
  
  // Contacts
  READ_CONTACTS: 'android.permission.READ_CONTACTS',
  WRITE_CONTACTS: 'android.permission.WRITE_CONTACTS',
  
  // Phone
  READ_PHONE_STATE: 'android.permission.READ_PHONE_STATE',
  CALL_PHONE: 'android.permission.CALL_PHONE',
  
  // SMS
  SEND_SMS: 'android.permission.SEND_SMS',
  RECEIVE_SMS: 'android.permission.RECEIVE_SMS',
  READ_SMS: 'android.permission.READ_SMS',
  
  // Sensors & Hardware
  VIBRATE: 'android.permission.VIBRATE',
  FLASHLIGHT: 'android.permission.FLASHLIGHT',
  BODY_SENSORS: 'android.permission.BODY_SENSORS',
  
  // Calendar
  READ_CALENDAR: 'android.permission.READ_CALENDAR',
  WRITE_CALENDAR: 'android.permission.WRITE_CALENDAR',
  
  // Bluetooth
  BLUETOOTH: 'android.permission.BLUETOOTH',
  BLUETOOTH_ADMIN: 'android.permission.BLUETOOTH_ADMIN',
  BLUETOOTH_CONNECT: 'android.permission.BLUETOOTH_CONNECT',
  BLUETOOTH_SCAN: 'android.permission.BLUETOOTH_SCAN',
  
  // Notifications (Android 13+)
  POST_NOTIFICATIONS: 'android.permission.POST_NOTIFICATIONS',
  
  // Wake lock
  WAKE_LOCK: 'android.permission.WAKE_LOCK',
  
  // Background execution
  FOREGROUND_SERVICE: 'android.permission.FOREGROUND_SERVICE',
  RECEIVE_BOOT_COMPLETED: 'android.permission.RECEIVE_BOOT_COMPLETED',
};

/**
 * Permission categories for UI grouping
 */
export const PERMISSION_CATEGORIES: Record<string, {
  label: string;
  labelCn: string;
  permissions: string[];
}> = {
  network: {
    label: 'Network',
    labelCn: '网络',
    permissions: ['INTERNET', 'ACCESS_NETWORK_STATE', 'ACCESS_WIFI_STATE'],
  },
  storage: {
    label: 'Storage',
    labelCn: '存储',
    permissions: ['READ_EXTERNAL_STORAGE', 'WRITE_EXTERNAL_STORAGE'],
  },
  camera: {
    label: 'Camera & Audio',
    labelCn: '相机和音频',
    permissions: ['CAMERA', 'RECORD_AUDIO'],
  },
  location: {
    label: 'Location',
    labelCn: '位置',
    permissions: ['ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION'],
  },
  contacts: {
    label: 'Contacts',
    labelCn: '联系人',
    permissions: ['READ_CONTACTS', 'WRITE_CONTACTS'],
  },
  phone: {
    label: 'Phone',
    labelCn: '电话',
    permissions: ['READ_PHONE_STATE', 'CALL_PHONE'],
  },
  sms: {
    label: 'SMS',
    labelCn: '短信',
    permissions: ['SEND_SMS', 'RECEIVE_SMS', 'READ_SMS'],
  },
  hardware: {
    label: 'Hardware',
    labelCn: '硬件',
    permissions: ['VIBRATE', 'FLASHLIGHT', 'BODY_SENSORS', 'WAKE_LOCK'],
  },
  calendar: {
    label: 'Calendar',
    labelCn: '日历',
    permissions: ['READ_CALENDAR', 'WRITE_CALENDAR'],
  },
  bluetooth: {
    label: 'Bluetooth',
    labelCn: '蓝牙',
    permissions: ['BLUETOOTH', 'BLUETOOTH_ADMIN', 'BLUETOOTH_CONNECT', 'BLUETOOTH_SCAN'],
  },
  notification: {
    label: 'Notifications',
    labelCn: '通知',
    permissions: ['POST_NOTIFICATIONS'],
  },
  background: {
    label: 'Background',
    labelCn: '后台运行',
    permissions: ['FOREGROUND_SERVICE', 'RECEIVE_BOOT_COMPLETED'],
  },
};

/**
 * Permission metadata for UI display
 */
export const PERMISSION_METADATA: Record<string, {
  label: string;
  labelCn: string;
  description: string;
  descriptionCn: string;
  dangerous?: boolean;
}> = {
  INTERNET: {
    label: 'Internet',
    labelCn: '网络访问',
    description: 'Access the internet',
    descriptionCn: '允许应用访问互联网',
  },
  ACCESS_NETWORK_STATE: {
    label: 'Network State',
    labelCn: '网络状态',
    description: 'View network connections',
    descriptionCn: '查看网络连接状态',
  },
  ACCESS_WIFI_STATE: {
    label: 'WiFi State',
    labelCn: 'WiFi状态',
    description: 'View WiFi connections',
    descriptionCn: '查看WiFi连接状态',
  },
  READ_EXTERNAL_STORAGE: {
    label: 'Read Storage',
    labelCn: '读取存储',
    description: 'Read files from storage',
    descriptionCn: '从存储读取文件',
    dangerous: true,
  },
  WRITE_EXTERNAL_STORAGE: {
    label: 'Write Storage',
    labelCn: '写入存储',
    description: 'Save files to storage',
    descriptionCn: '保存文件到存储',
    dangerous: true,
  },
  CAMERA: {
    label: 'Camera',
    labelCn: '相机',
    description: 'Take photos and videos',
    descriptionCn: '拍照和录像',
    dangerous: true,
  },
  RECORD_AUDIO: {
    label: 'Microphone',
    labelCn: '麦克风',
    description: 'Record audio',
    descriptionCn: '录制音频',
    dangerous: true,
  },
  ACCESS_FINE_LOCATION: {
    label: 'Precise Location',
    labelCn: '精确位置',
    description: 'Access precise location (GPS)',
    descriptionCn: '获取精确位置（GPS）',
    dangerous: true,
  },
  ACCESS_COARSE_LOCATION: {
    label: 'Approximate Location',
    labelCn: '大致位置',
    description: 'Access approximate location',
    descriptionCn: '获取大致位置',
    dangerous: true,
  },
  READ_CONTACTS: {
    label: 'Read Contacts',
    labelCn: '读取联系人',
    description: 'Read your contacts',
    descriptionCn: '读取联系人信息',
    dangerous: true,
  },
  WRITE_CONTACTS: {
    label: 'Write Contacts',
    labelCn: '写入联系人',
    description: 'Modify your contacts',
    descriptionCn: '修改联系人信息',
    dangerous: true,
  },
  READ_PHONE_STATE: {
    label: 'Phone State',
    labelCn: '电话状态',
    description: 'Read phone state',
    descriptionCn: '读取电话状态',
    dangerous: true,
  },
  CALL_PHONE: {
    label: 'Make Calls',
    labelCn: '拨打电话',
    description: 'Directly call phone numbers',
    descriptionCn: '直接拨打电话',
    dangerous: true,
  },
  SEND_SMS: {
    label: 'Send SMS',
    labelCn: '发送短信',
    description: 'Send SMS messages',
    descriptionCn: '发送短信',
    dangerous: true,
  },
  RECEIVE_SMS: {
    label: 'Receive SMS',
    labelCn: '接收短信',
    description: 'Receive SMS messages',
    descriptionCn: '接收短信',
    dangerous: true,
  },
  READ_SMS: {
    label: 'Read SMS',
    labelCn: '读取短信',
    description: 'Read SMS messages',
    descriptionCn: '读取短信内容',
    dangerous: true,
  },
  VIBRATE: {
    label: 'Vibrate',
    labelCn: '振动',
    description: 'Control vibration',
    descriptionCn: '控制设备振动',
  },
  FLASHLIGHT: {
    label: 'Flashlight',
    labelCn: '闪光灯',
    description: 'Control flashlight',
    descriptionCn: '控制闪光灯',
  },
  BODY_SENSORS: {
    label: 'Body Sensors',
    labelCn: '身体传感器',
    description: 'Access body sensors',
    descriptionCn: '访问身体传感器',
    dangerous: true,
  },
  WAKE_LOCK: {
    label: 'Wake Lock',
    labelCn: '唤醒锁定',
    description: 'Prevent device from sleeping',
    descriptionCn: '防止设备休眠',
  },
  READ_CALENDAR: {
    label: 'Read Calendar',
    labelCn: '读取日历',
    description: 'Read calendar events',
    descriptionCn: '读取日历事件',
    dangerous: true,
  },
  WRITE_CALENDAR: {
    label: 'Write Calendar',
    labelCn: '写入日历',
    description: 'Add/modify calendar events',
    descriptionCn: '添加/修改日历事件',
    dangerous: true,
  },
  BLUETOOTH: {
    label: 'Bluetooth',
    labelCn: '蓝牙',
    description: 'Access Bluetooth',
    descriptionCn: '使用蓝牙',
  },
  BLUETOOTH_ADMIN: {
    label: 'Bluetooth Admin',
    labelCn: '蓝牙管理',
    description: 'Configure Bluetooth',
    descriptionCn: '配置蓝牙设置',
  },
  BLUETOOTH_CONNECT: {
    label: 'Bluetooth Connect',
    labelCn: '蓝牙连接',
    description: 'Connect to Bluetooth devices',
    descriptionCn: '连接蓝牙设备',
  },
  BLUETOOTH_SCAN: {
    label: 'Bluetooth Scan',
    labelCn: '蓝牙扫描',
    description: 'Scan for Bluetooth devices',
    descriptionCn: '扫描蓝牙设备',
  },
  POST_NOTIFICATIONS: {
    label: 'Notifications',
    labelCn: '通知',
    description: 'Show notifications',
    descriptionCn: '显示通知',
    dangerous: true,
  },
  FOREGROUND_SERVICE: {
    label: 'Foreground Service',
    labelCn: '前台服务',
    description: 'Run foreground services',
    descriptionCn: '运行前台服务',
  },
  RECEIVE_BOOT_COMPLETED: {
    label: 'Boot Completed',
    labelCn: '开机启动',
    description: 'Run at startup',
    descriptionCn: '开机时自动启动',
  },
};

/**
 * Default permissions that are commonly needed for web apps
 */
export const DEFAULT_PERMISSIONS = ['INTERNET', 'ACCESS_NETWORK_STATE'];

/**
 * Validate permission keys
 */
export function validatePermissions(permissions: string[]): {
  valid: string[];
  invalid: string[];
} {
  const valid: string[] = [];
  const invalid: string[] = [];
  
  for (const perm of permissions) {
    if (perm in ANDROID_PERMISSIONS || perm.startsWith('android.permission.')) {
      valid.push(perm);
    } else {
      invalid.push(perm);
    }
  }
  
  return { valid, invalid };
}

/**
 * Get full permission string from shorthand
 */
export function getFullPermissionName(permission: string): string {
  return ANDROID_PERMISSIONS[permission] || permission;
}

/**
 * Get all available permission keys
 */
export function getAvailablePermissions(): string[] {
  return Object.keys(ANDROID_PERMISSIONS);
}
