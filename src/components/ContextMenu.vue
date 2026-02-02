<script setup>
import { onMounted, onUnmounted, ref, nextTick } from 'vue';

const props = defineProps({
    parent: {
        type: String,
        required: true
    }
});

const show = ref(false);
const menuRef = ref(null);

const style = ref({
    top: 0,
    left: 0
});

const handleContextMenu = async (event) => {
    event.preventDefault();
    event.stopPropagation();

    if (event.type === 'click') {
        show.value = false;
        return;
    }

    show.value = true;

    // Wait for the menu to render
    await nextTick();

    const parentEl = document.querySelector(props.parent);
    const menuEl = menuRef.value;

    if (!parentEl || !menuEl) {
        style.value = {
            top: `${event.clientY}px`,
            left: `${event.clientX}px`
        };
        return;
    }

    const parentRect = parentEl.getBoundingClientRect();
    const menuRect = menuEl.getBoundingClientRect();

    let top = event.clientY;
    let left = event.clientX;

    // Check if menu overflows bottom
    if (top + menuRect.height > parentRect.bottom) {
        top = parentRect.bottom - menuRect.height;
    }

    // Check if menu overflows top
    if (top < parentRect.top) {
        top = parentRect.top;
    }

    // Check if menu overflows right
    if (left + menuRect.width > parentRect.right) {
        left = parentRect.right - menuRect.width;
    }

    // Check if menu overflows left
    if (left < parentRect.left) {
        left = parentRect.left;
    }

    style.value = {
        top: `${top}px`,
        left: `${left}px`
    };
};

const groups = {
    // Define your context menu items here
    view: [
        { label: 'Lock View', action: 'lockView', icon: 'lock' },
        { label: 'Zoom In', action: 'zoomIn', icon: 'zoom-in' },
        { label: 'Zoom Out', action: 'zoomOut', icon: 'zoom-out' },
    ],
    edit: [
        { label: 'Undo', action: 'undo', icon: 'arrow-counterclockwise' },
        { label: 'Redo', action: 'redo', icon: 'arrow-clockwise' },
        { label: 'Paste', action: 'insertCopiedStroke', icon: 'clipboard-fill' },
        { label: 'Import From Clipboard', action: 'insertFromClipboard', icon: 'clipboard-plus-fill' },
    ],
    page: [
        { label: 'Rotate Clockwise', action: 'rotateClockwise', icon: 'arrow-clockwise' },
        { label: 'Rotate Counterclockwise', action: 'rotateCounterClockwise', icon: 'arrow-counterclockwise' },
        { label: 'Insert Page After', action: 'insertBlankPage', icon: 'file-earmark-arrow-down-fill' },
        { label: 'Delete', action: 'deletePage', icon: 'trash3-fill' },
    ],
}

onMounted(() => {
    document.querySelector(props.parent).addEventListener('contextmenu', handleContextMenu);
    document.querySelector(props.parent).addEventListener('click', handleContextMenu);
});

onUnmounted(() => {
    document.querySelector(props.parent).removeEventListener('contextmenu', handleContextMenu);
    document.querySelector(props.parent).removeEventListener('click', handleContextMenu);
});

</script>
<template>
    <div 
        ref="menuRef"
        class="dropdown-menu dropdown-menu-dark position-absolute rounded-4" 
        :class="{ show }" 
        :style="style"
    >
        <template v-for="(items, group, index) in groups">
            <div class="dropdown-divider" v-if="index"></div>
            <!-- <div class="dropdown-header text-capitalize">{{ $t(group) }}</div> -->
            <template v-for="item in items">
                <a href="#" class="dropdown-item" @click.prevent="$emit('menu-item-click', item.action)">
                    <i v-if="item.icon" :class="`bi bi-${item.icon} me-2`"></i>{{ $t(item.label) }}
                </a>
            </template>
        </template>
    </div>
</template>