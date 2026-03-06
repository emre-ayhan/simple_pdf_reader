import { ref, watch } from 'vue';

// PDF.js button field flag bitmasks
const BTN_FLAG_RADIO        = 1 << 15; // 32768
const BTN_FLAG_PUSH_BUTTON  = 1 << 16; // 65536

// PDF.js choice field flag bitmask
const CH_FLAG_COMBO         = 1 << 17; // 131072
const CH_FLAG_MULTISELECT   = 1 << 21; // 2097152

// Text field flag bitmask
const TX_FLAG_MULTILINE     = 1 << 12; // 4096
const TX_FLAG_READONLY      = 1;

const CALC_OPS = new Set(['SUM', 'PRD', 'AVG', 'MIN', 'MAX']);

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

const parseNumberOrZero = (value) => {
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : 0;
    }
    if (typeof value !== 'string') {
        return 0;
    }
    const normalized = value.trim().replace(/,/g, '');
    if (!normalized) return 0;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
};

const hasUserValue = (value) => {
    if (value === null || value === undefined) return false;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === 'string') return value.trim() !== '';
    return true;
};

const formatCalculatedValue = (value) => {
    if (!Number.isFinite(value)) return '';
    if (Number.isInteger(value)) return String(value);
    return String(Number(value.toFixed(6)));
};

