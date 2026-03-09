<script setup>
import { computed, ref } from 'vue';

const props = defineProps({
    comments: {
        type: Array,
        default: () => []
    },
    activeCommentId: {
        type: [String, Number],
        default: null
    },
    selectComment: Function,
    jumpToText: Function,
    editComment: Function,
    deleteComment: Function,
    closeSidebar: Function,
});

const searchQuery = ref('');

const formatTimestamp = (value) => {
    if (!value) return '';

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';

    return new Intl.DateTimeFormat(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
    }).format(date);
};

const previewSelection = (value) => {
    const text = String(value || '').trim();
    if (!text) return '';
    return text.length > 120 ? `${text.slice(0, 117)}...` : text;
};

const normalizeSearchValue = (value) => String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();

const filteredComments = computed(() => {
    const query = normalizeSearchValue(searchQuery.value);
    if (!query) return props.comments;

    return props.comments.filter(comment => {
        const haystack = normalizeSearchValue([
            comment.comment,
            comment.selectedText,
            comment.author,
            comment.source,
            `page ${Number(comment.pageIndex) + 1}`
        ].join(' '));

        return haystack.includes(query);
    });
});

const handleCommentClick = (comment) => {
    if (comment?.source === 'pdf-text-annotation' && comment?.canJumpToText && typeof props.jumpToText === 'function') {
        props.jumpToText(comment);
        return;
    }

    props.selectComment?.(comment);
};
</script>

<template>
    <aside class="comments-sidebar">
        <div class="comments-sidebar-header">
            <div class="d-flex align-items-center justify-content-between gap-3">
                <div>
                    <div class="comments-sidebar-kicker text-uppercase">{{ $t('Annotations') }}</div>
                    <h5 class="mb-0 text-light">{{ $t('Comments') }}</h5>
                </div>
                <button type="button" class="btn btn-sm btn-outline-light" @click="closeSidebar?.()">
                    <i class="bi bi-x-lg"></i>
                </button>
            </div>

            <div v-if="comments.length" class="comments-sidebar-search mt-3">
                <input
                    v-model.trim="searchQuery"
                    type="search"
                    class="form-control form-control-sm"
                    :placeholder="$t('Filter comments')"
                >
            </div>
        </div>

        <div v-if="!comments.length" class="comments-sidebar-empty">
            {{ $t('No comments yet. Select text and add one to start a review trail.') }}
        </div>

        <div v-else-if="!filteredComments.length" class="comments-sidebar-empty">
            {{ $t('No matching comments for this search.') }}
        </div>

        <div v-else class="comments-sidebar-list">
            <article
                v-for="comment in filteredComments"
                :key="comment.id"
                class="comments-sidebar-item"
                :class="{ active: String(activeCommentId || '') === String(comment.id) }"
            >
                <button type="button" class="comments-sidebar-card" @click="handleCommentClick(comment)">
                    <div class="comments-sidebar-meta d-flex align-items-center justify-content-between gap-2">
                        <span class="badge text-bg-warning-subtle text-warning">
                            {{ $t('Page') }} {{ comment.pageIndex + 1 }}
                        </span>
                        <small class="text-secondary">{{ formatTimestamp(comment.updatedAt) }}</small>
                    </div>
                    <div v-if="comment.selectedText" class="comments-sidebar-selection fst-italic">
                        "{{ previewSelection(comment.selectedText) }}"
                    </div>
                    <div class="comments-sidebar-body text-light">
                        {{ comment.comment }}
                    </div>
                    <div v-if="comment.author" class="comments-sidebar-author">
                        {{ comment.author }}
                        <div class="comments-sidebar-actions btn-group-sm">
                            <button v-if="comment.canJumpToText && comment.source !== 'pdf-text-annotation'" type="button" class="btn btn-outline-warning" @click="jumpToText?.(comment)" :title="$t('Jump to text')">
                                <i class="bi bi-file-text"></i>
                            </button>
                            <button type="button" class="btn btn-outline-warning" @click="editComment?.(comment)" :title="$t('Edit')">
                                <i class="bi bi-pencil"></i>
                            </button>
                            <button type="button" class="btn btn-outline-danger" @click="deleteComment?.(comment)" :title="$t('Delete')">
                                <i class="bi bi-trash"></i>
                            </button>
                        </div>
                    </div>
                </button>
            </article>
        </div>
    </aside>
</template>