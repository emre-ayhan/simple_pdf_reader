import { onMounted, onUnmounted } from "vue";

export function useKeydownEvents(options = {}) {
    const keys = Object.keys(options);

    const handleKeydown = (event) => {
        const settings = options[event.key];
        
        if (!settings) return;
        if ((event.ctrlKey || event.metaKey) === !!settings.ctrl) {
            event.preventDefault();
            settings.action();
        }
    };

    
    onMounted(() => window.addEventListener('keydown', handleKeydown));
    onUnmounted(() => window.removeEventListener('keydown', handleKeydown));
}