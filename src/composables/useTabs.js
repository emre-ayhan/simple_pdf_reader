import { ref, computed } from 'vue';
import { showModal } from '../composables/useModal';
import { Electron } from './useElectron';
import { useHistory } from './useHistory';

const getEmptyStateTab = () => ({
    filename: 'New Tab',
    emptyState: true,
    closed: false
});

const fileDataCache = ref(null);
const tabHistory = ref([0]);
const tabs = ref([getEmptyStateTab()]);
const activeTabIndex = ref(0);

const activeTab = computed(() => {
    return tabs.value[activeTabIndex.value];
});

const openTabs = computed(() => {
    return tabs.value.filter(tab => !tab.closed);
});

const isLastTabOnEmptyState = computed(() => {
    return tabs.value[tabs.value.length - 1].emptyState;
});

const { sessions, markAsActive } = useHistory();

const fileHasUnsavedChanges = (fileId) => {
    const session = sessions.value[fileId];

    if (!session) return false;
    return session.historyStep !== session.savedHistoryStep;
}

const setCurrentTab = (fileData) => {
    tabs.value[activeTabIndex.value] = {
        ...fileData,
        emptyState: false,
        closed: false
    };
};

const openEmptyStateTab = () => {
    tabs.value.push(getEmptyStateTab());
    activeTabIndex.value = tabs.value.length - 1;
};

const openNewTab = () => {
    if (isLastTabOnEmptyState.value) return;
    tabHistory.value.push(tabs.value.length);
    openEmptyStateTab();
};

const closeTab = async (index) => {
    const tab = tabs.value[index];

    if (tab) {
        if (fileHasUnsavedChanges(tab.id)) {
            const confirmed = await showModal('You have unsaved changes in this tab. Are you sure you want to close it?', true);
            if (!confirmed) return;
        };

        if (tab.emptyState) {
            tabs.value.splice(index, 1);
        } else {
            tab.closed = true;
        }

        if (activeTabIndex.value != index) return;

        // Remove closed tab from history
        tabHistory.value = tabHistory.value.filter(i => i !== index);

        // Set active tab to last in history that is not closed
        const lastOpenTabIndex = tabHistory.value[tabHistory.value.length - 1];
        activeTabIndex.value = lastOpenTabIndex > -1 && !tabs.value[lastOpenTabIndex].closed
            ? lastOpenTabIndex
            : tabs.value.findIndex(tab => !tab.closed);

        if (!openTabs.value.length) {
            openEmptyStateTab();
        }

    }
};

const handleElectronButtonClick = async (action) => {
    if (!Electron.value) return;

    if (action === 'close' && openTabs.value.filter(tab => fileHasUnsavedChanges(tab.id)).length) {
        const confirmed = await showModal('You have unsaved changes in one or more tabs. Are you sure you want to close the application?', true);
        if (!confirmed) return;
    };

    Electron.value[action]();
};

export {
    setCurrentTab,
    openNewTab,
    closeTab,
    tabs,
    activeTabIndex,
    activeTab,
    openEmptyStateTab,
    tabHistory,
    openTabs,
    isLastTabOnEmptyState,
    fileHasUnsavedChanges,
    handleElectronButtonClick,
    markAsActive,
    fileDataCache
};