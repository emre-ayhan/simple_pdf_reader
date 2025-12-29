import { ref } from "vue";
const modal = ref(null);
const message = ref("");
const mustConfirm = ref(false);

let resolver = null;
let onConfirmedCallback = null;

const showModal = (msg, onConfirmed) => {
    if (modal.value) {
        modal.value.show();
        message.value = msg || "";
        mustConfirm.value = typeof onConfirmed === "function";

        if (mustConfirm.value) {
            onConfirmedCallback = onConfirmed;
            return new Promise((resolve) => {
                resolver = resolve;
            });
        }
    }
};

const hideModal = () => {
    if (modal.value) {
        modal.value.hide();
    }
};

const confirm = () => {
    if (typeof resolver !== "function") return;

    resolver(true);
    resolver = null;

    if (typeof onConfirmedCallback !== "function") return;

    onConfirmedCallback();
    onConfirmedCallback = null;

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