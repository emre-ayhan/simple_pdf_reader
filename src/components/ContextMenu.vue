<script setup>
import { onMounted, onBeforeUnmount, ref, nextTick } from 'vue';

const props = defineProps({
    parent: {
        type: String,
        required: true
    }
});

const emit = defineEmits(['show', 'hide']);

const show = ref(false);
const menuRef = ref(null);
const isPenSecondaryActive = ref(true);

const style = ref({
    top: 0,
    left: 0
});

let parentEl = null;

const getParentMetrics = () => {
    const el = parentEl || document.querySelector(props.parent);
    if (!el) {
        return {
            parentEl: null,
            parentRect: null,
            scrollLeft: 0,
            scrollTop: 0,
            clientLeft: 0,
            clientTop: 0,
            clientRight: window.innerWidth || document.documentElement.clientWidth || 0,
            clientBottom: window.innerHeight || document.documentElement.clientHeight || 0,
        };
    }

    const parentRect = el.getBoundingClientRect();
    let visibleWidth = el.clientWidth;

    const sidebar = el.querySelector?.('.comments-sidebar');
    if (sidebar instanceof HTMLElement) {
        const sidebarRect = sidebar.getBoundingClientRect();
        const overlapsParent = sidebarRect.width > 0
            && sidebarRect.left < parentRect.right
            && sidebarRect.right > parentRect.left;

        if (overlapsParent) {
            visibleWidth = Math.max(0, Math.min(el.clientWidth, sidebarRect.left - parentRect.left));
        }
    }

    return {
        parentEl: el,
        parentRect,
        scrollLeft: el.scrollLeft,
        scrollTop: el.scrollTop,
        clientLeft: parentRect.left,
        clientTop: parentRect.top,
        clientRight: parentRect.left + visibleWidth,
        clientBottom: parentRect.top + el.clientHeight,
    };
};

const toLocalPosition = (clientX, clientY) => {
    const { parentRect, scrollLeft, scrollTop } = getParentMetrics();
    if (!parentRect) {
        return {
            left: clientX,
            top: clientY,
        };
    }

    return {
        left: clientX - parentRect.left + scrollLeft,
        top: clientY - parentRect.top + scrollTop,
    };
};

const handleContextMenu = async (event) => {
    if (event.type === 'pointermove') {
        if (event.pointerType === 'pen') {
            isPenSecondaryActive.value = event.buttons !== 2;
        }
        return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (event.type === 'click') {
        show.value = false;
        emit('hide');
        return;
    }

    if (event.type === 'contextmenu' && event.pointerType === 'pen') {
        const isPenSecondaryButton = event.button === 2 || event.buttons === 2 || !isPenSecondaryActive.value;
        if (!isPenSecondaryButton) return;
    }

    show.value = true;
    emit('show');

    // Wait for the menu to render
    await nextTick();

    const menuEl = menuRef.value;
    const {
        parentRect,
        scrollLeft,
        scrollTop,
        clientLeft,
        clientTop,
        clientRight,
        clientBottom,
    } = getParentMetrics();

    if (!menuEl) {
        return;
    }
    const menuRect = menuEl.getBoundingClientRect();

    let top = event.clientY;
    let left = event.clientX;

    // Check if menu overflows bottom
    if (top + menuRect.height > clientBottom) {
        top = clientBottom - menuRect.height;
    }

    // Check if menu overflows top
    if (top < clientTop) {
        top = clientTop;
    }

    // Check if menu overflows right
    if (left + menuRect.width > clientRight) {
        left = clientRight - menuRect.width;
    }

    // Check if menu overflows left
    if (left < clientLeft) {
        left = clientLeft;
    }

    const localPosition = parentRect
        ? {
            left: left - parentRect.left + scrollLeft,
            top: top - parentRect.top + scrollTop,
        }
        : toLocalPosition(left, top);

    style.value = {
        top: `${localPosition.top}px`,
        left: `${localPosition.left}px`
    };
};

onMounted(() => {
    parentEl = document.querySelector(props.parent);
    if (!parentEl) return;

    parentEl.addEventListener('pointermove', handleContextMenu);
    parentEl.addEventListener('contextmenu', handleContextMenu);
    parentEl.addEventListener('click', handleContextMenu);
});

onBeforeUnmount(() => {
    if (!parentEl) return;

    parentEl.removeEventListener('pointermove', handleContextMenu);
    parentEl.removeEventListener('contextmenu', handleContextMenu);
    parentEl.removeEventListener('click', handleContextMenu);
    parentEl = null;
});
</script>
<template>
    <div ref="menuRef" class="dropdown-menu dropdown-menu-dark position-absolute rounded-3 d-print-none show" :style="style" v-if="show">
        <slot></slot>
    </div>
</template>