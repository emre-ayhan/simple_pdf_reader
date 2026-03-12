import { ref, watch, computed } from "vue";
import { useStore } from "./useStore";

const Electron = computed(() => window.electronAPI);

const store = useStore();

// Preferences

const enableTouchDrawing = ref(false);
const moveToolbarBottom = ref(false);
const toolbarPosition = ref('top');
const reverseToolbarPosition = computed(() => toolbarPosition.value === 'top' ? 'bottom' : 'top');
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

// Helpers
const changeLocale = (locale) => {
    currentLocale.value = locale;
    storePreferences();
}

const uuid  = () => {
    return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
        (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
    );
}

const COMMENT_ICON_DEFAULT_COLOR = '#E30A17';
const STROKE_ICON_DEFAULT_SIZE = 32;
const copiedStrokes = ref([]); // For multi-selection copy
const copiedStroke = ref(null);

const copyAsStroke = (stroke) => {
    if (!stroke) return;

    copiedStroke.value = stroke;

    if (copiedStrokes.value.length > 10) {
        copiedStrokes.value.shift();
    }

    copiedStrokes.value.push(copiedStroke.value);
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
    Electron,
    toolbarPosition,
    reverseToolbarPosition,
    enableTouchDrawing,
    moveToolbarBottom,
    currentLocale,
    availableLocales,
    COMMENT_ICON_DEFAULT_COLOR,
    STROKE_ICON_DEFAULT_SIZE,
    copiedStrokes,
    copiedStroke,
    copyAsStroke,
    changeLocale,
    uuid,
    retrieveClipboardData,
}