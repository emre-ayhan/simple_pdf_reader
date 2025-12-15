import { onMounted, onUnmounted } from "vue";

export function useKeydownEvents(options = {}) {
    const handleKeydown = (event) => {
        const settings = options[event.key];

        if (!settings) return;

        if (!!settings.ctrl === (event.ctrlKey || event.metaKey)) {
            if (!!settings.ctrl) {
                event.preventDefault()
            };

            settings.action(event);
        }
    };

    
    onMounted(() => window.addEventListener('keydown', handleKeydown));
    onUnmounted(() => window.removeEventListener('keydown', handleKeydown));
}