import { Electron } from "./useAppSettings";

/**
 * Get value from store
 * Falls back to localStorage if not in Electron
 */
const get = async (key, defaultValue = null) => {
    try {
        if (Electron.value.store) {
            const value = await Electron.value.store.get(key);
            return value !== undefined ? value : defaultValue;
        } else {
            const value = localStorage.getItem(key);
            return value !== null ? JSON.parse(value) : defaultValue;
        }
    } catch (error) {
        console.error('Error getting store value:', error);
        return defaultValue;
    }
};

/**
 * Set value in store
 * Falls back to localStorage if not in Electron
 */
const set = async (key, value) => {
    try {
        if (Electron.value.store) {
            await Electron.value.store.set(key, value);
        } else {
            localStorage.setItem(key, JSON.stringify(value));
        }
        return true;
    } catch (error) {
        console.error('Error setting store value:', error);
        return false;
    }
};

/**
 * Delete value from store
 */
const remove = async (key) => {
    try {
        if (Electron.value.store) {
            await Electron.value.store.delete(key);
        } else {
            localStorage.removeItem(key);
        }
        return true;
    } catch (error) {
        console.error('Error deleting store value:', error);
        return false;
    }
};

/**
 * Get all store data
 */
const getAll = async () => {
    try {
        if (Electron.value.store) {
            return await Electron.value.store.getAll();
        } else {
            const data = {};
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                const value = localStorage.getItem(key);
                try {
                    data[key] = JSON.parse(value);
                } catch {
                    data[key] = value;
                }
            }
            return data;
        }
    } catch (error) {
        console.error('Error getting all store data:', error);
        return {};
    }
};

/**
 * Clear all store data
 */
const clear = async () => {
    try {
        if (Electron.value.store) {
            await Electron.value.store.clear();
        } else {
            localStorage.clear();
        }
        return true;
    } catch (error) {
        console.error('Error clearing store:', error);
        return false;
    }
};

export function useStore() {
    return {
        get,
        set,
        remove,
        getAll,
        clear,
    };
}
