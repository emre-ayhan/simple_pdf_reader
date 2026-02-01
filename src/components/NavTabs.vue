<script setup>
import { computed, inject, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { Electron } from '../composables/useElectron';
import { openNewTab, closeTab, activeTabIndex, activeTab, tabs, tabHistory, openTabs, markAsActive, isLastTabOnEmptyState, fileHasUnsavedChanges, activePageHasUnsavedChanges, handleElectronButtonClick, fileDataCache } from '../composables/useTabs';
import { enableTouchDrawing, toolbarPosition } from '../composables/useAppPreferences.js';

const currentLocale = inject('currentLocale');

const emit = defineEmits([
    'menu-item-click'
]);


const onMenuItemClick = (action, value) => {
    emit('menu-item-click', action, value);
};

const menuGroups = ['file', 'page', 'document', 'preferences'];
const documentGroups = ['page', 'document'];

const activeGroup = ref('file');

watch(activeTab, (newTab) => {
    if (newTab.emptyState) {
        activeGroup.value = 'file';
        return;
    }

    activeGroup.value = 'page';
}, { immediate: true });
const menuItems = computed(() => ({
    file: [
        { label: 'New Blank Page', action: 'openNewBlankPage', icon: 'pencil-square' },
        { label: 'Open', action: 'openFile', icon: 'folder', shortcut: 'Ctrl+O' },
        { label: 'Save', action: 'saveFile', icon: 'floppy', shortcut: 'Ctrl+S', disabled: !activePageHasUnsavedChanges.value },
    ],
    page: [
        { label: 'Rotate Clockwise', action: 'rotateClockwise', icon: 'arrow-clockwise' },
        { label: 'Rotate Counterclockwise', action: 'rotateCounterClockwise', icon: 'arrow-counterclockwise' },
        { label: 'Import From Clipboard', action: 'insertFromClipboard', icon: 'clipboard-plus' },
        { label: 'Insert Page After', action: 'insertBlankPage', icon: 'file-earmark-arrow-down' },
        { label: 'Delete', action: 'deletePage', icon: 'trash3' }
    ],
    document: [
        { label: 'First Page', action: 'scrollToFirstPage', icon: 'chevron-double-up', shortcut: 'Home' },
        { label: 'Last Page', action: 'scrollToLastPage', icon: 'chevron-double-down', shortcut: 'End' },
        { label: 'Print', action: 'printPage', icon: 'printer', shortcut: 'Ctrl+P' },
        { label: 'Properties', action: 'showDocumentProperties', icon: 'info-circle' }
    ],
    preferences: [
        { label: 'Language', icon: 'translate', items: [
                { label: 'English', action: 'changeLocale', value: 'en', icon: currentLocale.value === 'en' ? 'check-circle-fill' : 'circle' },
                { label: 'Portuguese', action: 'changeLocale', value: 'pt', icon: currentLocale.value === 'pt' ? 'check-circle-fill' : 'circle' },
                { label: 'Turkish', action: 'changeLocale', value: 'tr', icon: currentLocale.value === 'tr' ? 'check-circle-fill' : 'circle' },
            ]
        },
        { label: enableTouchDrawing.value ? 'Disable Touch Drawing' : 'Enable Touch Drawing', action: 'toggleTouchDrawing', icon: enableTouchDrawing.value ? 'hand-index-thumb-fill' : 'hand-index-thumb' },
        { label: `Move Toolbar to ${toolbarPosition.value === 'top' ? 'Bottom' : 'Top'}`, action: 'toggleToolbarPosition', icon: toolbarPosition.value === 'top' ? 'arrow-down-square' : 'arrow-up-square' },
    ]
}));

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
        <!-- Nav Menu -->
        <li class="nav-item">
            <a href="#" class="nav-link nav-link-menu" data-bs-toggle="offcanvas" data-bs-target="#offcanvasExample" aria-controls="offcanvasExample" :title="$t('Menu')">
                {{ $t('Menu') }}
            </a>
        </li>
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
        <li class="vr bg-secondary" v-if="activeTabIndex !== tabs.length - 1"></li>
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
                <slot></slot>
            </div>
        </template>
    </div>
    <div class="offcanvas offcanvas-start" tabindex="-1" id="offcanvasExample" aria-labelledby="offcanvasExampleLabel">
        <div class="offcanvas-header">
            <h4 class="offcanvas-title text-primary" id="offcanvasExampleLabel">
                <i class="bi bi-file-earmark-pdf-fill"></i>
                Simple PDF Reader
            </h4>
            <button type="button" class="btn-close" data-bs-dismiss="offcanvas" aria-label="Close"></button>
        </div>
        <div class="offcanvas-body">
            <div class="d-flex">
                <ul class="nav flex-column">
                    <li class="nav-item" v-for="group in menuGroups" :key="group">
                        <a href="#" class="nav-link text-capitalize" :class="{ active: activeGroup === group, 'text-secondary': activeGroup !== group }" @click.prevent="activeGroup = group">
                            {{ $t(group) }}
                        </a>
                    </li>
                </ul>
                <div class="vr me-2"></div>
                <div class="list-group list-group-flush small flex-fill">
                    <template v-for="item in menuItems[activeGroup]">
                        <a class="list-group-item list-group-item-action" data-bs-dismiss="offcanvas" :class="{ disabled: activeTab.emptyState && documentGroups.includes(activeGroup) || item.disabled }" href="#" @click.prevent="onMenuItemClick(item.action, item.value)" v-if="!item.items">
                            <i :class="`bi bi-${item.icon} me-1`"></i>
                            {{ $t(item.label) }} <span v-if="item.shortcut">({{ item.shortcut }})</span>
                        </a>
                        <template v-else>
                            <button class="list-group-item list-group-item-action" type="button"  data-bs-toggle="collapse" :data-bs-target="`#submenu_${menuItemIndex}`" aria-expanded="false" :aria-controls="`submenu_${menuItemIndex}`">
                                <i :class="`bi bi-${item.icon} me-1`"></i>
                                {{ $t(item.label) }}
                                <i class="bi bi-caret-down-fill small"></i>
                            </button>
                            <div class="collapse small ps-3 pt-1" :id="`submenu_${menuItemIndex}`">
                                <template v-for="subItem in item.items">
                                    <a class="list-group-item list-group-item-action" :class="{ disabled: activeTab.emptyState && documentGroups.includes(activeGroup) || subItem.disabled }" href="#" @click.prevent="onMenuItemClick(subItem.action, subItem.value)">
                                        <i :class="`bi bi-${subItem.icon} me-1`"></i>
                                        {{ $t(subItem.label) }} <span v-if="subItem.shortcut">({{ subItem.shortcut }})</span>
                                    </a>
                                </template>
                            </div>
                        </template>
                    </template>
                </div>
            </div>
        </div>
    </div>
</template>
