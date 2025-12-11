import { ref, markRaw, computed } from 'vue';

const history = ref([]);
const historyStep = ref(-1);
const savedHistoryStep = ref(-1);
const hasUnsavedChanges = computed(() => {
    return historyStep.value !== savedHistoryStep.value;
});

export function useHistory() {

    const addToHistory = (action) => {
        if (historyStep.value < history.value.length - 1) {
            // If we are branching off and the saved state is in the future (or overwritten), invalidate it
            if (savedHistoryStep.value > historyStep.value) {
                savedHistoryStep.value = -2;
            }
            history.value = history.value.slice(0, historyStep.value + 1);
        }
        history.value.push(markRaw(action));
        historyStep.value++;
    };

    const canUndo = computed(() => historyStep.value >= 0);
    const canRedo = computed(() => historyStep.value < history.value.length - 1);

    const undo = (handler) => {
        if (!canUndo.value) return;
        
        const action = history.value[historyStep.value];
        if (handler) {
            handler(action);
        }
        
        historyStep.value--;
    };

    const redo = (handler) => {
        if (!canRedo.value) return;
        
        historyStep.value++;
        const action = history.value[historyStep.value];
        if (handler) {
            handler(action);
        }
    };

    const resetHistory = () => {
        history.value = [];
        historyStep.value = -1;
        savedHistoryStep.value = -1;
    };

    const markSaved = () => {
        savedHistoryStep.value = historyStep.value;
    };

    return {
        history,
        historyStep,
        savedHistoryStep,
        addToHistory,
        undo,
        redo,
        canUndo,
        canRedo,
        hasUnsavedChanges,
        resetHistory,
        markSaved
    };
}
