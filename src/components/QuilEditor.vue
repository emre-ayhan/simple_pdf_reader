<script setup>
import Quill from 'quill';
import { ref, onMounted, onBeforeUnmount } from 'vue';

const props = defineProps({
    modelValue: {
        type: String,
        default: ''
    },
    style: {
        type: Object,
        default: () => ({})
    },
    placeholder: {
        type: String,
        default: ''
    }
});

const editor = ref(null);
let quill = null;
const emit = defineEmits(['update:modelValue', 'save', 'cancel']);

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
                [{ size: ['small', false, 'large', 'huge'] }],
                ['bold', 'italic', 'underline', 'strike'],
                [{ list: 'ordered' }, { list: 'bullet' }],
                [{ color: [] }, { background: [] }],
                ['clean']
            ]
        }
    });

    // Set initial content
    quill.clipboard.dangerouslyPasteHTML(props.modelValue)
});

onBeforeUnmount(() => {
    if (quill) {
        quill = null;
    }
});
</script>

<template>
    <div class="text-editor-box" :style="style" @contextmenu.stop.prevent>
        <div class="quil-editor">
            <div ref="editor"></div>
            <div class="quil-editor-actions">
                <button type="button" class="btn btn-sm btn-dark" @click="handleSave">Save</button>
                <button type="button" class="btn btn-sm btn-outline-dark" @click="handleCancel">Cancel</button>
            </div>
        </div>
    </div>
</template>