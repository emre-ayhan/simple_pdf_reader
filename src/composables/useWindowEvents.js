import { onMounted, onUnmounted } from "vue";

export function useWindowEvents(eventOptions = {}) {
    const handlers = {
        keydown(event, options) {
            if (Object.keys(options).length === 0) return;
            const settings = options[event.key];

            if (!settings) return;

            if (!!settings.ctrl === (event.ctrlKey || event.metaKey)) {
                if (!!settings.ctrl) {
                    event.preventDefault()
                };

                settings.action(event);
            }
        },
        resize(event, options) {
            options.action();
        }
    }

    const events = Object.keys(eventOptions);

    onMounted(() => {
        for (let i = 0; i < events.length; i++) {
            const event = events[i];
            
            if (handlers[event]) {
                window.addEventListener(event, (e) => {
                    handlers[event](e, eventOptions[event]);
                }) 
            };
        }
    });

    onUnmounted(() => {
        for (let i = 0; i < events.length; i++) {
            const event = events[i];
            if (handlers[event]) {
                window.removeEventListener(event, (e) => {
                    handlers[event](e, eventOptions[event]);
                }) 
            };
        }
    });
}