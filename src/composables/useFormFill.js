import { ref, reactive, computed } from 'vue';

// PDF.js button field flag bitmasks
const BTN_FLAG_RADIO        = 1 << 15; // 32768
const BTN_FLAG_PUSH_BUTTON  = 1 << 16; // 65536

// PDF.js choice field flag bitmask
const CH_FLAG_COMBO         = 1 << 17; // 131072
const CH_FLAG_MULTISELECT   = 1 << 21; // 2097152

// Text field flag bitmask
const TX_FLAG_MULTILINE     = 1 << 12; // 4096
const TX_FLAG_READONLY      = 1;

/**
 * Converts a PDF.js annotation rect (in viewport/canvas pixel space) into
 * percentage-based CSS positioning relative to the canvas dimensions.
 *
 * PDF.js `viewport.convertToViewportRectangle` returns [x1, y1, x2, y2] where
 * y increases downward (canvas coordinate system).
 */
const rectToStyle = (rect, vpWidth, vpHeight) => {
    const [x1, y1, x2, y2] = rect;
    const left   = (Math.min(x1, x2) / vpWidth)  * 100;
    const top    = (Math.min(y1, y2) / vpHeight) * 100;
    const width  = (Math.abs(x2 - x1) / vpWidth)  * 100;
    const height = (Math.abs(y2 - y1) / vpHeight) * 100;
    return {
        left:     `${left}%`,
        top:      `${top}%`,
        width:    `${width}%`,
        height:   `${height}%`,
    };
};

/**
 * Derive a readable font size from field dimensions in viewport pixels.
 * Uses different tuning for single-line vs multi-line/listbox controls.
 */
const fontSizeFromRect = (rect, variant = 'singleline') => {
    const [x1, y1, x2, y2] = rect;
    const widthPx = Math.max(1, Math.abs(x2 - x1));
    const heightPx = Math.max(1, Math.abs(y2 - y1));

    const isMultiLineLike = variant === 'textarea' || variant === 'multiselect' || variant === 'listbox';
    const heightFactor = isMultiLineLike ? 0.46 : 0.66;
    const widthFactor = isMultiLineLike ? 0.085 : 0.13;

    const sizeFromHeight = heightPx * heightFactor;
    const sizeFromWidth = widthPx * widthFactor;
    const dynamicMax = isMultiLineLike ? 20 : 24;
    const minSize = heightPx < 15 ? 8 : 10;

    const sizePx = Math.max(minSize, Math.min(sizeFromHeight, sizeFromWidth, dynamicMax));
    return `${sizePx.toFixed(2)}px`;
};

/**
 * Process a raw PDF.js widget annotation into a typed field descriptor.
 */
const processAnnotation = (annotation, viewport) => {
    const { subtype, fieldType, fieldName, fieldFlags = 0, rect } = annotation;

    // PDF.js: Widget annotations have subtype 'Widget' or annotationType 20
    const isWidget = subtype === 'Widget' || annotation.annotationType === 20;
    if (!isWidget || !fieldType) return null;

    if (!rect || !Array.isArray(rect) || rect.length < 4) return null;

    let posStyle;
    let viewportRect;
    try {
        viewportRect = viewport.convertToViewportRectangle(rect);
        posStyle = rectToStyle(viewportRect, viewport.width, viewport.height);
    } catch (e) {
        console.warn('[FormFill] convertToViewportRectangle failed', e);
        return null;
    }
    const isReadOnly = !!(fieldFlags & TX_FLAG_READONLY);

    const base = {
        id:        annotation.id,
        fieldName: fieldName || annotation.id,
        fieldType,
        posStyle,
        readOnly:  isReadOnly,
        required:  !!(fieldFlags & 2),
    };

    // ── Text field ───────────────────────────────────────────────────────────
    if (fieldType === 'Tx') {
        const inputType = (fieldFlags & TX_FLAG_MULTILINE) ? 'textarea' : 'text';
        return {
            ...base,
            posStyle:   { ...base.posStyle, fontSize: fontSizeFromRect(viewportRect, inputType) },
            inputType,
            maxLength:  annotation.maxLen || 0,
            password:   !!(fieldFlags & (1 << 13)),
            value:      annotation.fieldValue ?? '',
        };
    }

    // ── Button (checkbox / radio / push-button) ──────────────────────────────
    if (fieldType === 'Btn') {
        const isPush  = !!(fieldFlags & BTN_FLAG_PUSH_BUTTON);
        const isRadio = !!(fieldFlags & BTN_FLAG_RADIO);

        if (isPush) {
            return {
                ...base,
                posStyle: { ...base.posStyle, fontSize: fontSizeFromRect(viewportRect, 'singleline') },
                inputType: 'button',
                label:     annotation.fieldValue || fieldName || 'Button',
            };
        }

        const exportValue    = annotation.buttonValue ?? annotation.exportValue ?? 'Yes';
        const checkedExport  = annotation.fieldValue ?? '';

        if (isRadio) {
            return {
                ...base,
                inputType:    'radio',
                exportValue,
                groupName:    fieldName,
                checked:      checkedExport === exportValue,
            };
        }

        // Checkbox
        return {
            ...base,
            inputType:    'checkbox',
            exportValue,
            checked:      !!(annotation.fieldValue && annotation.fieldValue !== 'Off' && annotation.fieldValue !== ''),
        };
    }

    // ── Choice (dropdown / listbox) ───────────────────────────────────────────
    if (fieldType === 'Ch') {
        const isMulti = !!(fieldFlags & CH_FLAG_MULTISELECT);
        const isCombo = !!(fieldFlags & CH_FLAG_COMBO) || annotation.combo === true;
        const options = (annotation.options || []).map(opt =>
            typeof opt === 'string'
                ? { label: opt,                   value: opt }
                : { label: opt.displayValue || opt.exportValue, value: opt.exportValue }
        );

        // fieldValue might be string or array
        let initialValue = annotation.fieldValue ?? (isMulti ? [] : '');
        if (isMulti && !Array.isArray(initialValue)) {
            initialValue = initialValue ? [initialValue] : [];
        }

        return {
            ...base,
            posStyle: { ...base.posStyle, fontSize: fontSizeFromRect(viewportRect, isMulti ? 'multiselect' : (isCombo ? 'singleline' : 'listbox')) },
            inputType: isMulti ? 'multiselect' : (isCombo ? 'select' : 'listbox'),
            size:      annotation.size || Math.max(2, Math.min(options.length || 2, 8)),
            options,
            value:     initialValue,
        };
    }

    return null;
};

