<script setup>
import { onMounted, onUnmounted } from 'vue'
import { Modal } from 'bootstrap';
import { modal, message, mustConfirm, confirm, modalSize, modalTab } from '../composables/useModal';

const hideModalHandler = () => {
    modalTab.value = null;
    modalSize.value = 'md';
}

const changeTab = (tab) => {
    modalTab.value = tab;
}

onMounted(() => {
    modal.value = new Modal(`#page-modal`, {
        toggle: false
    });

    document.addEventListener('bs.modal.hide', hideModalHandler);
})

onUnmounted(() => {
    document.removeEventListener('bs.modal.hide', hideModalHandler);
});
</script>
<template>
<div class="modal fade" id="page-modal" tabindex="-1" aria-labelledby="pageModalLabel" aria-hidden="true">
    <div :class="`modal-dialog modal-dialog-scrollable modal-dialog-centered rounded-3 modal-${modalSize}`">
        <div class="modal-content rounded-3">
            <div class="modal-body">
                <h4 class="modal-title text-primary" id="pageModalLabel" v-if="!modalTab">
                    <i class="bi" :class="mustConfirm ? 'bi-exclamation-triangle-fill' : 'bi-info-circle-fill'"></i>
                    {{ $t(mustConfirm ? 'Please Confirm' : 'Notice') }}
                    <hr>
                </h4>
                <slot :data="message" :tab="modalTab" :changeTab="changeTab">
                    <div class="text-center text-light fs-5">
                        {{ $t(message) }}
                    </div>
                    <hr class="text-primary mb-0">
                </slot>
            </div>
            <div class="modal-footer border-0 pt-0">
                <button type="button" :class="`btn ${mustConfirm ? 'btn-secondary' : 'btn-primary'}`" data-bs-dismiss="modal">
                    {{ $t(mustConfirm ? 'Cancel' : 'Ok') }}
                </button>
                <button type="button" class="btn btn-primary" @click.prevent="confirm" v-if="mustConfirm">
                    {{ $t('Ok') }}
                </button>
            </div>
        </div>
    </div>
</div>
</template>