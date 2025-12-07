<script setup>
import { ref, computed } from 'vue';

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
    if (tabs.value[index]) {
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
                            <i class="bi bi-x-lg" v-if="index === activeTabIndex && !isLastTabDefault" @click.stop.prevent="closeTab(index)"></i>
                        </div>
                    </button>
                </li>
            </template>
            <li class="nav-item" role="presentation">
                <button class="nav-link nav-add" id="add-tab" type="button" role="tab" aria-selected="false" :disabled="isLastTabDefault" @click="addNewTab">
                    <i class="bi bi-plus-lg"></i>
                </button>
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
<style>
body, #app, .container-fluid {
    margin: 0;
    padding: 0;
    overflow: hidden;
}


.nav-tabs {
    background: linear-gradient(145deg, #0f172a 0%, #0a1b2b 55%, #0b2538 100%);
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.nav-tabs, .nav-tabs .nav-item {
    border: 0 !important;
    margin: 0 !important;
    font-size: small !important;
}

.nav-add:disabled {
    color: var(--bs-secondary) !important;
}

.nav-tabs .nav-link:not(.nav-add) {
    width: 200px !important;
}
.nav-tabs .nav-link {
    border-top-left-radius: var(--bs-border-radius-lg) !important;
    border-top-right-radius: var(--bs-border-radius-lg) !important;
    color: var(--bs-secondary);
    padding: .25rem .75rem;
    border-bottom: 0 !important;
}

.nav-tabs .nav-link:hover,
.nav-tabs .nav-link:active {
    color: #7dd3fc !important;
}

.nav-tabs .nav-link.active {
    background-color: transparent !important;
    color: #7dd3fc !important;
    border-color: #7dd3fc !important;
}
</style>