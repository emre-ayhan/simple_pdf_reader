<script setup>
import { onMounted, onUnmounted, ref } from 'vue';

const props = defineProps({
    parent: {
        type: String,
        required: true
    }
});

const show = ref(false);

const style = ref({
    top: 0,
    left: 0
});

const handleContextMenu = (event) => {
    event.preventDefault();
    event.stopPropagation();

    if (event.type === 'click') {
        show.value = false;
        return;
    }

    show.value = true;

    style.value = {
        top: `${event.clientY}px`,
        left: `${event.clientX}px`
    };
};

const items = [
    // Define your context menu items here
    { label: 'Lock View', icon: 'lock', action: 'lockView' },
    { label: 'Zoom In', action: 'zoomIn', icon: 'zoom-in' },
    { label: 'Zoom Out', action: 'zoomOut', icon: 'zoom-out' },
];

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
    <div class="dropdown-menu dropdown-menu-dark position-absolute" :class="{ show }" :style="style">
        <template v-for="item in items">
            <a href="#" class="dropdown-item" @click.prevent="$emit('menu-item-click', item.action)">
                <i v-if="item.icon" :class="`bi bi-${item.icon} me-2`"></i>{{ $t(item.label) }}
            </a>
        </template>
    </div>
</template>