/**
 * useFormFill – manages interactive PDF form fields extracted from PDF.js
 * annotations.  All values are reactive; call `flattenToPdfLib(form)` to
 * write them back into a pdf-lib PDFForm before serialising.
 */
export function useFormFill(page) {
    // ── Helpers ──────────────────────────────────────────────────────────────

    const _initValue = (field) => {
        const key = field.fieldName;
        if (key in page.value.form) return; // already tracked (multi-annotation group)

        let init;
        if (field.inputType === 'checkbox') {
            init = field.checked;
        } else if (field.inputType === 'radio') {
            // Use the field value that PDF reports as selected (may be '' if none)
            init = field.checked ? field.exportValue : (page.value.form[key] ?? '');
        } else if (field.inputType === 'multiselect') {
            init = Array.isArray(field.value) ? [...field.value] : [];
        } else {
            init = field.value ?? '';
        }

        page.value.form[key] = init;
        page.value.form.original[key] = Array.isArray(init) ? [...init] : init;
    };

    // ── Public API ────────────────────────────────────────────────────────────

    /**
     * Called by useFile.js after rendering each page.
     * @param {object[]} rawAnnotations   – from pdfPage.getAnnotations()
     * @param {object}   viewport         – PDF.js viewport
     */
    const setPageAnnotations = (rawAnnotations, viewport) => {
        const fields = rawAnnotations
            .map(a => processAnnotation(a, viewport))
            .filter(Boolean);

        // pageAnnotations.set(pageIndex, fields);
        page.value.annotations = fields;

        // Seed formValues (radio groups need special handling)
        const radioGroupSet = new Set();
        fields.forEach(field => {
            if (field.inputType === 'radio') {
                if (!radioGroupSet.has(field.groupName)) {
                    radioGroupSet.add(field.groupName);
                    // Find the selected radio in this group
                    const selected = fields.find(
                        f => f.inputType === 'radio' && f.groupName === field.groupName && f.checked
                    );
                    const val = selected ? selected.exportValue : '';
                    if (!(field.groupName in page.value.form)) {
                        page.value.form[field.groupName] = val;
                        page.value.form.original[field.groupName] = val;
                    }
                }
            } else {
                _initValue(field);
            }
        });
    };

    /**
     * Reset all form fields to their original (document-loaded) values.
     */
    const resetForm = () => {
        Object.keys(page.value.form.original).forEach(key => {
            const orig = page.value.form.original[key];
            page.value.form[key] = Array.isArray(orig) ? [...orig] : orig;
        });
    };

    /**
     * Write the current formValues back into a pdf-lib PDFForm.
     * Call this inside handleSaveFile before serialising.
     *
     * @param {import('pdf-lib').PDFForm} pdfForm
     */
    const flattenToPdfLib = (pdfForm) => {
        if (!pdfForm) return;

        const tryField = (getter, name, fn) => {
            try {
                const field = getter.call(pdfForm, name);
                if (field) fn(field);
            } catch (_) {
                // field not found or type mismatch – skip silently
            }
        };

        const handledGroups = new Set();

        page.value.annotations.forEach(field => {
            const key = field.fieldName;
            const val = page.value.form[key];

            if (field.inputType === 'text' || field.inputType === 'textarea') {
                tryField(pdfForm.getTextField, key, (f) => {
                    try { f.setText(String(val ?? '')); } catch (_) {}
                });
            } else if (field.inputType === 'checkbox') {
                tryField(pdfForm.getCheckBox, key, (f) => {
                    try { val ? f.check() : f.uncheck(); } catch (_) {}
                });
            } else if (field.inputType === 'radio') {
                if (!handledGroups.has(key)) {
                    handledGroups.add(key);
                    tryField(pdfForm.getRadioGroup, key, (f) => {
                        try { if (val) f.select(String(val)); } catch (_) {}
                    });
                }
            } else if (field.inputType === 'select') {
                tryField(pdfForm.getDropdown, key, (f) => {
                    try { if (val) f.select(String(val)); } catch (_) {}
                });
            } else if (field.inputType === 'listbox') {
                tryField(pdfForm.getOptionList, key, (f) => {
                    try { if (val) f.select(String(val)); } catch (_) {}
                });
            } else if (field.inputType === 'multiselect') {
                tryField(pdfForm.getOptionList, key, (f) => {
                    try {
                        if (Array.isArray(val) && val.length > 0) {
                            f.select(val.map(String));
                        }
                    } catch (_) {}
                });
            }
        });
    };

    return {
        resetForm,
        setPageAnnotations,
        flattenToPdfLib,
    };
}
