import { ref, markRaw, computed } from 'vue';

const sessions = ref({});

const markAsActive = (fileId) => {
    if (sessions.value[fileId]) {
        const activeSession = Object.values(sessions.value).find(session => session.active);
        if (activeSession) {
            activeSession.active = false;
        }

        sessions.value[fileId].active = true;
    }
}

const activeSessionId = computed(() => {
    return Object.values(sessions.value).find(session => session.active)?.id || null;
});

export function useHistory(fileId, historyUpdateCallback) {
    // Allow global-only access when called without args
    if (fileId === undefined || fileId === null) {
        return {
            activeSessionId,
            sessions,
            markAsActive
        };
    }

    const history = ref([]);
    const historyStep = ref(-1);
    const savedHistoryStep = ref(-1);

    const startSession = () => {
        if (!sessions.value[fileId]) {
            sessions.value[fileId] = {
                id: fileId,
                active: false,
                history,
                historyStep,
                savedHistoryStep
            };
            markAsActive(fileId);
        }
    };

    const endSession = () => {
        if (sessions.value[fileId]) {
            delete sessions.value[fileId];
        }
    };

    const addToHistory = (action) => {
        const normalizeAction = (act) => {
            const cloned = { ...act };
            if (act.stroke) cloned.stroke = JSON.parse(JSON.stringify(act.stroke));
            if (act.previousStroke) cloned.previousStroke = JSON.parse(JSON.stringify(act.previousStroke));
            if (Array.isArray(act.strokes)) {
                cloned.strokes = act.strokes.map(item => ({ index: item.index, data: JSON.parse(JSON.stringify(item.data)) }));
            }
            return cloned;
        };

        if (historyStep.value < history.value.length - 1) {
            if (savedHistoryStep.value > historyStep.value) {
                savedHistoryStep.value = -2;
            }
            history.value = history.value.slice(0, historyStep.value + 1);
        }
        history.value.push(markRaw(normalizeAction(action)));
        historyStep.value++;
    };

    const canUndo = computed(() => historyStep.value >= 0);

    const canRedo = computed(() => {
        return historyStep.value < history.value.length - 1;
    });

    const undo = () => {
        if (!canUndo.value) return;

        const action = history.value[historyStep.value];
        const page = action.page;

        if (action.type === 'add') {
            const strokes = page.strokes || [];

            if (strokes) {
                const targetId = action.id || action.strokeId || (action.stroke && action.stroke[0] && action.stroke[0].id);
                let index = -1;
                if (targetId) index = strokes.findIndex(stroke => stroke && stroke[0] && stroke[0].id === targetId);
                if (index === -1 && action.stroke) {
                    const actionSerialized = JSON.stringify(action.stroke);
                    index = strokes.findIndex(stroke => JSON.stringify(stroke) === actionSerialized);
                }
                if (index > -1) {
                    strokes.splice(index, 1);
                }
            }
            if (page != null) historyUpdateCallback(page);
        } else if (action.type === 'erase') {
            const strokes = page.strokes;
            if (strokes) {
                const toRestore = [...action.strokes].sort((a, b) => a.index - b.index);
                toRestore.forEach(item => { strokes.splice(item.index, 0, item.data); });
            }
            if (page != null) historyUpdateCallback(page);
        } else if (action.type === 'move') {
            if (action.previousStroke) {
                const strokes = page.strokes;
                if (strokes && strokes[action.strokeIndex]) {
                    strokes[action.strokeIndex] = JSON.parse(JSON.stringify(action.previousStroke));
                }
                if (page != null) historyUpdateCallback(page);
            }
        } else if (action.type === 'comment-edit') {
            if (action.previousStroke) {
                const strokes = page.strokes;
                if (strokes && strokes[action.strokeIndex]) {
                    strokes[action.strokeIndex] = JSON.parse(JSON.stringify(action.previousStroke));
                }
                if (page != null) historyUpdateCallback(page);
            }
        } else if (action.type === 'rotate') {
            if (action.previousStroke) {
                const strokes = page.strokes;
                if (strokes) {
                    let idx = action.strokeIndex;
                    const prevId = action.previousStroke[0] && action.previousStroke[0].id;
                    if ((!strokes[idx] || !strokes[idx][0] || strokes[idx][0].id !== prevId) && prevId) {
                        idx = strokes.findIndex(s => s && s[0] && s[0].id === prevId);
                    }
                    if (idx > -1 && strokes[idx]) {
                        strokes[idx] = JSON.parse(JSON.stringify(action.previousStroke));
                    }
                }
                if (page != null) historyUpdateCallback(page);
            }
        } else if (action.type === 'color-change') {
            if (action.previousStroke) {
                const strokes = page.strokes;
                if (strokes && strokes[action.strokeIndex]) {
                    strokes[action.strokeIndex] = JSON.parse(JSON.stringify(action.previousStroke));
                }
                if (page != null) historyUpdateCallback(page);
            }
        } else if (action.type === 'resize') {
            if (action.previousStroke) {
                const strokes = page.strokes;
                if (strokes && strokes[action.strokeIndex]) {
                    strokes[action.strokeIndex] = JSON.parse(JSON.stringify(action.previousStroke));
                }
                if (page != null) historyUpdateCallback(page);
            }
        } else if (action.type === 'delete-page') {
            action.page.deleted = false;
        }

        historyStep.value--;
    };

    const redo = () => {
        if (!canRedo.value) return;

        historyStep.value++;
        const action = history.value[historyStep.value];

        const page = action.page;

        if (action.type === 'add') {
            if (page == null) return;
            if (!page.strokes) page.strokes = [];
            page.strokes.push(action.stroke);
            historyUpdateCallback(page);
        } else if (action.type === 'erase') {
            const strokes = page.strokes;
            if (strokes) {
                action.strokes.forEach(item => {
                    const index = strokes.indexOf(item.data);
                    if (index > -1) { strokes.splice(index, 1); }
                });
            }
            if (page != null) historyUpdateCallback(page);
        } else if (action.type === 'move') {
            const strokes = page.strokes;
            if (strokes && strokes[action.strokeIndex]) {
                strokes[action.strokeIndex] = JSON.parse(JSON.stringify(action.stroke));
            }
            if (page != null) historyUpdateCallback(page);
        } else if (action.type === 'comment-edit') {
            const strokes = page.strokes;
            if (strokes && strokes[action.strokeIndex]) {
                strokes[action.strokeIndex] = JSON.parse(JSON.stringify(action.stroke));
            }
            if (page != null) historyUpdateCallback(page);
        } else if (action.type === 'rotate') {
            const strokes = page.strokes;
            if (strokes) {
                let idx = action.strokeIndex;
                const targetId = (action.stroke && action.stroke[0] && action.stroke[0].id) || action.id || action.strokeId;
                if ((!strokes[idx] || !strokes[idx][0] || strokes[idx][0].id !== targetId) && targetId) {
                    idx = strokes.findIndex(s => s && s[0] && s[0].id === targetId);
                }
                if (idx > -1 && strokes[idx]) {
                    strokes[idx] = JSON.parse(JSON.stringify(action.stroke));
                }
            }
            if (page != null) historyUpdateCallback(page);
        } else if (action.type === 'color-change') {
            const strokes = page.strokes;
            if (strokes && strokes[action.strokeIndex]) {
                strokes[action.strokeIndex] = JSON.parse(JSON.stringify(action.stroke));
            }
            if (page != null) historyUpdateCallback(page);
        } else if (action.type === 'resize') {
            const strokes = page.strokes;
            if (strokes && strokes[action.strokeIndex]) {
                strokes[action.strokeIndex] = JSON.parse(JSON.stringify(action.stroke));
            }
            if (page != null) historyUpdateCallback(page);
        }  else if (action.type === 'delete-page') {
            action.page.deleted = true;
        }
    };

    const resetHistory = () => {
        history.value = [];
        historyStep.value = -1;
        savedHistoryStep.value = -1;
    };

    const saveCurrentHistoryStep = () => { savedHistoryStep.value = historyStep.value; };

    const hasUnsavedChanges = computed(() => historyStep.value !== savedHistoryStep.value);

    return {
        activeSessionId,
        startSession,
        endSession,
        fileId,
        sessions,
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
        saveCurrentHistoryStep,
        markAsActive
    };
}
