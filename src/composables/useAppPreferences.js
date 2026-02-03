import { ref } from "vue";
import { useStore } from "./useStore";

const store = useStore();
const enableTouchDrawing = ref(false);
const toolbarPosition = ref('top');
const currentLocale = ref('en');

// Load preferences from store
store.get('appPreferences', false).then(preferences => {
    enableTouchDrawing.value = preferences?.enableTouchDrawing ?? false;
    toolbarPosition.value = preferences?.toolbarPosition ?? 'top';
    currentLocale.value = preferences?.currentLocale ?? 'en';
});

const setStore = () => {
    store.set('appPreferences', {
        enableTouchDrawing: enableTouchDrawing.value,
        toolbarPosition: toolbarPosition.value,
        currentLocale: currentLocale.value
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

const changeLocale = (locale) => {
    currentLocale.value = locale;
    setStore();
}

export {
    toolbarPosition,
    enableTouchDrawing,
    currentLocale,
    toggleTouchDrawing,
    toggleToolbarPosition,
    changeLocale
}