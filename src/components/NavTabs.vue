<script setup>
import { onBeforeUnmount, onMounted } from 'vue';
import { openNewTab, closeTab, activeTabIndex, activeTab, tabs, tabHistory, openTabs, markAsActive, isLastTabOnEmptyState, fileHasUnsavedChanges, handleElectronButtonClick, fileDataCache } from '../composables/useTabs';
import { Electron, toolbarPosition } from '../composables/useAppSettings.js';
import EmptyState from './EmptyState.vue';
import ToolItem from './ToolItem.vue';

const emit = defineEmits([
    'menu-item-click'
]);

const fileActions = [
    { label: 'Open File', action: () => emit('menu-item-click', 'openFile'), icon: 'folder-fill' },
    { label: 'Blank Page', action: () => emit('menu-item-click', 'openNewBlankPage'), icon: 'file-earmark-fill' },
]

const showDivider = (index) => {
    return activeTabIndex.value !== index && activeTabIndex.value !== index - 1 && index;
};

const electronButtons = [
    { action: 'fullscreen', icon: 'arrows-fullscreen', title: 'Fullscreen' },
    { action: 'minimize', icon: 'dash-lg', title: 'Minimize' },
    { action: 'maximize', icon: 'square', title: 'Maximize' },
    { action: 'close', icon: 'x-lg', title: 'Close' }
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
            fileDataCache.value = {
                type: 'file',
                data: fileData
            };
        });
    }
});

onBeforeUnmount(() => {
    unsubscribeFileOpen?.();
    unsubscribeFileOpen = null;
});
</script>
<template>
    <ul :class="`nav nav-tabs d-print-none fixed-${toolbarPosition} ${activeTab.emptyState ? 'empty-state' : ''}`" id="appTabs" role="tablist">
        <template v-for="(tab, index) in tabs" :key="tab">
            <template v-if="!tab.closed">
                <li class="vr bg-secondary" v-if="showDivider(index)"></li>
                <li class="nav-item" role="presentation">
                    <button class="nav-link" :class="{ active: index === activeTabIndex }" type="button" role="tab" @click="onTabClick(tab, index)">
                        <div class="d-flex align-items-center">
                            <div class="text-truncate flex-fill">
                                <span class="align-top fs-5 lh-1" v-if="fileHasUnsavedChanges(tab.id)">*</span>
                                {{ $t(tab.filename) }}
                            </div>
                            <i class="bi bi-x-lg" v-if="(index === activeTabIndex && !isLastTabOnEmptyState) || openTabs.length > 1" @click.stop.prevent="closeTab(index)" :title="$t('Close')"></i>
                        </div>
                    </button>
                </li>
            </template>
        </template>
        <li class="nav-item" role="presentation">
            <button class="nav-link nav-add" id="add-tab" type="button" role="tab" aria-selected="false" :disabled="isLastTabOnEmptyState" @click="openNewTab" :title="$t('New Tab')">
                <i class="bi bi-plus-lg"></i>
            </button>
        </li>
        <div :class="`btn-group position-absolute end-0 ${toolbarPosition}-0`" v-if="Electron">
            <template v-for="btn in electronButtons">
                <button :class="`btn btn-electron ${btn.action}`" type="button" role="tab" aria-selected="false" @click="handleElectronButtonClick(btn.action)" :title="$t(btn.title)">
                    <i :class="`bi bi-${btn.icon}`"></i>
                </button>
            </template>
        </div>
    </ul>
    <div class="tab-content" id="appTabContent">
        <template v-for="(tab, index) in tabs">
            <div class="tab-pane" :class="{ 'active show': index === activeTabIndex }" tabindex="0" v-if="!tab.closed">
                <empty-state v-if="tab.emptyState">
                    <div class="d-flex flex-column gap-2 align-items-start justify-content-start">
                        <template v-for="item in fileActions">
                            <ToolItem class="text-decoration-none" show-label v-bind="item" />
                        </template>
                    </div>
                </empty-state>
                <slot></slot>
            </div>
        </template>
    </div>
</template>
