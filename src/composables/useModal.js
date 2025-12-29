import { ref } from "vue";
const modal = ref(null);
const message = ref("");
const mustConfirm = ref(false);

let resolver = null;

const showModal = (msg, requireConfirmation) => {
    if (modal.value) {
        modal.value.show();
        message.value = msg || "";
        mustConfirm.value = requireConfirmation || false;

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
    message,
    mustConfirm,
    confirm,
    showModal,
    hideModal
}