import { onMounted, onUnmounted } from "vue";
import { useHistory } from "./useHistory";

const { activeSessionId } = useHistory();

export function useWindowEvents(fileId, eventSettings = {}) {
    const handlers = {
        keydown(event, options) {
            if (activeSessionId.value !== fileId) return;
            if (Object.keys(options).length === 0) return;
            const settings = options[event.key];

            if (!settings) return;

            const isCtrlPressed = event.ctrlKey || event.metaKey;
            if (settings.actionAll) {
                settings.actionAll(event, isCtrlPressed);
                return;
            }

            if (!!settings.ctrl === isCtrlPressed) {
                if (!!settings.ctrl) {
                    event.preventDefault()
                };

                settings.action(event);
            }
        }
    }

    
    const registerEvents = (mode) => {
        const events = Object.keys(eventSettings);

        for (let i = 0; i < events.length; i++) {
            const event = events[i];
            const options = eventSettings[event];
            const handler = handlers[event] || options?.action || null;
            
            if (handler) {
                window[`${mode}EventListener`](event, (e) => {
                    handler(e, options);
                }) 
            };
        }
    }

    onMounted(() => registerEvents('add'));
    onUnmounted(() => registerEvents('remove'));
}