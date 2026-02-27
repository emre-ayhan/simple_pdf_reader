<script setup>
defineProps({
    page: Object,
    disabled: Boolean,
});
</script>
<template>
<div v-if="page.annotations.length > 0" class="form-layer" :class="{ disabled }">
    <template v-for="field in page.annotations" :key="field.id">
        <!-- Text / password input -->
        <input
            v-if="field.inputType === 'text'"
            :type="field.password ? 'password' : 'text'"
            class="form-field form-field-text"
            :style="field.posStyle"
            :maxlength="field.maxLength || undefined"
            :readonly="field.readOnly"
            :required="field.required"
            :value="page.form[field.fieldName] ?? ''"
            @input="page.form[field.fieldName] = $event.target.value"
            @click.stop
            @pointerdown.stop
        />
        <!-- Multiline textarea -->
        <textarea
            v-else-if="field.inputType === 'textarea'"
            class="form-field form-field-textarea"
            :style="field.posStyle"
            :maxlength="field.maxLength || undefined"
            :readonly="field.readOnly"
            :required="field.required"
            :value="page.form[field.fieldName] ?? ''"
            @input="page.form[field.fieldName] = $event.target.value"
            @click.stop
            @pointerdown.stop
        ></textarea>
        <!-- Checkbox -->
        <span
            v-else-if="field.inputType === 'checkbox'"
            class="form-field form-field-checkbox-wrap"
            :style="field.posStyle"
        >
            <input
                type="checkbox"
                class="form-field-checkbox"
                :disabled="field.readOnly"
                :checked="!!page.form[field.fieldName]"
                @change="page.form[field.fieldName] = $event.target.checked"
                @click.stop
                @pointerdown.stop
            />
        </span>
        <!-- Radio button -->
        <span
            v-else-if="field.inputType === 'radio'"
            class="form-field form-field-radio-wrap"
            :style="field.posStyle"
        >
            <input
                type="radio"
                class="form-field-radio"
                :name="'pdf-radio-' + field.groupName"
                :value="field.exportValue"
                :disabled="field.readOnly"
                :checked="page.form[field.groupName] === field.exportValue"
                @change="page.form[field.groupName] = field.exportValue"
                @click.stop
                @pointerdown.stop
            />
        </span>
        <!-- Single-select dropdown -->
        <select
            v-else-if="field.inputType === 'select'"
            class="form-field form-field-select"
            :style="field.posStyle"
            :disabled="field.readOnly"
            :required="field.required"
            :value="page.form[field.fieldName] ?? ''"
            @change="page.form[field.fieldName] = $event.target.value"
            @click.stop
            @pointerdown.stop
        >
            <option value="">—</option>
            <option
                v-for="opt in field.options"
                :key="opt.value"
                :value="opt.value"
            >{{ opt.label }}</option>
        </select>
        <!-- Single-select listbox -->
        <select
            v-else-if="field.inputType === 'listbox'"
            class="form-field form-field-select"
            :style="field.posStyle"
            :size="field.size || 2"
            :disabled="field.readOnly"
            :required="field.required"
            :value="page.form[field.fieldName] ?? ''"
            @change="page.form[field.fieldName] = $event.target.value"
            @click.stop
            @pointerdown.stop
        >
            <option
                v-for="opt in field.options"
                :key="opt.value"
                :value="opt.value"
            >{{ opt.label }}</option>
        </select>
        <!-- Multi-select listbox -->
        <select
            v-else-if="field.inputType === 'multiselect'"
            class="form-field form-field-select"
            :style="field.posStyle"
            multiple
            :disabled="field.readOnly"
            :required="field.required"
            @change="page.form[field.fieldName] = Array.from($event.target.selectedOptions).map(o => o.value)"
            @click.stop
            @pointerdown.stop
        >
            <option
                v-for="opt in field.options"
                :key="opt.value"
                :value="opt.value"
                :selected="(page.form[field.fieldName] || []).includes(opt.value)"
            >{{ opt.label }}</option>
        </select>
        <!-- Push button -->
        <button
            v-else-if="field.inputType === 'button'"
            type="button"
            class="form-field form-field-button"
            :style="field.posStyle"
            :disabled="field.readOnly"
            @click.stop="resetForm"
            @pointerdown.stop
        ></button>
    </template>
</div>
</template>