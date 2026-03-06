import { ref } from "vue";
const modal = ref(null);
const message = ref("");
const mustConfirm = ref(false);
const modalSize = ref('md')
const modalTab = ref(null)

let resolver = null;

const showModal = (msg, requireConfirmation, size, tab) => {
    if (modal.value) {
        modal.value.show();
        message.value = msg || "";
        mustConfirm.value = requireConfirmation || false;
        modalSize.value = size || 'md';
        modalTab.value = tab || null;

        if (mustConfirm.value) {
            return new Promise((resolve) => {
                resolver = resolve;
            });
        }
    }
};

const hideModal = () => {
    if (modal.value) {
        modal.value.hide();
        mustConfirm.value = false;
        message.value = "";
    }
};

const confirm = () => {
    if (typeof resolver !== "function") return;
    resolver(true);
    resolver = null;
    hideModal();
};

export {
    modal,
    modalSize,
    modalTab,
    message,
    mustConfirm,
    confirm,
    showModal,
    hideModal
}