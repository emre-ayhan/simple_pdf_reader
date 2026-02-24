import { ref, watch } from "vue";
import { useStore } from "./useStore";

const store = useStore();
const enableTouchDrawing = ref(false);
const moveToolbarBottom = ref(false);
const toolbarPosition = ref('top');
const currentLocale = ref('en');
const availableLocales = ref([{
    text: 'English',
    locale: 'en'
}, {
    text: 'Türkçe',
    locale: 'tr'
}])

// Load preferences from store
store.get('appPreferences', false).then(preferences => {
    enableTouchDrawing.value = preferences?.enableTouchDrawing ?? false;
    toolbarPosition.value = preferences?.toolbarPosition ?? 'top';
    currentLocale.value = preferences?.currentLocale ?? 'en';
});

const storePreferences = () => {
    store.set('appPreferences', {
        enableTouchDrawing: enableTouchDrawing.value,
        toolbarPosition: toolbarPosition.value,
        currentLocale: currentLocale.value
    });
}

watch(enableTouchDrawing, (value) => {
    storePreferences();
});

watch(moveToolbarBottom, (value) => {
    toolbarPosition.value = value ? 'bottom' : 'top';
    storePreferences();
})


const changeLocale = (locale) => {
    currentLocale.value = locale;
    storePreferences();
}

export {
    toolbarPosition,
    enableTouchDrawing,
    moveToolbarBottom,
    currentLocale,
    availableLocales,
    changeLocale
}