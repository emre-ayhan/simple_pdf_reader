<script setup>
import { onMounted } from 'vue';
import { Electron } from '../composables/useElectron';
import { openNewTab, closeTab, activeTabIndex, tabs, tabHistory, openTabs, markAsActive, isLastTabOnEmptyState, fileHasUnsavedChanges, handleElectronButtonClick, fileDataCache } from '../composables/useTabs';

const electronButtons = [
    { action: 'fullscreen', icon: 'bi-arrows-fullscreen', title: 'Fullscreen' },
    { action: 'minimize', icon: 'bi-dash-lg', title: 'Minimize' },
    { action: 'maximize', icon: 'bi-square', title: 'Maximize' },
    { action: 'close', icon: 'bi-x-lg', title: 'Close' }
];

const onTabClick = (tab, index) => {
    activeTabIndex.value = index;
    tabHistory.value.push(index);
    markAsActive(tab.id);
};

let unsubscribeFileOpen = null;

onMounted(() => {
    if (Electron.value?.onFileOpened) {
        unsubscribeFileOpen = Electron.value.onFileOpened((fileData) => {
            if (!fileData) return;
            if (isLastTabOnEmptyState.value) return;
            openNewTab();
            fileDataCache.value = fileData;
        });
    }
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
