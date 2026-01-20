import { ref, watch } from "vue"
import { useStore } from "../composables/useStore"

const store = useStore();

// Import all language files using Vite's glob import
const langModules = import.meta.glob('../Lang/*.json')

export default {
    install: (app) => {
        const translations = ref({})
        
        // App Default Langueage
        const currentLocale = ref(document.documentElement.lang || 'en');

        store.get('userLocale', 'tr').then((locale) => {
            changeLocale(locale);
        });

        const getLangFile = async () => {
            if (Object.keys(translations.value?.[currentLocale.value] || {}).length) return;

            const langPath = `../Lang/${currentLocale.value}.json`
            const langModule = langModules[langPath]
            
            if (langModule) {
                const res = await langModule()
                translations.value[currentLocale.value] = res.default || res;
            } else {
                console.error(`Language file not found: ${langPath}`)
            }
        }

        // Load User Language File
        getLangFile();

        // Get Translation
        const get = (key) => {
            return translations.value?.[currentLocale.value]?.[key] || key;
        }

        // Translate Function
        const translate = (key) => {
            if (!key) return '';
            if (!isNaN(key)) return key;
            if (typeof key !== 'string') return '';

            // Remove Dashes
            key = key.replace(/[_]/g, ' ');
            
            if (key.indexOf('{') < 0) {
                return get(key);
            }
            
            // Keep & Translate Attributes
            var attributes = [];
            
            key = key.replace(/\{([^}]+)\}/g, (_match, group) => {
                attributes.push(get(group));
                return ':attribute';
            });

            // Replace Translated Attributes
            return get(key).replace(/:attribute/g, () => attributes.shift());
        }

        const changeLocale = (locale) => {
            currentLocale.value = locale;
            document.documentElement.lang = locale;
            store.set('userLocale', locale);
        }


        // Watch for Page Locale Changes
        watch(currentLocale, (locale) => {
            if (locale) {
                getLangFile();
            }
        });

        // Global Translation Function
        app.config.globalProperties.$t = (key) => translate(key);
        app.config.globalProperties.$currentLocale = currentLocale.value;

        app.provide('currentLocale', currentLocale)
        app.provide('translate', translate);
        app.provide('changeLocale', changeLocale)
    }
}