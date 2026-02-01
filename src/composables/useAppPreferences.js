import { ref } from "vue";
import { useStore } from "./useStore";

const store = useStore();
const enableTouchDrawing = ref(false);
const toolbarPosition = ref('top');

store.get('appPreferences', false).then(preferences => {
    enableTouchDrawing.value = preferences?.enableTouchDrawing ?? false;
    toolbarPosition.value = preferences?.toolbarPosition ?? 'top';
});

const setStore = () => {
    store.set('appPreferences', {
        enableTouchDrawing: enableTouchDrawing.value,
        toolbarPosition: toolbarPosition.value
    });
}

const toggleTouchDrawing = () => {
    enableTouchDrawing.value = !enableTouchDrawing.value;
    setStore();
}

const toggleToolbarPosition = () => {
    const newPosition = toolbarPosition.value === 'top' ? 'bottom' : 'top';
    toolbarPosition.value = newPosition;
    setStore();
}

export {
    toolbarPosition,
    enableTouchDrawing,
    toggleTouchDrawing,
    toggleToolbarPosition
}