const getCalcScriptsFromAnnotation = (annotation) => {
    const scripts = [];
    const visited = new Set();

    const maybePush = (value) => {
        if (typeof value !== 'string') return;
        if (/AFSimple_Calculate\s*\(/i.test(value)) {
            scripts.push(value);
        }
    };

    const walk = (node, depth = 0) => {
        if (!node || depth > 8) return;

        const nodeType = typeof node;
        if (nodeType === 'string') {
            maybePush(node);
            return;
        }

        if (nodeType !== 'object') return;
        if (visited.has(node)) return;
        visited.add(node);

        if (Array.isArray(node)) {
            node.forEach(item => walk(item, depth + 1));
            return;
        }

        const keys = Object.keys(node);
        keys.forEach(key => {
            const value = node[key];
            const keyLower = String(key).toLowerCase();

            if (typeof value === 'string') {
                if (keyLower === 'js' || keyLower === 'javascript' || keyLower === 'c' || keyLower === 'calculate') {
                    maybePush(value);
                } else {
                    maybePush(value);
                }
                return;
            }

            walk(value, depth + 1);
        });
    };

    walk(annotation);

    return scripts;
};

const parseSimpleCalcRule = (script, targetField) => {
    if (!script || !targetField) return null;

    const compactScript = String(script).replace(/\s+/g, ' ');
    const match = compactScript.match(/AFSimple_Calculate\(\s*['\"](SUM|PRD|AVG|MIN|MAX)['\"]\s*,\s*(?:new\s+Array\s*)?\(([^)]*)\)\s*\)/i);
    if (!match) return null;

    const op = String(match[1] || '').toUpperCase();
    if (!CALC_OPS.has(op)) return null;

    const args = match[2] || '';
    const fieldNames = [];
    const quoteRegex = /['\"]([^'\"]+)['\"]/g;
    let token;
    while ((token = quoteRegex.exec(args)) !== null) {
        if (token[1]) fieldNames.push(token[1]);
    }

    if (fieldNames.length === 0) return null;

    return {
        targetField,
        op,
        sourceFields: fieldNames,
    };
};

const parseEventSumRule = (script, targetField) => {
    if (!script || !targetField) return null;

    const compactScript = String(script).replace(/\s+/g, ' ');
    if (!/event\.value\s*=/.test(compactScript)) return null;
    if (!/\+/.test(compactScript)) return null;

    const fieldNames = [];
    const fieldRegex = /getField\(\s*['\"]([^'\"]+)['\"]\s*\)\.value/gi;
    let token;
    while ((token = fieldRegex.exec(compactScript)) !== null) {
        if (token[1]) fieldNames.push(token[1]);
    }

    if (fieldNames.length < 2) return null;

    return {
        targetField,
        op: 'SUM',
        sourceFields: fieldNames,
    };
};

const extractCalculationRules = (rawAnnotations) => {
    const rules = [];
    const targetSeen = new Set();

    rawAnnotations.forEach(annotation => {
        const targetField = annotation?.fieldName || annotation?.id;
        if (!targetField || targetSeen.has(targetField)) return;

        const scripts = getCalcScriptsFromAnnotation(annotation);
        for (const script of scripts) {
            const rule = parseSimpleCalcRule(script, targetField) || parseEventSumRule(script, targetField);
            if (!rule) continue;
            rules.push(rule);
            targetSeen.add(targetField);
            break;
        }
    });

    return rules;
};

const extractPageIndexFromDest = (dest) => {
    if (Array.isArray(dest) && dest.length > 0) {
        const first = Number(dest[0]);
        if (Number.isInteger(first) && first >= 0) return first;
    }
    if (typeof dest === 'number' && Number.isInteger(dest) && dest >= 0) return dest;
    return null;
};

const parseButtonAction = (annotation) => {
    const visited = new Set();
    let found = null;

    const setFound = (action) => {
        if (!found && action) found = action;
    };

    const normalizeString = (value) => String(value || '').trim();

    const inspectObject = (obj) => {
        if (!obj || typeof obj !== 'object') return;

        const keys = Object.keys(obj);
        const lowerMap = keys.reduce((acc, key) => {
            acc[key.toLowerCase()] = obj[key];
            return acc;
        }, {});

        const submitRaw = lowerMap.submitform ?? lowerMap.submit ?? lowerMap.submiturl;
        if (submitRaw && !found) {
            const url = typeof submitRaw === 'string'
                ? submitRaw
                : (submitRaw.url || submitRaw.uri || submitRaw.unsafeurl || submitRaw.f || '');
            if (url) {
                const method = normalizeString(submitRaw.method || lowerMap.method || 'POST').toUpperCase();
                setFound({ type: 'submit', url, method: method === 'GET' ? 'GET' : 'POST' });
                return;
            }
        }

        if ((lowerMap.resetform || lowerMap.reset) && !found) {
            setFound({ type: 'reset' });
            return;
        }

        const uri = lowerMap.uri || lowerMap.url || lowerMap.unsafeurl;
        if (typeof uri === 'string' && normalizeString(uri) && !found) {
            setFound({ type: 'link', url: normalizeString(uri) });
            return;
        }

        const namedAction = normalizeString(lowerMap.namedaction || lowerMap.named || lowerMap.action || lowerMap.n || '');
        if (namedAction && !found) {
            const named = namedAction.toLowerCase();
            if (named.includes('firstpage')) setFound({ type: 'navigate', target: 'first' });
            else if (named.includes('lastpage')) setFound({ type: 'navigate', target: 'last' });
            else if (named.includes('nextpage')) setFound({ type: 'navigate', target: 'next' });
            else if (named.includes('prevpage') || named.includes('previouspage')) setFound({ type: 'navigate', target: 'prev' });
            if (found) return;
        }

        const pageIndex = extractPageIndexFromDest(lowerMap.dest ?? lowerMap.d ?? lowerMap.page ?? lowerMap.pagenumber);
        if (pageIndex !== null && !found) {
            setFound({ type: 'goto', pageIndex });
            return;
        }
    };

    const walk = (node, depth = 0) => {
        if (!node || found || depth > 8) return;
        if (typeof node !== 'object') return;
        if (visited.has(node)) return;
        visited.add(node);

        if (Array.isArray(node)) {
            node.forEach(item => walk(item, depth + 1));
            return;
        }

        inspectObject(node);
        if (found) return;

        Object.values(node).forEach(value => {
            walk(value, depth + 1);
        });
    };

    walk(annotation);

    const parseNavigationHint = (raw) => {
        const text = normalizeString(raw).toLowerCase();
        if (!text) return null;

        if (text.includes('firstpage') || text === 'first' || text.startsWith('first')) {
            return { type: 'navigate', target: 'first' };
        }
        if (text.includes('lastpage') || text === 'last' || text.startsWith('last')) {
            return { type: 'navigate', target: 'last' };
        }
        if (text.includes('nextpage') || text === 'next' || text.startsWith('next')) {
            return { type: 'navigate', target: 'next' };
        }
        if (text.includes('prevpage') || text.includes('previouspage') || text === 'prev' || text === 'previous' || text.startsWith('prev')) {
            return { type: 'navigate', target: 'prev' };
        }

        return null;
    };

    if (!found) {
        const hints = [
            annotation?.fieldName,
            annotation?.buttonValue,
            annotation?.id,
            annotation?.alternativeText,
            annotation?.userName,
            annotation?.title,
        ];

        for (const hint of hints) {
            const navigationAction = parseNavigationHint(hint);
            if (navigationAction) {
                return navigationAction;
            }
        }
    }

    if (!found && annotation?.buttonValue) {
        const label = normalizeString(annotation.buttonValue).toLowerCase();
        if (label.includes('reset')) return { type: 'reset' };

        const navigationAction = parseNavigationHint(label);
        if (navigationAction) return navigationAction;
    }

    return found;
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
            const buttonAction = parseButtonAction(annotation);
            return {
                ...base,
                posStyle: { ...base.posStyle, fontSize: fontSizeFromRect(viewportRect, 'singleline') },
                inputType: 'button',
                label:     annotation.fieldValue || fieldName || 'Button',
                buttonAction,
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
export function useFormFill(page, actionButtonHandler) {
    // ── Helpers ──────────────────────────────────────────────────────────────

    const isApplyingCalculations = ref(false);

    const applyCalculationRules = () => {
        if (!page.value?.form || isApplyingCalculations.value) return;

        const rules = Array.isArray(page.value.calculationRules) ? page.value.calculationRules : [];
        if (rules.length === 0) return;

        isApplyingCalculations.value = true;
        try {
            rules.forEach(rule => {
                const sourceValues = rule.sourceFields.map(name => page.value.form[name]);
                const anySourceValue = sourceValues.some(hasUserValue);

                if (!anySourceValue) {
                    page.value.form[rule.targetField] = '';
                    return;
                }

                const numeric = sourceValues.map(parseNumberOrZero);
                let result = 0;

                if (rule.op === 'SUM') {
                    result = numeric.reduce((sum, n) => sum + n, 0);
                } else if (rule.op === 'PRD') {
                    result = numeric.reduce((prod, n) => prod * n, 1);
                } else if (rule.op === 'AVG') {
                    result = numeric.length > 0
                        ? numeric.reduce((sum, n) => sum + n, 0) / numeric.length
                        : 0;
                } else if (rule.op === 'MIN') {
                    result = numeric.length > 0 ? Math.min(...numeric) : 0;
                } else if (rule.op === 'MAX') {
                    result = numeric.length > 0 ? Math.max(...numeric) : 0;
                }

                page.value.form[rule.targetField] = formatCalculatedValue(result);
            });
        } finally {
            isApplyingCalculations.value = false;
        }
    };

    // ── Public API ────────────────────────────────────────────────────────────

    /**
     * Called by useFile.js after rendering each page.
    * @param {object}   targetPage       – page state object to update
    * @param {object[]} rawAnnotations   – from pdfPage.getAnnotations()
    * @param {object}   viewport         – PDF.js viewport
     */
    const setPageAnnotations = (targetPage, rawAnnotations, viewport) => {
        const pageState = targetPage || page.value;
        if (!pageState) return;

        const fields = rawAnnotations
            .map(a => processAnnotation(a, viewport))
            .filter(Boolean);

        // pageAnnotations.set(pageIndex, fields);
        pageState.annotations = fields;
        pageState.calculationRules = extractCalculationRules(rawAnnotations);

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
                    if (!(field.groupName in pageState.form)) {
                        pageState.form[field.groupName] = val;
                        pageState.form.original[field.groupName] = val;
                    }
                }
            } else {
                const key = field.fieldName;
                if (key in pageState.form) return;

                let init;
                if (field.inputType === 'checkbox') {
                    init = field.checked;
                } else if (field.inputType === 'radio') {
                    init = field.checked ? field.exportValue : (pageState.form[key] ?? '');
                } else if (field.inputType === 'multiselect') {
                    init = Array.isArray(field.value) ? [...field.value] : [];
                } else {
                    init = field.value ?? '';
                }

                pageState.form[key] = init;
                pageState.form.original[key] = Array.isArray(init) ? [...init] : init;
            }
        });

        if (pageState === page.value) {
            applyCalculationRules();
        }
    };

    /**
     * Reset all form fields to their original (document-loaded) values.
     */
    const resetForm = () => {
        Object.keys(page.value.form.original).forEach(key => {
            const orig = page.value.form.original[key];
            page.value.form[key] = Array.isArray(orig) ? [...orig] : orig;
        });

        applyCalculationRules();
    };

    watch(
        () => {
            if (!page.value?.annotations?.length) return [];

            return page.value.annotations.map(field => {
                if (field.inputType === 'radio') {
                    return `radio:${field.groupName}:${page.value.form[field.groupName] ?? ''}`;
                }

                const value = page.value.form[field.fieldName];
                const normalized = Array.isArray(value) ? value.join('|') : String(value ?? '');
                return `${field.fieldName}:${normalized}`;
            });
        },
        () => {
            applyCalculationRules();
        }
    );

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

    // Button actions (submit/reset/link) are not handled here since pdf-lib does not support them.
    
    const collectPdfFormValues = () => {
        const values = {};

        if (!page.value || page.value.deleted || !page.value.form) return;

        Object.keys(page.value.form).forEach(key => {
            if (key === 'original') return;
            const value = page.value.form[key];
            values[key] = Array.isArray(value) ? [...value] : value;
        });

        return values;
    };

    const openExternalUrl = (url) => {
        const normalized = String(url || '').trim();
        if (!normalized) return;
        window.open(normalized, '_blank', 'noopener,noreferrer');
    };

    const submitPdfForm = async (action) => {
        const url = String(action?.url || '').trim();
        if (!url) return;

        const method = String(action?.method || 'POST').toUpperCase() === 'GET' ? 'GET' : 'POST';
        const formValues = collectPdfFormValues();

        try {
            if (method === 'GET') {
                const query = new URLSearchParams();
                Object.entries(formValues).forEach(([key, value]) => {
                    if (Array.isArray(value)) {
                        value.forEach(item => query.append(key, String(item ?? '')));
                        return;
                    }
                    query.append(key, String(value ?? ''));
                });

                const hasQuery = url.includes('?');
                openExternalUrl(`${url}${hasQuery ? '&' : '?'}${query.toString()}`);
                return;
            }

            await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(formValues),
            });
        } catch (error) {
            console.warn('[PdfForm] submit action failed', error);
        }
    };

    const handlePdfButtonAction = async (field) => {
        const action = field?.buttonAction;
        if (!action) return;

        if (action.type === 'reset') {
            resetForm();
            return;
        }

        if (action.type === 'link') {
            openExternalUrl(action.url);
            return;
        }

        if (action.type === 'submit') {
            await submitPdfForm(action);
            return;
        }

        if (typeof actionButtonHandler === 'function') {
            actionButtonHandler(action);
            return;
        }
    };

    return {
        resetForm,
        setPageAnnotations,
        flattenToPdfLib,
        handlePdfButtonAction,
        submitPdfForm,
        collectPdfFormValues,
    };
}
