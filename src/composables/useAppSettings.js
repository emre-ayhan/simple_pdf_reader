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

const retrieveClipboardData = async () => {
    try {
        const clipboardItems = await navigator.clipboard.read();
        for (const item of clipboardItems) {
            const imageType = item.types.find(type => type.startsWith('image/'));
            if (imageType) {
                const blob = await item.getType(imageType);
                const reader = new FileReader();
                reader.onload = (e) => {
                    const dataUrl = e.target.result;
                    const img = new Image();
                    img.onload = () => {
                        const stroke = {
                            inserted: 0,
                            stroke: [{
                                type: 'image',
                                x: 0,
                                y: 0,
                                width: img.width,
                                height: img.height,
                                imageData: dataUrl
                            }]
                        };

                        const isCoppied = copiedStrokes.value.findIndex(s => s.stroke[0]?.imageData === dataUrl);

                        if (isCoppied !== -1) return;

                        copyAsStroke(stroke);
                    };
                    img.src = dataUrl;
                };
                reader.readAsDataURL(blob);
                return;
            }
        }
    } catch (err) {
        console.error('Failed to get from clipboard:', err);
    }
}

export {
    toolbarPosition,
    enableTouchDrawing,
    moveToolbarBottom,
    currentLocale,
    availableLocales,
    changeLocale,
    retrieveClipboardData,
}