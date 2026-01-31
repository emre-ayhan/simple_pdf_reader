<script setup>
import { onMounted } from 'vue'
import { Modal } from 'bootstrap';
import { modal, message, mustConfirm, confirm } from '../composables/useModal';

onMounted(() => {
    modal.value = new Modal(`#page-modal`, {
        toggle: false
    });
})
</script>
<template>
<div class="modal fade" id="page-modal" tabindex="-1" aria-labelledby="pageModalLabel" aria-hidden="true">
    <div class="modal-dialog modal-dialog-scrollable modal-dialog-centered rounded-3">
        <div class="modal-content rounded-3">
            <div class="modal-body">
                <h4 class="modal-title text-danger" id="pageModalLabel">
                    <i class="bi" :class="mustConfirm ? 'bi-exclamation-triangle-fill' : 'bi-info-circle-fill'"></i>
                    {{ $t(mustConfirm ? 'Please Confirm' : 'Notice') }}
                    <hr>
                </h4>
                <div v-if="typeof message === 'object'">
                    <template v-for="(text, label) in message">
                        <div><strong class="me-1" v-if="isNaN(label)">{{ $t(label) }}:</strong>{{ $t(text) }}</div>
                    </template>
                </div>
                <div class="text-center text-dark fs-5" v-else>
                    {{ $t(message) }}
                </div>
            </div>
            <div class="modal-footer border-0 p-0">
                <div class="d-grid col m-0">
                    <div class="btn-group">
                        <button type="button" :class="`btn ${mustConfirm ? 'btn-secondary' : 'btn-danger'} rounded-0`" data-bs-dismiss="modal">
                            {{ $t(mustConfirm ? 'Cancel' : 'Ok') }}
                        </button>
                        <button type="button" class="btn btn-danger rounded-0" @click.prevent="confirm" v-if="mustConfirm">
                            {{ $t('Ok') }}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>
</template>