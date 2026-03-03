<script setup>
import Quill from 'quill';
import { ref, onMounted, onBeforeUnmount, nextTick, computed } from 'vue';

const props = defineProps({
    modelValue: {
        type: String,
        default: ''
    },
    style: {
        type: Object,
        default: () => ({
            left: '0px',
            top: '0px',
            width: '300px',
            height: '220px'
        })
    },
    placeholder: {
        type: String,
        default: ''
    }
});

const { left, top, width, height } = props.style;

const editor = ref(null);
const box = ref(null);
let quill = null;
let resizeObserver = null;
let chromeObserver = null;
const dragState = ref(null);
const emit = defineEmits(['update:modelValue', 'save', 'cancel', 'resize', 'drag']);

const emitEditorMetrics = () => {
    if (!box.value) return;

    const toolbarEl = box.value.querySelector('.ql-toolbar');
    const actionsEl = box.value.querySelector('.quil-editor-actions');
    const rect = box.value.getBoundingClientRect();

    emit('resize', {
        width: rect.width,
        height: rect.height,
        chromeHeight: Math.max(0, (toolbarEl?.offsetHeight || 0) + (actionsEl?.offsetHeight || 0))
    });
};

const parsePx = (value, fallback = 0) => {
    const n = parseFloat(value);
    return Number.isFinite(n) ? n : fallback;
};

const onDragMove = (e) => {
    if (!dragState.value) return;
    const dx = e.clientX - dragState.value.startX;
    const dy = e.clientY - dragState.value.startY;
    emit('drag', {
        left: dragState.value.baseLeft + dx,
        top: dragState.value.baseTop + dy
    });
};

const stopDragging = () => {
    if (!dragState.value) return;
    window.removeEventListener('pointermove', onDragMove);
    window.removeEventListener('pointerup', stopDragging);
    dragState.value = null;
};

const closeOpenPickers = () => {
    if (!box.value) return;
    box.value.querySelectorAll('.ql-toolbar .ql-picker.ql-expanded').forEach((picker) => {
        picker.classList.remove('ql-expanded');
    });
};

const handleGlobalPointerDown = (e) => {
    if (!box.value) return;
    const target = e.target;
    const activePicker = target?.closest?.('.ql-toolbar .ql-picker');
    if (activePicker) {
        box.value.querySelectorAll('.ql-toolbar .ql-picker.ql-expanded').forEach((picker) => {
            if (picker !== activePicker) {
                picker.classList.remove('ql-expanded');
            }
        });
        return;
    }
    closeOpenPickers();
};

const handleDragStart = (e) => {
    if (e.button !== 0) return;
    if (!box.value) return;

    const target = e.target;
    const inToolbar = target?.closest?.('.ql-toolbar');
    const isDragZone = inToolbar;

    // Keep all Quill controls clickable (pickers, buttons, format groups, etc.)
    const isInteractive = target?.closest?.(
        '.ql-formats, .ql-picker, .ql-picker-label, .ql-picker-options, .ql-picker-item, button, input, textarea, select, a'
    );
    if (!isDragZone || isInteractive) return;

    dragState.value = {
        startX: e.clientX,
        startY: e.clientY,
        baseLeft: parsePx(props.style?.left, box.value.getBoundingClientRect().left),
        baseTop: parsePx(props.style?.top, box.value.getBoundingClientRect().top)
    };

    window.addEventListener('pointermove', onDragMove);
    window.addEventListener('pointerup', stopDragging);
    e.preventDefault();
};

const handleSave = () => {
    // avoid offset mapping crashes by returning focus to body first
    try { quill?.blur(); } catch(e) {}
    
    const  content = quill.root.innerHTML;

    if (content === '<p><br></p>') {
        handleCancel();
        return;
    }

    emit('update:modelValue', content);
    emit('save', content);
};

const handleCancel = () => {
    try { quill?.blur(); } catch(e) {}
    emit('cancel');
};

onMounted(() => {
    quill =  new Quill(editor.value, {
        theme: 'snow',
        placeholder: props.placeholder,
        modules: {
            toolbar: [
                [{ 'header': [1, 2, 3, 4, 5, 6, false] }],
                ['bold', 'italic', 'underline', 'strike', 'link'],
                [{ 'script': 'sub' }, { 'script': 'super' }],
                [{ 'indent': '-1' }, { 'indent': '+1' }],
                [{ 'align': [] }],
                [{ list: 'ordered' }, { list: 'bullet' }],
                [{ color: [] }, { background: [] }],
            ]
        }
    });

    // Set initial content
    quill.clipboard.dangerouslyPasteHTML(props.modelValue)

    quill.on('text-change', () => {
        let value = quill.root.innerHTML == '<p><br></p>' ? '' : quill.root.innerHTML;
        emit('update:modelValue', value);
    });

    nextTick(() => {
        if (!box.value) return;

        resizeObserver = new ResizeObserver((entries) => {
            const entry = entries?.[0];
            if (!entry) return;
            emitEditorMetrics();
        });

        resizeObserver.observe(box.value);

        const toolbarEl = box.value.querySelector('.ql-toolbar');
        const actionsEl = box.value.querySelector('.quil-editor-actions');
        chromeObserver = new ResizeObserver(() => {
            emitEditorMetrics();
        });

        if (toolbarEl) chromeObserver.observe(toolbarEl);
        if (actionsEl) chromeObserver.observe(actionsEl);

        emitEditorMetrics();
    });

    window.addEventListener('resize', emitEditorMetrics);
    window.addEventListener('pointerdown', handleGlobalPointerDown, true);
});

onBeforeUnmount(() => {
    stopDragging();
    window.removeEventListener('resize', emitEditorMetrics);
    window.removeEventListener('pointerdown', handleGlobalPointerDown, true);

    if (resizeObserver) {
        resizeObserver.disconnect();
        resizeObserver = null;
    }

    if (chromeObserver) {
        chromeObserver.disconnect();
        chromeObserver = null;
    }

    if (quill) {
        quill = null;
    }
});
</script>

<template>
    <div ref="box" class="text-editor-box" :class="{ 'is-dragging': !!dragState }" :style="style" @contextmenu.stop.prevent @pointerdown="handleDragStart">
        <div class="quil-editor">
            <div ref="editor"></div>
            <div class="quil-editor-actions">
                <button type="button" class="btn btn-sm btn-dark" :class="{ disabled: !modelValue }" @click="handleSave">{{ $t('Save') }}</button>
                <button type="button" class="btn btn-sm btn-outline-dark" @click="handleCancel">{{ $t('Cancel') }}</button>
            </div>
        </div>
    </div>
</template>