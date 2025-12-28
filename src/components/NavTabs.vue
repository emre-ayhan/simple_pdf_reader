<script setup>
import { ref, computed } from 'vue';
import { Electron } from '../composables/useElectron';
import { useHistory } from '../composables/useHistory';

const { sessions, markAsActive } = useHistory();

const fileHasUnsavedChanges = (fileId) => {
    const session = sessions.value[fileId];

    if (!session) return false;
    return session.historyStep !== session.savedHistoryStep;
}

const electronButtons = [
    { action: 'fullscreen', icon: 'bi-arrows-fullscreen', title: 'Fullscreen' },
    { action: 'minimize', icon: 'bi-dash-lg', title: 'Minimize' },
    { action: 'maximize', icon: 'bi-square', title: 'Maximize' },
    { action: 'close', icon: 'bi-x-lg', title: 'Close' }
];

const getEmptyStateTab = () => ({
    filename: 'New Tab',
    emptyState: true,
    closed: false
});

const tabHistory = ref([0]);
const tabs = ref([getEmptyStateTab()]);
const activeTabIndex = ref(0);

const openTabs = computed(() => {
    return tabs.value.filter(tab => !tab.closed);
});

const onTabClick = (tab, index) => {
    activeTabIndex.value = index;
    tabHistory.value.push(index);
    markAsActive(tab.id);
};

const handleElectronButtonClick = (action) => {
    if (!Electron.value) return;

    if (action === 'close' && openTabs.value.filter(tab => fileHasUnsavedChanges(tab.id)).length && !confirm('You have unsaved changes in one or more tabs. Are you sure you want to close the application?')) return;
    Electron.value[action]();
};

const isLastTabOnEmptyState = computed(() => {
    return tabs.value[tabs.value.length - 1].emptyState;
});

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

const closeTab = (index) => {
    const tab = tabs.value[index];

    if (tab) {
        if (fileHasUnsavedChanges(tab.id) && !confirm('You have unsaved changes. Are you sure you want to close this tab?')) return;

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

defineExpose({
    setCurrentTab
});
</script>
<template>
    <ul class="nav nav-tabs fixed-top pt-1" id="appTabs" role="tablist">
        <template v-for="(tab, index) in tabs" :key="tab">
            <li class="nav-item" role="presentation" v-if="!tab.closed">
                <button class="nav-link" :class="{ active: index === activeTabIndex }" type="button" role="tab" @click="onTabClick(tab, index)">
                    <div class="d-flex align-items-center">
                        <div class="text-truncate flex-fill">
                            <span class="align-top fs-5 lh-1" v-if="fileHasUnsavedChanges(tab.id)">*</span>
                            {{ tab.filename }}
                        </div>
                        <i class="bi bi-x-lg d-none d-lg-block" v-if="(index === activeTabIndex && !isLastTabOnEmptyState) || openTabs.length > 1" @click.stop.prevent="closeTab(index)"></i>
                    </div>
                </button>
            </li>
        </template>
        <li class="nav-item d-none d-lg-block" role="presentation">
            <button class="nav-link nav-add" id="add-tab" type="button" role="tab" aria-selected="false" :disabled="isLastTabOnEmptyState" @click="openNewTab">
                <i class="bi bi-plus-lg"></i>
            </button>
        </li>
        <li class="ms-auto me-1" v-if="Electron">
            <div class="btn-group btn-group-sm">
                <template v-for="btn in electronButtons">
                    <button :class="`btn btn-electron ${btn.action}`" type="button" role="tab" aria-selected="false" @click="handleElectronButtonClick(btn.action)" :title="btn.title">
                        <i :class="btn.icon"></i>
                    </button>
                </template>
            </div>
        </li>
    </ul>
    <div class="tab-content" id="appTabContent">
        <template v-for="(tab, index) in tabs">
            <div class="tab-pane" :class="{ 'active show': index === activeTabIndex }" tabindex="0" v-if="!tab.closed">
                <slot></slot>
            </div>
        </template>
    </div>
</template>
