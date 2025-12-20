/**
 * Android Permissions Configuration for Frontend
 * 
 * This mirrors the backend permissions but is optimized for UI display
 */

export interface PermissionInfo {
    key: string;
    label: string;
    labelCn: string;
    description: string;
    descriptionCn: string;
    dangerous?: boolean;
}

export interface PermissionCategory {
    id: string;
    label: string;
    labelCn: string;
    permissions: PermissionInfo[];
}

/**
 * Common permissions organized by category for UI display
 */
export const PERMISSION_CATEGORIES: PermissionCategory[] = [
    {
        id: 'network',
        label: 'Network',
        labelCn: '网络',
        permissions: [
            {
                key: 'INTERNET',
                label: 'Internet',
                labelCn: '网络访问',
                description: 'Access the internet',
                descriptionCn: '允许应用访问互联网',
            },
            {
                key: 'ACCESS_NETWORK_STATE',
                label: 'Network State',
                labelCn: '网络状态',
                description: 'View network connections',
                descriptionCn: '查看网络连接状态',
            },
        ],
    },
    {
        id: 'storage',
        label: 'Storage',
        labelCn: '存储',
        permissions: [
            {
                key: 'READ_EXTERNAL_STORAGE',
                label: 'Read Storage',
                labelCn: '读取存储',
                description: 'Read files from storage',
                descriptionCn: '从存储读取文件',
                dangerous: true,
            },
            {
                key: 'WRITE_EXTERNAL_STORAGE',
                label: 'Write Storage',
                labelCn: '写入存储',
                description: 'Save files to storage',
                descriptionCn: '保存文件到存储',
                dangerous: true,
            },
        ],
    },
    {
        id: 'camera',
        label: 'Camera & Audio',
        labelCn: '相机和音频',
        permissions: [
            {
                key: 'CAMERA',
                label: 'Camera',
                labelCn: '相机',
                description: 'Take photos and videos',
                descriptionCn: '拍照和录像',
                dangerous: true,
            },
            {
                key: 'RECORD_AUDIO',
                label: 'Microphone',
                labelCn: '麦克风',
                description: 'Record audio',
                descriptionCn: '录制音频',
                dangerous: true,
            },
        ],
    },
    {
        id: 'location',
        label: 'Location',
        labelCn: '位置',
        permissions: [
            {
                key: 'ACCESS_FINE_LOCATION',
                label: 'Precise Location',
                labelCn: '精确位置',
                description: 'Access precise location (GPS)',
                descriptionCn: '获取精确位置（GPS）',
                dangerous: true,
            },
            {
                key: 'ACCESS_COARSE_LOCATION',
                label: 'Approximate Location',
                labelCn: '大致位置',
                description: 'Access approximate location',
                descriptionCn: '获取大致位置',
                dangerous: true,
            },
        ],
    },
    {
        id: 'hardware',
        label: 'Hardware',
        labelCn: '硬件',
        permissions: [
            {
                key: 'VIBRATE',
                label: 'Vibrate',
                labelCn: '振动',
                description: 'Control vibration',
                descriptionCn: '控制设备振动',
            },
            {
                key: 'WAKE_LOCK',
                label: 'Wake Lock',
                labelCn: '唤醒锁定',
                description: 'Prevent device from sleeping',
                descriptionCn: '防止设备休眠',
            },
        ],
    },
    {
        id: 'notification',
        label: 'Notifications',
        labelCn: '通知',
        permissions: [
            {
                key: 'POST_NOTIFICATIONS',
                label: 'Notifications',
                labelCn: '通知',
                description: 'Show notifications',
                descriptionCn: '显示通知',
                dangerous: true,
            },
        ],
    },
];

/**
 * Default permissions that are commonly needed for web apps
 */
export const DEFAULT_PERMISSIONS = ['INTERNET', 'ACCESS_NETWORK_STATE'];

/**
 * Get all available permission keys
 */
export function getAllPermissionKeys(): string[] {
    return PERMISSION_CATEGORIES.flatMap(cat => cat.permissions.map(p => p.key));
}

/**
 * Get permission info by key
 */
export function getPermissionInfo(key: string): PermissionInfo | undefined {
    for (const category of PERMISSION_CATEGORIES) {
        const perm = category.permissions.find(p => p.key === key);
        if (perm) return perm;
    }
    return undefined;
}
