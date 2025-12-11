<script setup>
import { ref, computed } from 'vue';
import { Electron } from '../composables/useElectron';
import { useHistory } from '../composables/useHistory';

const { hasUnsavedChanges } = useHistory();

const electronButtons = [
    { action: 'fullscreen', icon: 'bi-arrows-fullscreen', title: 'Fullscreen' },
    { action: 'minimize', icon: 'bi-dash-lg', title: 'Minimize' },
    { action: 'maximize', icon: 'bi-square', title: 'Maximize' },
    { action: 'close', icon: 'bi-x-lg', title: 'Close' }
];

const handleCloseIfHasUnsavedChanges = () => {
    if (!hasUnsavedChanges.value) return true;
    return confirm('You have unsaved changes. Are you sure you want to close the application?');
};

const handleElectronButtonClick = (action) => {
    if (!Electron.value) return;

    if (action === 'close' && !handleCloseIfHasUnsavedChanges()) return;
    Electron.value[action]();
};

const getDefaultTab = () => ({
    name: 'New Tab',
    default: true,
    closed: false
});

const tabs = ref([getDefaultTab()]);
const activeTabIndex = ref(0);

const activeTabs = computed(() => {
    return tabs.value.filter(tab => !tab.closed);
});

const isLastTabDefault = computed(() => {
    return tabs.value[tabs.value.length - 1].default;
});

const setCurrentTab = (filename) => {
    tabs.value[activeTabIndex.value] = {
        name: filename,
        default: false,
        closed: false
    };
};

const addDefaultTab = () => {
    tabs.value.push(getDefaultTab());
    activeTabIndex.value = tabs.value.length - 1;
};

const addNewTab = () => {
    if (isLastTabDefault.value) return;
    addDefaultTab();
};

const closeTab = (index) => {
    if (tabs.value[index] && handleCloseIfHasUnsavedChanges()) {
        const tab = tabs.value[index];

        if (tab.default) {
            tabs.value.splice(index, 1);
        } else {
            tab.closed = true;
        }

        const lastNotClosedIndex = tabs.value.findIndex((tab, i) => !tab.closed && i >= index);
        activeTabIndex.value = Math.max(0, lastNotClosedIndex);

        if (!activeTabs.value.length) {
            addDefaultTab();
        }
    }
};

defineExpose({
    setCurrentTab,
    closeTab
});
</script>
<template>
    <ul class="nav nav-tabs fixed-top pt-1" id="appTabs" role="tablist">
        <template v-for="(tab, index) in tabs" :key="tab">
            <li class="nav-item" role="presentation" v-if="!tab.closed">
                <button class="nav-link" :class="{ active: index === activeTabIndex }" type="button" role="tab" @click="activeTabIndex = index">
                    <div class="d-flex align-items-center">
                        <div class="text-truncate flex-fill">
                            {{ tab.name }}
                        </div>
                        <i class="bi bi-x-lg d-none d-lg-block" v-if="(index === activeTabIndex && !isLastTabDefault) || activeTabs.length > 1" @click.stop.prevent="closeTab(index)"></i>
                    </div>
                </button>
            </li>
        </template>
        <li class="nav-item d-none d-lg-block" role="presentation">
            <button class="nav-link nav-add" id="add-tab" type="button" role="tab" aria-selected="false" :disabled="isLastTabDefault" @click="addNewTab">
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
