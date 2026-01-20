import { ref } from "vue";
import { useStore } from "./useStore";

const store = useStore();
const enableTouchDrawing = ref(false);

store.get('enableTouchDrawing', false).then(value => {
    enableTouchDrawing.value = value;
});

const toggleTouchDrawing = () => {
    enableTouchDrawing.value = !enableTouchDrawing.value;
    store.set('enableTouchDrawing', enableTouchDrawing.value);
}

export {
    enableTouchDrawing,
    toggleTouchDrawing,
}