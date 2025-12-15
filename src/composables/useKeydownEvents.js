import { onMounted, onUnmounted } from "vue";

export function useKeydownEvents(options = {}) {
    const handleKeydown = (event) => {
        const settings = options[event.key];
        
        if (!settings) return;

        const ctrlRequired = !!settings.ctrl || !!event.metaKey;
        const ctrlWithKeyPressed = !!settings.withKey && settings.withKey === event.key;

        if (ctrlRequired === !!settings.ctrl && ctrlWithKeyPressed) {
            if (ctrlRequired) event.preventDefault();
            settings.action(event);
        }
    };

    
    onMounted(() => window.addEventListener('keydown', handleKeydown));
    onUnmounted(() => window.removeEventListener('keydown', handleKeydown));
}