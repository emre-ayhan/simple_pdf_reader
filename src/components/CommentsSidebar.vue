<script setup>
import { computed, ref, watch } from 'vue';

const props = defineProps({
    comments: {
        type: Array,
        default: () => []
    },
    modelValue: {
        type: [String, Number],
        default: null
    },
    ensureCommentPageReady: Function,
    revealCommentSourceText: Function,
    closeSidebar: Function,
});

const emit = defineEmits(['save-comment', 'cancel-comment', 'delete-comment', 'update:modelValue']);

const searchQuery = ref('');
const expandedGroups = ref({});

const parseTimestamp = (value) => {
    if (!value) return null;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

    const raw = String(value).trim();
    if (!raw) return null;

    const nativeDate = new Date(raw);
    if (!Number.isNaN(nativeDate.getTime())) return nativeDate;

    // PDF date format: D:YYYYMMDDHHmmSSOHH'mm'
    if (!raw.startsWith('D:')) return null;
    const core = raw.slice(2).replace(/'/g, '');
    const digits = core.replace(/[^0-9]/g, '');

    const year = Number(digits.slice(0, 4));
    const month = Number(digits.slice(4, 6) || '1');
    const day = Number(digits.slice(6, 8) || '1');
    const hour = Number(digits.slice(8, 10) || '0');
    const minute = Number(digits.slice(10, 12) || '0');
    const second = Number(digits.slice(12, 14) || '0');

    if (!Number.isFinite(year) || year < 1) return null;

    const parsed = new Date(year, Math.max(0, month - 1), Math.max(1, day), hour, minute, second);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatTimestamp = (value) => {
    if (!value) return '';

    const date = parseTimestamp(value);
    if (!date) return '';

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

const commentGroups = computed(() => {
    if (!Array.isArray(props.comments)) return [];
    return props.comments.map(group => ({
        id: String(group?.id || `${group?.pageId || ''}-${group?.pageIndex || 0}`),
        pageId: group?.pageId,
        pageIndex: Number(group?.pageIndex) || 0,
        comments: Array.isArray(group?.comments) ? group.comments : []
    }));
});

const totalComments = computed(() => {
    return commentGroups.value.reduce((total, group) => total + group.comments.length, 0);
});

watch(commentGroups, (groups) => {
    const next = {};
    groups.forEach((group) => {
        next[group.id] = expandedGroups.value[group.id] !== false;
    });
    expandedGroups.value = next;
}, { immediate: true });

const filteredGroups = computed(() => {
    const query = normalizeSearchValue(searchQuery.value);
    if (!query) return commentGroups.value;

    return commentGroups.value
        .map((group) => {
            const comments = group.comments.filter(comment => {
                const haystack = normalizeSearchValue([
                    comment.comment,
                    comment.selectedText,
                    comment.author,
                    comment.source,
                    `page ${Number(comment.pageIndex) + 1}`
                ].join(' '));

                return haystack.includes(query);
            });

            return {
                ...group,
                comments,
            };
        })
        .filter(group => group.comments.length > 0);
});

const isGroupExpanded = (groupId) => {
    const query = normalizeSearchValue(searchQuery.value);
    if (query) return true;
    return expandedGroups.value[groupId] !== false;
};

const toggleGroup = (groupId) => {
    const query = normalizeSearchValue(searchQuery.value);
    if (query) return;
    expandedGroups.value = {
        ...expandedGroups.value,
        [groupId]: !isGroupExpanded(groupId)
    };
};

const jumpToText = async (commentRef) => {
    if (!commentRef?.canJumpToText) return;
    await props.revealCommentSourceText(commentRef);
};

const getCommentIconClass = (comment) => {
    const first = comment?.stroke?.[0] || null;
    const strokeType = String(first?.type || '').toLowerCase();
    const markupType = String(first?.markupType || '').toLowerCase();
    const source = String(comment?.source || first?.source || '').toLowerCase();

    const markupIcon = () => {
        if (markupType === 'underline') return 'bi-type-underline';
        if (markupType === 'strikeout') return 'bi-type-strikethrough';
        if (markupType === 'squiggly') return 'bi-type-squiggly';
        return 'bi-highlighter';
    };

    if (strokeType === 'highlight-rect') {
        return markupIcon();
    }

    if (source === 'pdf-text-annotation' || source === 'app-comment') {
        return 'bi-chat-left-text-fill';
    }

    if (source === 'pdf-markup-annotation') {
        return markupIcon();
    }

    if (strokeType === 'text') return 'bi-textarea-t';
    if (strokeType === 'rectangle') return 'bi-square';
    if (strokeType === 'circle') return 'bi-circle';
    if (strokeType === 'line') return 'bi-slash-lg';
    if (strokeType === 'pen') return 'bi-pencil-fill';
    if (strokeType === 'image') return 'bi-image';
    if (strokeType === 'comment') return 'bi-chat-left-text-fill';

    return 'bi-chat-square-text-fill';
};

const editedCommentId = ref(null);
const commentDraft = ref('')

const editComment = (comment) => {
    commentDraft.value = comment?.comment || '';
    editedCommentId.value = comment?.id || null;
};

const cancelComment = () => {
    editedCommentId.value = null;
    commentDraft.value = '';
    emit('cancel-comment');
};

const saveComment = (comment) => {
    if (!editedCommentId.value) return;

    comment.comment = commentDraft.value;
    emit('save-comment', comment);
    editedCommentId.value = null;
    commentDraft.value = '';
};

const deleteComment = (comment) => {
    emit('delete-comment', comment?.pageId, comment?.strokeIndex);
};

const waitFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));

const scrollToCommentOnPage = async (commentRef, attempt = 0) => {
    const first = commentRef?.stroke?.[0] || null;
    if (!first) return false;

    await waitFrame();

    const pageId = String(commentRef?.pageId || '');
    const pageContainer = pageId
        ? document.querySelector(`.page-container[data-page="${pageId}"]`)
        : null;
    const reader = pageContainer?.closest?.('.pdf-reader') || null;
    const canvas = pageContainer?.querySelector?.('.drawing-canvas')
        || pageContainer?.querySelector?.('.pdf-canvas')
        || null;

    if (!pageContainer || !reader || !canvas) {
        if (attempt < 8) {
            await new Promise(resolve => setTimeout(resolve, 60));
            return scrollToCommentOnPage(commentRef, attempt + 1);
        }
        return false;
    }

    const canvasWidth = Number(canvas.width) || 0;
    const canvasHeight = Number(canvas.height) || 0;
    if (!canvasWidth || !canvasHeight) {
        if (attempt < 8) {
            await new Promise(resolve => setTimeout(resolve, 60));
            return scrollToCommentOnPage(commentRef, attempt + 1);
        }
        return false;
    }

    const x = Number(first.x) || 0;
    const y = Number(first.y) || 0;
    const width = Math.max(1, Number(first.width) || 0);
    const height = Math.max(1, Number(first.height) || 0);

    const canvasRect = canvas.getBoundingClientRect();
    const readerRect = reader.getBoundingClientRect();

    const targetClientY = canvasRect.top + ((y + height / 2) / canvasHeight) * canvasRect.height;
    const deltaY = targetClientY - readerRect.top;
    const targetScrollTop = reader.scrollTop + deltaY - (reader.clientHeight * 0.35);

    reader.scrollTo({
        top: Math.max(0, targetScrollTop),
        behavior: 'smooth'
    });

    return true;
};

const handleCommentClick = async (comment) => {
    if (comment?.source === 'pdf-text-annotation' && comment?.canJumpToText) {
        await jumpToText(comment);
        return;
    }

    await props.ensureCommentPageReady(comment);

    await scrollToCommentOnPage(comment);

    emit('update:modelValue', comment?.id || null);
};
</script>

<template>
    <aside class="comments-sidebar">
        <div class="comments-sidebar-header">
            <div class="d-flex align-items-center justify-content-between gap-3">
                <div>
                    <div class="comments-sidebar-kicker text-uppercase">{{ $t('Annotations') }}</div>
                    <h5 class="mb-0 text-light">{{ $t('Comments') }} ({{ totalComments }})</h5>
                </div>
                <button type="button" class="btn btn-sm btn-outline-light rounded-3" @click="closeSidebar?.()">
                    <i class="bi bi-x-lg"></i>
                </button>
            </div>

            <div v-if="totalComments" class="comments-sidebar-search mt-3">
                <input
                    v-model.trim="searchQuery"
                    type="search"
                    class="form-control form-control-sm"
                    :placeholder="$t('Filter comments')"
                >
            </div>
        </div>

        <div v-if="!totalComments" class="comments-sidebar-empty">
            {{ $t('No comments yet. Select text and add one to start a review trail.') }}
        </div>

        <div v-else-if="!filteredGroups.length" class="comments-sidebar-empty">
            {{ $t('No matching comments for this search.') }}
        </div>

        <div v-else class="comments-sidebar-list">
            <section v-for="group in filteredGroups" :key="group.id" class="comments-sidebar-group">
                <button type="button" class="comments-sidebar-group-toggle" @click="toggleGroup(group.id)">
                    <i class="bi" :class="isGroupExpanded(group.id) ? 'bi-chevron-up' : 'bi-chevron-down'"></i>
                    <span class="badge text-bg-warning-subtle text-capitalize text-warning">
                        {{ $t('page') }} {{ group.pageIndex + 1 }}
                    </span>
                    <span class="badge comments-sidebar-group-count">{{ group.comments.length }}</span>
                </button>

                <div v-show="isGroupExpanded(group.id)" class="comments-sidebar-group-body">
                    <article
                        v-for="comment in group.comments"
                        :key="comment.id"
                        class="comments-sidebar-item"
                        :class="{ active: String(modelValue || '') === String(comment.id) }"
                    >
                        <button type="button" class="comments-sidebar-card" @click="handleCommentClick(comment)">
                            <div class="comments-sidebar-card-layout">
                                <div class="comments-sidebar-type-icon" :title="comment.source || 'comment'">
                                    <i class="bi" :class="getCommentIconClass(comment)"></i>
                                </div>

                                <div class="comments-sidebar-content">
                                    <div class="comments-sidebar-author" v-if="comment.author">
                                        {{ comment.author }}
                                    </div>
                                    <small class="text-secondary">{{ formatTimestamp(comment.updatedAt) }}</small>
                                    <div class="comments-sidebar-meta d-flex align-items-center justify-content-between gap-2">
                                        <div class="comments-sidebar-actions btn-group-sm">
                                            <button v-if="comment.canJumpToText && comment.source !== 'pdf-text-annotation'" type="button" class="btn btn-outline-warning" @click.stop="jumpToText(comment)" :title="$t('Jump to text')">
                                                <i class="bi bi-file-text"></i>
                                            </button>
                                            <button type="button" class="btn btn-outline-warning" @click.stop="editComment(comment)" :title="$t('Edit')">
                                                <i class="bi bi-pencil"></i>
                                            </button>
                                            <button type="button" class="btn btn-outline-danger" @click.stop="deleteComment(comment)" :title="$t('Delete')">
                                                <i class="bi bi-trash"></i>
                                            </button>
                                        </div>
                                    </div>


                                    <div v-if="comment.selectedText" class="comments-sidebar-selection fst-italic">
                                        "{{ previewSelection(comment.selectedText) }}"
                                    </div>

                                    <div class="comments-sidebar-body text-light">
                                        <template v-if="editedCommentId === comment.id">
                                            <textarea
                                                v-model="commentDraft"
                                                class="form-control bg-transparent editor-input border text-light mb-2"
                                                rows="3"
                                                :placeholder="$t('Edit your comment')"
                                            ></textarea>
                                            <div class="d-flex justify-content-end gap-2">
                                                <button type="button" class="btn btn-sm btn-outline-warning" @click="cancelComment">
                                                    {{ $t('Cancel') }}
                                                </button>
                                                <button type="button" class="btn btn-sm btn-warning" :class="{ disabled: !commentDraft || commentDraft.trim() === comment.comment }" @click="saveComment(comment)">
                                                    {{ $t('Save') }}
                                                </button>
                                            </div>
                                        </template>
                                        <template v-else>
                                            {{ comment.comment }}
                                        </template>
                                    </div>
                                </div>
                            </div>
                        </button>
                    </article>
                </div>
            </section>
        </div>
    </aside>
</template>