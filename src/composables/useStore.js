import { ref } from 'vue';

export function useStore() {
    const isElectron = window.electronAPI && window.electronAPI.store;
    
    /**
     * Get value from store
     * Falls back to localStorage if not in Electron
     */
    const get = async (key, defaultValue = null) => {
        try {
            if (isElectron) {
                const value = await window.electronAPI.store.get(key);
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
            if (isElectron) {
                await window.electronAPI.store.set(key, value);
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
            if (isElectron) {
                await window.electronAPI.store.delete(key);
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
            if (isElectron) {
                return await window.electronAPI.store.getAll();
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
            if (isElectron) {
                await window.electronAPI.store.clear();
            } else {
                localStorage.clear();
            }
            return true;
        } catch (error) {
            console.error('Error clearing store:', error);
            return false;
        }
    };

    return {
        get,
        set,
        remove,
        getAll,
        clear,
        isElectron: ref(isElectron)
    };
}
