import { ref, nextTick, computed, watch } from 'vue';
import { uuid } from './useUuid.js';
import { useStore } from './useStore.js';
import { enableTouchDrawing } from './useAppPreferences.js';

const copiedStroke = ref(null);
const copiedStrokes = ref([]); // For multi-selection copy

const copyAsStroke = (stroke) => {
    if (!stroke) return;

    copiedStroke.value = stroke;

    if (copiedStrokes.value.length > 10) {
        copiedStrokes.value.shift();
    }

    copiedStrokes.value.push(copiedStroke.value);
}

const retrieveClipboardData = async () => {
    try {
        const clipboardItems = await navigator.clipboard.read();
        for (const item of clipboardItems) {
            const imageType = item.types.find(type => type.startsWith('image/'));
            if (imageType) {
                const blob = await item.getType(imageType);
                const reader = new FileReader();
                reader.onload = (e) => {
                    const dataUrl = e.target.result;
                    const img = new Image();
                    img.onload = () => {
                        const stroke = {
                            inserted: 0,
                            stroke: [{
                                type: 'image',
                                x: 0,
                                y: 0,
                                width: img.width,
                                height: img.height,
                                imageData: dataUrl
                            }]
                        };

                        const isCoppied = copiedStrokes.value.findIndex(s => s.stroke[0]?.imageData === dataUrl);

                        if (isCoppied !== -1) return;

                        copyAsStroke(stroke);
                    };
                    img.src = dataUrl;
                };
                reader.readAsDataURL(blob);
                return;
            }
        }
    } catch (err) {
        console.error('Failed to get from clipboard:', err);
    }
}

export function useDraw(pagesContainer, activePage, strokeChangeCallback) {
    const { get: storeGet, set: storeSet } = useStore();
    
    // Image cache to prevent reloading on every redraw
    const imageCache = new Map();
    
    // Drawing variables
    const isSelectModeActive = ref(false);
    const isTextSelectionMode = ref(true);
    const isTextHighlightMode = ref(false);
    const isDrawing = ref(false);
    const isEraser = ref(false);
    const drawMode = ref('pen'); // 'pen', 'line', 'rectangle', 'circle', 'text', 'highlight'
    const drawColor = ref('blue');
    const drawThickness = ref(2);
    const currentStrokeId = ref(null);
    const currentStroke = ref([]); // Current stroke being drawn
    const isStrokeHovering = ref(false);
    const isBoundingBoxHovering = ref(false);

    const handToolActive = ref(false);

    const isHandToolPanning = ref(false);
    const handPanStart = ref(null); // { x, y, scrollLeft, scrollTop }
    const handPanPointerId = ref(null);
    const handPanCanvasEl = ref(null);

    const textModesActive = computed(() => {
        // Modes where we want the PDF.js text layer to receive pointer events.
        return isTextSelectionMode.value || isTextHighlightMode.value;
    })

    const getScrollContainer = () => {
        // The element with overflow scrolling is `.pdf-reader`.
        // `pagesContainer` is inside it, so we can resolve it via closest().
        const el = pagesContainer?.value;
        if (!el) return null;
        return el.closest?.('.pdf-reader') || el;
    };

    const colors = [
        'black', 'dimgray', 'gray', 'darkgray', 'silver', 'white',
        'magenta', 'red', 'orangered', 'orange', 'gold', 'yellow',
        'green', 'darkgreen', 'lime', 'teal', 'cyan', 'navy',
        'blue', 'darkblue', 'royalblue', 'purple', 'magenta', 'pink',
        'brown', 'sienna', 'olive', 'maroon'
    ];

    const initialStrokeIndex = ref(0);

    const showStrokeStyleMenu = ref(false);

    const initialStrokeStyles = ref([{
        color: '#0066ff',
        thickness: 2
    }, {
        color: '#ff0000',
        thickness: 2
    }, {
        color: '#00cc00',
        thickness: 2
    }, {
        color: '#ff9900',
        thickness: 2
    }]);

    const activeStrokeStyle = computed(() => {
        return initialStrokeStyles.value.find(style => style.color === drawColor.value) || null;
    });

    storeGet('initialStrokeStyles').then(value => {
        if (Array.isArray(value) && value.length === 4) {
            initialStrokeStyles.value = value;
        }
    })

    storeGet('initialStrokeIndex', 0).then(value => {
        initialStrokeIndex.value = value;
        const style = initialStrokeStyles.value[value];
        if (!style) return;
        drawColor.value = style.color;
        drawThickness.value = style.thickness;
    });

    const setInitialStrokeColor = (color) => {
        const index = initialStrokeStyles.value.findIndex(style => style.color === drawColor.value);
        
        if (index === -1) return;
        initialStrokeStyles.value[index].color = color;
        drawColor.value = color;
        // Persist to store
        storeSet('initialStrokeStyles', initialStrokeStyles.value);
    }

    const setInitialStrokeThickness = (thickness) => {
        const index = initialStrokeStyles.value.findIndex(style => style.color === drawColor.value);
        if (index === -1) return;
        initialStrokeStyles.value[index].thickness = thickness*1;
        drawThickness.value = thickness*1;
        // Persist to store
        storeSet('initialStrokeStyles', initialStrokeStyles.value);
    }

    const handleStrokeStyleButtonClick = (index) => {
        if (index < 0 || index >= initialStrokeStyles.value.length) return;
        const style = initialStrokeStyles.value[index];

        if (style.color === drawColor.value) {
            showStrokeStyleMenu.value = !showStrokeStyleMenu.value;
            return;
        }

        drawColor.value = style.color;
        drawThickness.value = style.thickness;
        initialStrokeIndex.value = index;
        storeSet('initialStrokeIndex', index);
    }


    // Text mode variables
    const DEFAULT_TEXT_COLOR = '#000000';
    const TEXT_RENDER_OVERFLOW_ALLOWANCE_FACTOR = 0.2;
    const isTextInputMode = ref(false);
    const textPosition = ref(null);
    const textCanvasIndex = ref(-1);
    const fontSize = ref(16);
    const textboxPosition = ref(null); // Screen position for the textbox
    const textEditorHtml = ref('');
    const textEditorBounds = ref(null); // Canvas coordinates
    const textEditorPosition = ref(null)
    const textEditorSimpleMode = ref(true);
    const editingTextStroke = ref(null); // { pageId, pageIndex, strokeIndex }
    const textEditorPreferredSize = ref({ width: 420, height: 256 });

    storeGet('textEditorPreferredSize').then(value => {
        if (!value || typeof value !== 'object') return;
        const width = Number(value.width);
        const height = Number(value.height);
        if (!Number.isFinite(width) || !Number.isFinite(height)) return;
        if (width <= 0 || height <= 0) return;
        textEditorPreferredSize.value = { width, height };
    });

    // Selection & Capture variables
    const isSelectionMode = ref(false);
    const selectionStart = ref(null);
    const selectionEnd = ref(null);
    const isSelecting = ref(false);

    const handleSelectionStart = (e) => {
        const rect = e.target.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        selectionStart.value = { x, y, canvasIndex: getCanvasIndexFromEvent(e) };
        selectionEnd.value = { x, y };
        isSelecting.value = true;
        stopEvent(e);
    }

    const handleSelectionRectangle = (e) => {
        const rect = e.target.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        selectionEnd.value = { x, y };
        
        // Draw selection rectangle
        const page = activePage.value;
        const canvas = page.drawingCanvas;
        const ctx = page.drawingContext;
        if (canvas && ctx) {
            // Scale coordinates to canvas size
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;
            
            redrawAllStrokes();
            ctx.strokeStyle = boundingBoxColors.rotate;
            ctx.lineWidth = 1;
            ctx.setLineDash([5, 5]);
            
            const startX = selectionStart.value.x * scaleX;
            const startY = selectionStart.value.y * scaleY;
            const width = (x - selectionStart.value.x) * scaleX;
            const height = (y - selectionStart.value.y) * scaleY;
            
            ctx.strokeRect(startX, startY, width, height);
            ctx.setLineDash([]);
        }
        stopEvent(e);
    }

    const handleSelectionEnd = (e) => {
        if (isSelectionMode.value) {
            captureSelection();
        } else if (isSelectModeActive.value) {
            selectStrokeInSelectionBox();
        }

        isSelecting.value = false;
        selectionStart.value = null;
        selectionEnd.value = null;
        isSelectionMode.value = false;
        stopEvent(e);
        isMouseDown.value = false;
    }

    // Stroke selection and dragging
    const selectedStrokes = ref([]); // For multi-selection
    const selectedStroke = ref(null); // { pageIndex, strokeIndex, stroke }
    const isDragging = ref(false);
    const dragOffset = ref({ x: 0, y: 0 });
    const dragStartPos = ref(null);
    const strokeMenu = ref(null);
    const showStrokeMenu = ref(false);
    const strokeMenuPosition = ref({ x: 0, y: 0 });
    const isResizing = ref(false);
    const resizeHandle = ref(null); // 'nw', 'ne', 'sw', 'se', 'n', 's', 'e', 'w'
    const resizeStartBounds = ref(null);
    const isRotating = ref(false);
    const rotateStartCenter = ref(null);
    const rotateStartAngle = ref(0);

    const resizeCursor = computed(() => {
        if ((!isBoundingBoxHovering.value) && !isResizing.value && !isRotating.value) return null;
        const handle = resizeHandle.value;
        if (!handle) return null;
        if (handle === 'rotate') {
            // Simple rotation cursor using a circular arrow SVG
            const svg = encodeURIComponent(
                `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="#0066ff"><path d="M8 3a5 5 0 1 1-3.535 8.535.75.75 0 1 0-1.06 1.06A6.5 6.5 0 1 0 8 1.5v1.75a.75.75 0 0 0 1.28.53l2.5-2.5A.75.75 0 0 0 11.5.5h-4a.75.75 0 0 0-.75.75V3A5 5 0 0 1 8 3z"/></svg>`
            );
            return `url("data:image/svg+xml;utf8,${svg}") 8 8, auto`;
        }
        if (handle === 'n' || handle === 's') return 'ns-resize';
        if (handle === 'e' || handle === 'w') return 'ew-resize';
        if (handle === 'ne' || handle === 'sw') return 'nesw-resize';
        if (handle === 'nw' || handle === 'se') return 'nwse-resize';
        return null;
    })

    // Check Selected Stroke Type
    const isSelectedStrokeType = (type) => {
        if (!selectedStroke.value) return false;
        const first = selectedStroke.value.stroke[0];
        return first.type === type;
    };

    // Copy Selected Stroke
    const copySelectedStroke = () => {
        if (!selectedStroke.value) return;
        const isMulti = Array.isArray(selectedStrokes.value) && selectedStrokes.value.length > 1;
        if (isMulti) {
            const pageId = selectedStroke.value.pageId;
            const group = selectedStrokes.value
                .filter(sel => sel.pageId === pageId)
                .map(sel => JSON.parse(JSON.stringify(sel.stroke)));
            copyAsStroke({
                strokes: group,
                inserted: 0
            });
        } else {
            copyAsStroke({
                stroke: JSON.parse(JSON.stringify(selectedStroke.value.stroke)),
                inserted: 0
            });
        }
    };

    const selectStrokes = (strokes) => {
        if (!Array.isArray(strokes) || strokes.length === 0) return;
        const page = activePage.value;

        const selections = strokes.map((stroke, strokeIndex) => {
            return {
                pageId: page.id,
                pageIndex: page.index,
                strokeIndex,
                stroke,
                originalStroke: JSON.parse(JSON.stringify(stroke))
            }
        })

        selectedStrokes.value = selections;
        selectedStroke.value = selections[0] || null;
        showStrokeMenu.value = true;

        redrawAllStrokes();
        drawSelectionBoundingBox();
    }

    // Insert Copied Stroke
    const insertCopiedStroke = () => {
        if (!copiedStroke.value) return;

        const page = activePage.value;

        // Determine the visible center in canvas coordinates for placement
        const getVisibleCenterOnCanvas = () => {
            const canvas = page.drawingCanvas;
            if (!canvas) return { cx: 0, cy: 0 };
            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;

            const viewportW = window.innerWidth || document.documentElement.clientWidth;
            const viewportH = window.innerHeight || document.documentElement.clientHeight;

            const visibleLeft = Math.max(rect.left, 0);
            const visibleRight = Math.min(rect.right, viewportW);
            const visibleTop = Math.max(rect.top, 0);
            const visibleBottom = Math.min(rect.bottom, viewportH);

            const centerClientX = (visibleLeft + visibleRight) / 2;
            const centerClientY = (visibleTop + visibleBottom) / 2;

            const cx = (centerClientX - rect.left) * scaleX;
            const cy = (centerClientY - rect.top) * scaleY;
            return { cx, cy };
        };

        // Translate stroke by dx, dy according to its type
        const translateStroke = (stroke, dx, dy) => {
            const first = stroke[0];
            if (first.type === 'image') {
                first.x += dx;
                first.y += dy;
            } else if (first.type === 'highlight-rect') {
                const rects = first.rects || [{ x: first.x, y: first.y, width: first.width, height: first.height }];
                rects.forEach(rect => { rect.x += dx; rect.y += dy; });
                if (first.x !== undefined) { first.x += dx; first.y += dy; }
            } else if (first.type === 'text') {
                first.x += dx;
                first.y += dy;
            } else if (first.type === 'line' || first.type === 'rectangle' || first.type === 'circle') {
                first.startX += dx;
                first.startY += dy;
                first.endX += dx;
                first.endY += dy;
                first.x = first.startX;
                first.y = first.startY;
            } else {
                for (let point of stroke) { point.x += dx; point.y += dy; }
            }
        };

        const { cx: visibleCX, cy: visibleCY } = getVisibleCenterOnCanvas();

        // Determine if we copied a group or a single stroke
        const group = copiedStroke.value.strokes;
        if (Array.isArray(group)) {
            const insertedCount = copiedStroke.value.inserted++;
            const offset = 20 * (insertedCount + 1);
            const newSelections = [];

            // Compute combined group bounds center
            let gMinX = Infinity, gMinY = Infinity, gMaxX = -Infinity, gMaxY = -Infinity;
            group.forEach(s => {
                const b = getStrokeBounds(s, 0);
                if (!b) return;
                gMinX = Math.min(gMinX, b.minX);
                gMinY = Math.min(gMinY, b.minY);
                gMaxX = Math.max(gMaxX, b.maxX);
                gMaxY = Math.max(gMaxY, b.maxY);
            });
            const gCenterX = (gMinX + gMaxX) / 2;
            const gCenterY = (gMinY + gMaxY) / 2;
            const baseDX = (visibleCX - gCenterX) + offset;
            const baseDY = (visibleCY - gCenterY) + offset;

            group.forEach(orig => {
                const newStroke = JSON.parse(JSON.stringify(orig));
                const newId = uuid();
                // assign id to all points consistently
                if (newStroke[0]) newStroke[0].id = newId;
                if (newStroke.length > 1) newStroke.forEach(p => { p.id = newId; });

                translateStroke(newStroke, baseDX, baseDY);

                page.strokes.push(newStroke);
                strokeChangeCallback({ id: newId, type: 'add', page: page, stroke: newStroke });
                const strokeIndex = page.strokes.length - 1;
                newSelections.push({ pageIndex: page.index, pageId: page.id, strokeIndex, stroke: newStroke });
            });

            selectedStrokes.value = newSelections;
            const last = newSelections[newSelections.length - 1];
            selectedStroke.value = last ? { ...last, originalStroke: JSON.parse(JSON.stringify(last.stroke)) } : null;
            showStrokeMenu.value = true;
            redrawAllStrokes();
            if (selectedStroke.value) {
                drawSelectionBoundingBox();
            }
            return;
        }

        // Offset the copied stroke slightly for visibility (single)
        const newStroke = JSON.parse(JSON.stringify(copiedStroke.value.stroke));
        const insertedCount = copiedStroke.value.inserted++;

        const offset = 20*(insertedCount + 1);
        const newId = uuid();
        if (newStroke[0]) newStroke[0].id = newId;
        if (newStroke.length > 1) newStroke.forEach(p => { p.id = newId; });

        // Center the stroke within the visible area, then apply slight offset
        const b = getStrokeBounds(newStroke, 0);
        if (b) {
            const cX = (b.minX + b.maxX) / 2;
            const cY = (b.minY + b.maxY) / 2;
            const dx = (visibleCX - cX) + offset;
            const dy = (visibleCY - cY) + offset;
            translateStroke(newStroke, dx, dy);
        } else {
            // Fallback: just apply offset
            translateStroke(newStroke, offset, offset);
        }

        page.strokes.push(newStroke);
        strokeChangeCallback({
            id: newId,
            type: 'add',
            page,
            stroke: newStroke
        });

        const strokeIndex = page.strokes.length - 1;

        selectedStroke.value = {
            pageId: page.id,
            pageIndex: page.index,
            strokeIndex,
            stroke: newStroke,
            originalStroke: JSON.parse(JSON.stringify(newStroke))
        };

        showStrokeMenu.value = true;

        redrawAllStrokes();
        drawSelectionBoundingBox();
    };


    // Clamp when menu opens (now that refs are available)
    watch(showStrokeMenu, (visible) => {
        if (visible) {
            clampStrokeMenuPosition();
        }
    });

    // Clamp on position changes (e.g., programmatic updates)
    watch(() => strokeMenuPosition.value, () => {
        if (showStrokeMenu.value) {
            clampStrokeMenuPosition();
        }
    }, { deep: true });


    let lastX = 0;
    let lastY = 0;
    let startX = 0;
    let startY = 0;
    let canvasSnapshot = null;
    let currentCanvasIndex = -1;

    const isMouseDown = ref(false);
    const activePointerId = ref(null);
    const activePointerType = ref(null);
    const isPenHovering = ref(false);

    const stopEvent = (e) => {
        if (!e) return;
        if (typeof e.preventDefault === 'function') e.preventDefault();
        if (typeof e.stopPropagation === 'function') e.stopPropagation();
    };

    const isSecondaryPointerAction = (e) => {
        if (!e) return false;
        if (e.button === 2) return true;
        if (typeof e.buttons === 'number' && (e.buttons & 2) === 2) return true;
        return false;
    };

    const getEventClientXY = (e) => {
        if (e?.clientX !== undefined && e?.clientY !== undefined) {
            return { clientX: e.clientX, clientY: e.clientY };
        }
        const touch = e?.touches?.[0] || e?.changedTouches?.[0];
        return {
            clientX: touch?.clientX ?? 0,
            clientY: touch?.clientY ?? 0
        };
    };

    const getCanvasPointFromEvent = (canvas, e) => {
        if (!canvas) return null;
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const { clientX, clientY } = getEventClientXY(e);
        return {
            rect,
            scaleX,
            scaleY,
            clientX,
            clientY,
            x: (clientX - rect.left) * scaleX,
            y: (clientY - rect.top) * scaleY
        };
    };

    const getCanvasIndexFromEvent = (e) => {
        if (activePage.value.drawingCanvas === e.target) {
            return activePage.value.index;
        }

        return -1;
    };

    const drawShape = (ctx, type, startX, startY, endX, endY, stroke = null) => {
        if (type === 'line') {
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.lineTo(endX, endY);
            ctx.stroke();
        } else if (type === 'rectangle') {
            ctx.strokeRect(startX, startY, endX - startX, endY - startY);
        } else if (type === 'circle') {
            ctx.beginPath();
            if (stroke && (stroke.radiusX !== undefined || stroke.radiusY !== undefined)) {
                // Draw as ellipse
                const rx = stroke.radiusX !== undefined ? stroke.radiusX : Math.abs(endX - startX);
                const ry = stroke.radiusY !== undefined ? stroke.radiusY : Math.abs(endY - startY);
                ctx.ellipse(startX, startY, rx, ry, 0, 0, 2 * Math.PI);
            } else {
                // Draw as perfect circle
                const radius = Math.sqrt(Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2));
                ctx.arc(startX, startY, radius, 0, 2 * Math.PI);
            }
            ctx.stroke();
        }
    };

    const drawWrappedText = (ctx, text, x, y, width, height, lineHeight) => {
        if (!text) return;

        const safeWidth = Math.max(20, width || 20);
        const safeHeight = Math.max(lineHeight, height || lineHeight);
        const overflowAllowance = Math.max(2, lineHeight * TEXT_RENDER_OVERFLOW_ALLOWANCE_FACTOR);
        const maxY = y + safeHeight + overflowAllowance;
        const paragraphs = String(text).split('\n');
        let cursorY = y;

        for (let p = 0; p < paragraphs.length; p++) {
            const paragraph = paragraphs[p] || '';
            const words = paragraph.split(/\s+/).filter(Boolean);

            if (words.length === 0) {
                if (cursorY + lineHeight > maxY) break;
                cursorY += lineHeight;
                continue;
            }

            let currentLine = '';

            for (let i = 0; i < words.length; i++) {
                const testLine = currentLine ? `${currentLine} ${words[i]}` : words[i];
                const testWidth = ctx.measureText(testLine).width;

                if (testWidth > safeWidth && currentLine) {
                    if (cursorY + lineHeight > maxY) return;
                    ctx.fillText(currentLine, x, cursorY);
                    currentLine = words[i];
                    cursorY += lineHeight;
                    continue;
                }

                currentLine = testLine;
            }

            if (currentLine) {
                if (cursorY + lineHeight > maxY) return;
                ctx.fillText(currentLine, x, cursorY);
                cursorY += lineHeight;
            }
        }
    };

    const extractPlainTextFromHtml = (html) => {
        const htmlValue = String(html || '');
        if (!htmlValue.trim()) return '';

        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(`<div>${htmlValue}</div>`, 'text/html');
            const root = doc.body.firstElementChild || doc.body;
            if (!root) return '';

            const blocks = new Set(['P', 'DIV', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6']);
            let text = '';

            const visit = (node) => {
                if (!node) return;

                if (node.nodeType === Node.TEXT_NODE) {
                    text += node.nodeValue || '';
                    return;
                }

                if (node.nodeType !== Node.ELEMENT_NODE) return;

                const tag = node.tagName;
                if (tag === 'BR') {
                    text += '\n';
                    return;
                }

                const children = Array.from(node.childNodes || []);
                children.forEach(visit);

                if (blocks.has(tag)) {
                    text += '\n';
                }
            };

            Array.from(root.childNodes || []).forEach(visit);

            return text
                .replace(/\u00A0/g, ' ')
                .replace(/\r/g, '')
                .replace(/[ \t]+\n/g, '\n')
                .replace(/\n[ \t]+/g, '\n')
                .replace(/\n{3,}/g, '\n\n')
                .trim();
        } catch (err) {
            return htmlValue
                .replace(/<br\s*\/?>/gi, '\n')
                .replace(/<[^>]+>/g, '')
                .replace(/\s+/g, ' ')
                .trim();
        }
    };

    const normalizeTextStrokeContent = (content) => {
        if (!content) {
            return { text: '', html: '' };
        }


        if (typeof content === 'string') {
            const html = content;
            return {
                text: extractPlainTextFromHtml(html),
                html
            };
        }

        const html = typeof content.html === 'string' ? content.html : '';
        const text = typeof content.text === 'string' ? content.text : extractPlainTextFromHtml(html);
        return { text, html };
    };

    const getTextStrokeContent = (strokeOrFirst) => {
        const first = Array.isArray(strokeOrFirst) ? strokeOrFirst[0] : strokeOrFirst;
        if (!first) return { text: '', html: '' };

        if (first.content !== undefined && first.content !== null) {
            return normalizeTextStrokeContent(first.content);
        }

        const fallbackText = typeof first.text === 'string' ? first.text : '';
        return {
            text: fallbackText,
            html: fallbackText ? convertPlainTextToHtml(fallbackText) : ''
        };
    };

    const parseInlineStyle = (styleText = '') => {
        const style = {};
        const parts = String(styleText)
            .split(';')
            .map(part => part.trim())
            .filter(Boolean);

        parts.forEach(part => {
            const [rawKey, ...rawValueParts] = part.split(':');
            if (!rawKey || rawValueParts.length === 0) return;
            const key = rawKey.trim().toLowerCase();
            const value = rawValueParts.join(':').trim();

            if (key === 'color' && value) {
                style.color = value;
                return;
            }

            if ((key === 'background' || key === 'background-color') && value && value !== 'transparent') {
                style.backgroundColor = value;
                return;
            }

            if (key === 'font-size') {
                const parsed = parseFloat(value);
                if (Number.isFinite(parsed) && parsed > 0) {
                    style.fontSize = parsed;
                }
            }

            if (key === 'text-align' && value) {
                style.align = String(value).toLowerCase();
                return;
            }

            if (key === 'text-decoration' && value) {
                const lowered = String(value).toLowerCase();
                if (lowered.includes('underline')) style.underline = true;
                if (lowered.includes('line-through')) style.strike = true;
                return;
            }

            if (key === 'vertical-align' && value) {
                const lowered = String(value).toLowerCase();
                if (lowered.includes('super')) style.script = 'super';
                if (lowered.includes('sub')) style.script = 'sub';
            }
        });

        return style;
    };

    const htmlToStyledTokens = (html, baseStyle) => {
        const htmlValue = String(html || '').trim();
        if (!htmlValue) return [];

        const pushNewline = (tokens, { allowConsecutive = false } = {}) => {
            if (!allowConsecutive && (tokens.length === 0 || tokens[tokens.length - 1].type === 'newline')) return;
            tokens.push({ type: 'newline' });
        };

        const applyElementStyle = (style, node) => {
            const nextStyle = { ...style };
            const tag = node.tagName;
            const classList = String(node.getAttribute('class') || '')
                .split(/\s+/)
                .filter(Boolean);

            if (tag === 'STRONG' || tag === 'B') nextStyle.bold = true;
            if (tag === 'EM' || tag === 'I') nextStyle.italic = true;
            if (tag === 'U') nextStyle.underline = true;
            if (tag === 'S' || tag === 'STRIKE') nextStyle.strike = true;
            if (tag === 'SUP') nextStyle.script = 'super';
            if (tag === 'SUB') nextStyle.script = 'sub';

            if (tag === 'A') {
                nextStyle.link = true;
                nextStyle.underline = true;
                if (!nextStyle.color) {
                    nextStyle.color = '#1a0dab';
                }
            }

            const headingScaleByTag = {
                H1: 2,
                H2: 1.5,
                H3: 1.25,
                H4: 1.1,
                H5: 1,
                H6: 0.9
            };
            const headingScale = headingScaleByTag[tag];
            if (headingScale) {
                nextStyle.fontSize = Math.max(nextStyle.fontSize, Math.round(baseStyle.fontSize * headingScale));
            }

            classList.forEach((className) => {
                const alignMatch = className.match(/^ql-align-(left|center|right|justify)$/);
                if (alignMatch) {
                    nextStyle.align = alignMatch[1];
                }

                const indentMatch = className.match(/^ql-indent-(\d+)$/);
                if (indentMatch) {
                    nextStyle.indentLevel = Number(indentMatch[1]) || 0;
                }

                const sizeMatch = className.match(/^ql-size-(small|large|huge)$/);
                if (sizeMatch) {
                    if (sizeMatch[1] === 'small') nextStyle.fontSize = Math.max(8, Math.round(baseStyle.fontSize * 0.8));
                    if (sizeMatch[1] === 'large') nextStyle.fontSize = Math.max(nextStyle.fontSize, Math.round(baseStyle.fontSize * 1.25));
                    if (sizeMatch[1] === 'huge') nextStyle.fontSize = Math.max(nextStyle.fontSize, Math.round(baseStyle.fontSize * 1.5));
                }
            });

            const inlineStyle = parseInlineStyle(node.getAttribute('style') || '');
            if (inlineStyle.color) nextStyle.color = inlineStyle.color;
            if (inlineStyle.backgroundColor) nextStyle.backgroundColor = inlineStyle.backgroundColor;
            if (inlineStyle.fontSize) nextStyle.fontSize = inlineStyle.fontSize;
            if (inlineStyle.align) nextStyle.align = inlineStyle.align;
            if (inlineStyle.underline) nextStyle.underline = true;
            if (inlineStyle.strike) nextStyle.strike = true;
            if (inlineStyle.script) nextStyle.script = inlineStyle.script;

            if (!nextStyle.align) nextStyle.align = 'left';
            if (!Number.isFinite(nextStyle.indentLevel)) nextStyle.indentLevel = 0;

            return nextStyle;
        };

        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(`<div>${htmlValue}</div>`, 'text/html');
            const root = doc.body.firstElementChild || doc.body;
            if (!root) return [];

            const tokens = [];
            const blockTags = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6']);

            const walk = (node, style, listState = null) => {
                if (!node) return;

                if (node.nodeType === Node.TEXT_NODE) {
                    const raw = node.nodeValue || '';
                    const normalized = raw.replace(/\u00A0/g, ' ').replace(/[\t\r\n]+/g, ' ');
                    if (!normalized) return;
                    tokens.push({ type: 'text', text: normalized, style: { ...style } });
                    return;
                }

                if (node.nodeType !== Node.ELEMENT_NODE) return;

                const tag = node.tagName;
                if (tag === 'BR') {
                    pushNewline(tokens, { allowConsecutive: true });
                    return;
                }

                if (tag === 'UL' || tag === 'OL') {
                    const listStyle = applyElementStyle(style, node);
                    pushNewline(tokens);
                    let index = 1;
                    Array.from(node.children || []).forEach((child) => {
                        if (child.tagName !== 'LI') return;
                        walk(child, listStyle, {
                            ordered: tag === 'OL',
                            index
                        });
                        index += 1;
                    });
                    pushNewline(tokens);
                    return;
                }

                const nextStyle = applyElementStyle(style, node);
                const isBlock = blockTags.has(tag);

                if (isBlock || tag === 'LI') {
                    pushNewline(tokens);
                }

                if (tag === 'LI') {
                    const marker = listState?.ordered ? `${listState.index}. ` : '• ';
                    tokens.push({ type: 'text', text: marker, style: { ...nextStyle } });
                }

                Array.from(node.childNodes || []).forEach((child) => walk(child, nextStyle, listState));

                if (isBlock || tag === 'LI') {
                    pushNewline(tokens);
                }
            };

            Array.from(root.childNodes || []).forEach(node => walk(node, { ...baseStyle }));

            while (tokens.length > 0 && tokens[0].type === 'newline') tokens.shift();
            while (tokens.length > 0 && tokens[tokens.length - 1].type === 'newline') tokens.pop();

            return tokens;
        } catch (err) {
            return [];
        }
    };

    const drawStyledText = (ctx, tokens, x, y, width, height, baseStyle) => {
        if (!Array.isArray(tokens) || tokens.length === 0) return;

        const safeWidth = Math.max(20, width || 20);
        const safeHeight = Math.max(baseStyle.fontSize * 1.35, height || 20);
        const overflowAllowance = Math.max(2, baseStyle.fontSize * TEXT_RENDER_OVERFLOW_ALLOWANCE_FACTOR);
        const maxY = y + safeHeight + overflowAllowance;
        const minFont = 8;
        const indentStep = 32;

        const normalizeAlign = (align) => {
            const lower = String(align || 'left').toLowerCase();
            if (lower === 'center' || lower === 'right' || lower === 'justify') return lower;
            return 'left';
        };

        const toFontMetrics = (style) => {
            const baseFontSize = Math.max(minFont, Number(style.fontSize) || baseStyle.fontSize || 16);
            const isScript = style.script === 'super' || style.script === 'sub';
            const fontSize = isScript ? Math.max(minFont, Math.round(baseFontSize * 0.75)) : baseFontSize;
            const weight = style.bold ? 'bold ' : '';
            const italic = style.italic ? 'italic ' : '';

            let baselineOffset = 0;
            if (style.script === 'super') baselineOffset = -fontSize * 0.35;
            if (style.script === 'sub') baselineOffset = fontSize * 0.2;

            return {
                font: `${italic}${weight}${fontSize}px Arial`,
                fontSize,
                lineHeight: Math.max(fontSize * 1.35, 12),
                baselineOffset
            };
        };

        let cursorY = y;
        let lineWidth = 0;
        let lineHeight = Math.max(baseStyle.fontSize * 1.35, 12);
        let lineAlign = 'left';
        let lineIndentLevel = 0;
        let hasLineStyle = false;
        let lineChunks = [];

        const resetLine = () => {
            lineWidth = 0;
            lineHeight = Math.max(baseStyle.fontSize * 1.35, 12);
            lineAlign = 'left';
            lineIndentLevel = 0;
            hasLineStyle = false;
            lineChunks = [];
        };

        const applyLineStyle = (style) => {
            if (hasLineStyle) return;
            lineAlign = normalizeAlign(style.align || 'left');
            lineIndentLevel = Math.max(0, Number(style.indentLevel) || 0);
            hasLineStyle = true;
        };

        const getIndentPixels = (level) => level * indentStep;

        const flushLine = (forceBlank = false) => {
            const hasContent = lineChunks.length > 0;
            if (!hasContent && !forceBlank) {
                resetLine();
                return true;
            }

            if (cursorY + lineHeight > maxY) return false;

            const indentPixels = getIndentPixels(lineIndentLevel);
            const availableWidth = Math.max(8, safeWidth - indentPixels);
            let drawX = x + indentPixels;
            let justifyGapCount = 0;
            let justifyExtraPerGap = 0;

            if (lineAlign === 'center') {
                drawX += Math.max(0, (availableWidth - lineWidth) / 2);
            } else if (lineAlign === 'right') {
                drawX += Math.max(0, availableWidth - lineWidth);
            } else if (lineAlign === 'justify') {
                justifyGapCount = lineChunks.reduce((count, chunk) => count + (/^\s+$/.test(chunk.text) ? 1 : 0), 0);
                if (justifyGapCount > 0) {
                    justifyExtraPerGap = Math.max(0, availableWidth - lineWidth) / justifyGapCount;
                }
            }

            lineChunks.forEach((chunk) => {
                const style = chunk.style;
                const textColor = style.color || baseStyle.color;

                if (style.backgroundColor && chunk.text.trim()) {
                    ctx.fillStyle = style.backgroundColor;
                    ctx.fillRect(drawX, cursorY, chunk.width, lineHeight);
                }

                ctx.font = chunk.font;
                ctx.fillStyle = textColor;
                ctx.textBaseline = 'top';
                ctx.fillText(chunk.text, drawX, cursorY + chunk.baselineOffset);

                if (style.underline && chunk.text.trim()) {
                    ctx.beginPath();
                    ctx.strokeStyle = textColor;
                    ctx.lineWidth = Math.max(1, chunk.fontSize / 12);
                    const underlineY = cursorY + chunk.baselineOffset + chunk.fontSize * 1.08;
                    ctx.moveTo(drawX, underlineY);
                    ctx.lineTo(drawX + chunk.width, underlineY);
                    ctx.stroke();
                }

                if (style.strike && chunk.text.trim()) {
                    ctx.beginPath();
                    ctx.strokeStyle = textColor;
                    ctx.lineWidth = Math.max(1, chunk.fontSize / 12);
                    const strikeY = cursorY + chunk.baselineOffset + chunk.fontSize * 0.58;
                    ctx.moveTo(drawX, strikeY);
                    ctx.lineTo(drawX + chunk.width, strikeY);
                    ctx.stroke();
                }

                drawX += chunk.width;
                if (lineAlign === 'justify' && justifyExtraPerGap > 0 && /^\s+$/.test(chunk.text)) {
                    drawX += justifyExtraPerGap;
                }
            });

            cursorY += lineHeight;
            resetLine();
            return true;
        };

        for (const token of tokens) {
            if (token.type === 'newline') {
                if (!flushLine(true)) return;
                continue;
            }

            const style = {
                color: token.style?.color || baseStyle.color,
                backgroundColor: token.style?.backgroundColor || null,
                fontSize: token.style?.fontSize || baseStyle.fontSize,
                bold: Boolean(token.style?.bold),
                italic: Boolean(token.style?.italic),
                underline: Boolean(token.style?.underline),
                strike: Boolean(token.style?.strike),
                script: token.style?.script || null,
                align: token.style?.align || 'left',
                indentLevel: Number(token.style?.indentLevel) || 0
            };

            const parts = String(token.text || '').split(/(\s+)/);
            for (const part of parts) {
                if (part === '') continue;
                applyLineStyle(style);
                if (/^\s+$/.test(part) && lineWidth === 0) continue;

                const metrics = toFontMetrics(style);
                ctx.font = metrics.font;
                const chunkWidth = ctx.measureText(part).width;

                const indentPixels = getIndentPixels(lineIndentLevel);
                const availableWidth = wrapWidth ? Math.max(8, wrapWidth - indentPixels) : null;

                if (lineWidth + chunkWidth > availableWidth && lineWidth > 0) {
                    if (!flushLine(false)) return;
                    applyLineStyle(style);
                }

                lineHeight = Math.max(lineHeight, metrics.lineHeight);
                lineChunks.push({
                    text: part,
                    width: chunkWidth,
                    style,
                    font: metrics.font,
                    fontSize: metrics.fontSize,
                    baselineOffset: metrics.baselineOffset
                });
                lineWidth += chunkWidth;
            }
        }

        flushLine(false);
    };

    const drawTextStroke = (ctx, first, x, y, width, height) => {
        const baseStyle = {
            color: first.color || DEFAULT_TEXT_COLOR,
            fontSize: Math.max(8, Number(first.fontSize) || 16),
            bold: false,
            italic: false,
            underline: false,
            strike: false,
            backgroundColor: null
        };

        const content = getTextStrokeContent(first);
        const tokens = htmlToStyledTokens(content.html, baseStyle);

        if (tokens.length > 0) {
            drawStyledText(ctx, tokens, x, y, width, height, baseStyle);
            return;
        }

        ctx.font = `${baseStyle.fontSize}px Arial`;
        ctx.fillStyle = baseStyle.color;
        ctx.textBaseline = 'top';
        const lineHeight = Math.max(baseStyle.fontSize * 1.25, 12);
        drawWrappedText(ctx, content.text, x, y, width, height, lineHeight);
    };

    const buildPlainTextTokens = (text, style) => {
        const lines = String(text || '').split('\n');
        const tokens = [];

        lines.forEach((line, index) => {
            if (line) {
                tokens.push({ type: 'text', text: line, style: { ...style } });
            }
            if (index < lines.length - 1) {
                tokens.push({ type: 'newline' });
            }
        });

        return tokens;
    };

    const measureTextTokens = (ctx, tokens, baseStyle, maxWidth = null) => {
        if (!ctx || !Array.isArray(tokens) || tokens.length === 0) {
            return {
                width: 24,
                height: 24
            };
        }

        const minFont = 8;
        const indentStep = 32;
        const wrapWidth = Number.isFinite(maxWidth) ? Math.max(24, maxWidth) : null;

        const toFont = (style) => {
            const baseFontSize = Math.max(minFont, Number(style.fontSize) || baseStyle.fontSize || 16);
            const isScript = style.script === 'super' || style.script === 'sub';
            const fontSize = isScript ? Math.max(minFont, Math.round(baseFontSize * 0.75)) : baseFontSize;
            const weight = style.bold ? 'bold ' : '';
            const italic = style.italic ? 'italic ' : '';
            return {
                font: `${italic}${weight}${fontSize}px Arial`,
                fontSize,
                lineHeight: Math.max(fontSize * 1.35, 12)
            };
        };

        let cursorX = 0;
        let totalY = 0;
        let lineHeight = Math.max(baseStyle.fontSize * 1.35, 12);
        let maxLineWidth = 0;
        let lineIndentLevel = 0;
        let hasLineStyle = false;

        const getIndentPixels = (level) => Math.max(0, Number(level) || 0) * indentStep;

        const commitNewLine = () => {
            maxLineWidth = Math.max(maxLineWidth, getIndentPixels(lineIndentLevel) + cursorX);
            totalY += lineHeight;
            cursorX = 0;
            lineHeight = Math.max(baseStyle.fontSize * 1.35, 12);
            lineIndentLevel = 0;
            hasLineStyle = false;
        };

        for (const token of tokens) {
            if (token.type === 'newline') {
                commitNewLine();
                continue;
            }

            const style = {
                fontSize: token.style?.fontSize || baseStyle.fontSize,
                bold: Boolean(token.style?.bold),
                italic: Boolean(token.style?.italic),
                script: token.style?.script || null,
                indentLevel: Number(token.style?.indentLevel) || 0
            };

            const parts = String(token.text || '').split(/(\s+)/);
            for (const part of parts) {
                if (part === '') continue;
                if (/^\s+$/.test(part) && cursorX === 0) continue;

                if (!hasLineStyle) {
                    lineIndentLevel = Math.max(0, style.indentLevel || 0);
                    hasLineStyle = true;
                }

                const { font, lineHeight: chunkLineHeight } = toFont(style);
                ctx.font = font;
                const chunkWidth = ctx.measureText(part).width;

                const indentPixels = getIndentPixels(lineIndentLevel);
                const availableWidth = wrapWidth ? Math.max(8, wrapWidth - indentPixels) : null;

                if (availableWidth && cursorX + chunkWidth > availableWidth && cursorX > 0) {
                    commitNewLine();
                    lineIndentLevel = Math.max(0, style.indentLevel || 0);
                    hasLineStyle = true;
                }

                lineHeight = Math.max(lineHeight, chunkLineHeight);
                cursorX += chunkWidth;
            }
        }

        maxLineWidth = Math.max(maxLineWidth, getIndentPixels(lineIndentLevel) + cursorX);
        const measuredHeight = totalY + lineHeight;
        const bottomPadding = Math.max(2, lineHeight * TEXT_RENDER_OVERFLOW_ALLOWANCE_FACTOR);

        return {
            width: Math.max(24, wrapWidth ? Math.min(maxLineWidth, wrapWidth) : maxLineWidth),
            height: Math.max(24, measuredHeight + bottomPadding)
        };
    };

    const getFittedTextStrokeBounds = ({ content, color, fontSize, bounds }) => {
        const minSize = getTextEditorMinSize();
        const safeBounds = bounds || { x: 0, y: 0, width: minSize.width, height: minSize.height };
        const ctx = activePage.value.drawingContext;

        if (!ctx) {
            return {
                x: safeBounds.x,
                y: safeBounds.y,
                width: Math.max(24, safeBounds.width || 24),
                height: Math.max(24, safeBounds.height || 24)
            };
        }

        const baseStyle = {
            color: color || DEFAULT_TEXT_COLOR,
            fontSize: Math.max(8, Number(fontSize) || 16),
            bold: false,
            italic: false,
            underline: false,
            strike: false,
            backgroundColor: null
        };

        let tokens = htmlToStyledTokens(content?.html || '', baseStyle);
        if (!tokens.length) {
            tokens = buildPlainTextTokens(content?.text || '', baseStyle);
        }

        const measured = measureTextTokens(ctx, tokens, baseStyle, safeBounds.width);

        return {
            x: safeBounds.x,
            y: safeBounds.y,
            width: measured.width,
            height: measured.height
        };
    };

    const convertPlainTextToHtml = (text) => {
        const escaped = (text || '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;');
        return `<p>${escaped.replaceAll('\n', '</p><p>')}</p>`;
    };

    const getTextBoxSize = (stroke) => {
        const first = stroke?.[0];
        if (!first || first.type !== 'text') return null;

        const ctx = activePage.value.drawingContext;
        if (!ctx) return null;

        const content = getTextStrokeContent(first);
        const fontPx = Math.max(8, Number(first.fontSize) || 16);
        ctx.font = `${fontPx}px Arial`;
        const fallbackWidth = ctx.measureText(content.text || '').width + 8;
        const fallbackHeight = Math.max(first.fontSize * 1.5, 28);

        return {
            width: Math.max(24, first.width || fallbackWidth),
            height: Math.max(24, first.height || fallbackHeight)
        };
    };

    const canvasBoundsToViewport = (bounds) => {
        const canvas = activePage.value.drawingCanvas || null;
        if (!canvas || !bounds) return null;

        const rect = canvas.getBoundingClientRect();
        const scaleX = rect.width > 0 ? canvas.width / rect.width : 1;
        const scaleY = rect.height > 0 ? canvas.height / rect.height : 1;

        return {
            x: rect.left + (bounds.x / scaleX),
            y: rect.top + (bounds.y / scaleY),
            width: bounds.width / scaleX,
            height: bounds.height / scaleY
        };
    };

    const getTextEditorMinSize = () => {
        try {
            const rootStyles = getComputedStyle(document.documentElement);
            const minWidth = parseFloat(rootStyles.getPropertyValue('--text-editor-min-width'));
            const minHeight = parseFloat(rootStyles.getPropertyValue('--text-editor-min-height'));

            return {
                width: Number.isFinite(minWidth) && minWidth > 0 ? minWidth : 420,
                height: Number.isFinite(minHeight) && minHeight > 0 ? minHeight : 256
            };
        } catch (err) {
            return { width: 420, height: 256 };
        }
    };

    const getPreferredTextEditorSize = () => {
        const minSize = getTextEditorMinSize();
        const preferred = textEditorPreferredSize.value || {};

        return {
            width: Math.max(minSize.width, Number(preferred.width) || minSize.width),
            height: Math.max(minSize.height, Number(preferred.height) || minSize.height)
        };
    };

    const rememberTextEditorSize = (width, height) => {
        const minSize = getTextEditorMinSize();
        const resolved = {
            width: Math.max(minSize.width, Number(width) || minSize.width),
            height: Math.max(minSize.height, Number(height) || minSize.height)
        };

        textEditorPreferredSize.value = resolved;
        storeSet('textEditorPreferredSize', resolved);
    };

    const closeTextEditor = () => {
        textEditorHtml.value = '';
        textEditorBounds.value = null;
        textEditorPosition.value = null;
        editingTextStroke.value = null;
        textPosition.value = null;
        textCanvasIndex.value = -1;
        textboxPosition.value = null;
    };

    const clampEditorViewportRect = ({ left, top, width, height }) => {
        const viewportWidth = Math.max(0, window.innerWidth || 0);
        const viewportHeight = Math.max(0, window.innerHeight || 0);

        const safeWidth = Math.max(24, Math.min(Number(width) || 0, viewportWidth || Number(width) || 24));
        const safeHeight = Math.max(24, Math.min(Number(height) || 0, viewportHeight || Number(height) || 24));

        const maxLeft = Math.max(0, viewportWidth - safeWidth);
        const maxTop = Math.max(0, viewportHeight - safeHeight);

        const safeLeft = Math.min(Math.max(0, Number(left) || 0), maxLeft);
        const safeTop = Math.min(Math.max(0, Number(top) || 0), maxTop);

        return {
            left: safeLeft,
            top: safeTop,
            width: safeWidth,
            height: safeHeight
        };
    };

    const setTextEditorPosition = (bounds) => {
        const viewport = canvasBoundsToViewport(bounds);
        if (!viewport) return;
        const minSize = getTextEditorMinSize();

        const clampedViewport = clampEditorViewportRect({
            left: viewport.x || 0,
            top: viewport.y || 0,
            width: Math.max(minSize.width, viewport.width || minSize.width),
            height: Math.max(minSize.height, viewport.height || minSize.height)
        });

        textEditorPosition.value = {
            left: `${clampedViewport.left}px`,
            top: `${clampedViewport.top}px`,
            width: `${clampedViewport.width}px`,
            height: `${clampedViewport.height}px`
        };
    };

    const updateTextEditorSize = ({ width, height }) => {
        if (!textEditorPosition.value || !textEditorBounds.value) return;
        const minSize = getTextEditorMinSize();

        const requestedWidth = Math.max(minSize.width, Number(width) || 0);
        const requestedHeight = Math.max(minSize.height, Number(height) || 0);
        if (!requestedWidth || !requestedHeight) return;

        const canvas = activePage.value.drawingCanvas || null;
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        const scaleX = rect.width > 0 ? canvas.width / rect.width : 1;
        const scaleY = rect.height > 0 ? canvas.height / rect.height : 1;

        const currentLeft = parseFloat(textEditorPosition.value.left) || 0;
        const currentTop = parseFloat(textEditorPosition.value.top) || 0;
        const clampedViewport = clampEditorViewportRect({
            left: currentLeft,
            top: currentTop,
            width: requestedWidth,
            height: requestedHeight
        });

        textEditorPosition.value = {
            ...textEditorPosition.value,
            left: `${clampedViewport.left}px`,
            top: `${clampedViewport.top}px`,
            width: `${clampedViewport.width}px`,
            height: `${clampedViewport.height}px`
        };

        textEditorBounds.value = {
            ...textEditorBounds.value,
            width: clampedViewport.width * scaleX,
            height: clampedViewport.height * scaleY
        };

        rememberTextEditorSize(clampedViewport.width, clampedViewport.height);
    };

    const updateTextEditorPosition = ({ left, top }) => {
        if (!textEditorPosition.value || !textEditorBounds.value) return;

        const viewportWidth = parseFloat(textEditorPosition.value.width) || 0;
        const viewportHeight = parseFloat(textEditorPosition.value.height) || 0;
        const clampedViewport = clampEditorViewportRect({
            left,
            top,
            width: viewportWidth,
            height: viewportHeight
        });

        textEditorPosition.value = {
            ...textEditorPosition.value,
            left: `${clampedViewport.left}px`,
            top: `${clampedViewport.top}px`
        };
    };

    const openTextEditor = ({ bounds, content = '', strokeRef = null }) => {
        if (!bounds) return;
        const preferredSize = getPreferredTextEditorSize();
        const normalizedBounds = {
            ...bounds,
            width: Math.max(24, Number(bounds.width) || preferredSize.width),
            height: Math.max(24, Number(bounds.height) || preferredSize.height)
        };
        textEditorBounds.value = normalizedBounds;
        setTextEditorPosition(normalizedBounds);
        textEditorHtml.value = content;
        editingTextStroke.value = strokeRef;
    };

    const syncTextEditorPosition = () => {
        if (!textEditorPosition.value || !textEditorBounds.value) return;
        setTextEditorPosition(textEditorBounds.value);
    };

    const commitTextEditor = (content = null) => {
        const bounds = textEditorBounds.value;
        const normalizedContent = normalizeTextStrokeContent(content);

        if (!bounds || !normalizedContent.text.trim()) {
            closeTextEditor();
            redrawAllStrokes();
            return;
        }

        const canvas = activePage.value.drawingCanvas || null;
        let scale = 1;
        if (canvas) {
            const rect = canvas.getBoundingClientRect();
            if (rect.height > 0) {
                scale = canvas.height / rect.height;
            }
        }

        if (editingTextStroke.value) {
            const strokeIndex = editingTextStroke.value.strokeIndex;
            const stroke = activePage.value.strokes?.[strokeIndex];
            if (stroke?.[0]?.type === 'text') {
                const originalStroke = JSON.parse(JSON.stringify(stroke));
                const editorBounds = {
                    x: bounds.x,
                    y: bounds.y,
                    width: bounds.width,
                    height: bounds.height
                };

                stroke[0].content = normalizedContent;
                stroke[0].text = normalizedContent.text;
                stroke[0].fontSize = stroke[0].fontSize || fontSize.value * scale;
                stroke[0].editorWidth = editorBounds.width;
                stroke[0].editorHeight = editorBounds.height;

                const fittedBounds = getFittedTextStrokeBounds({
                    content: normalizedContent,
                    color: stroke[0].color,
                    fontSize: stroke[0].fontSize,
                    bounds: editorBounds
                });

                stroke[0].x = fittedBounds.x;
                stroke[0].y = fittedBounds.y;
                stroke[0].width = fittedBounds.width;
                stroke[0].height = fittedBounds.height;

                strokeChangeCallback({
                    id: stroke[0].id,
                    type: 'text-change',
                    page: activePage.value,
                    strokeIndex,
                    stroke: JSON.parse(JSON.stringify(stroke)),
                    previousStroke: originalStroke
                });
            }
        } else {
            const id = uuid();
            const editorBounds = {
                x: bounds.x,
                y: bounds.y,
                width: bounds.width,
                height: bounds.height
            };
            const initialFontSize = fontSize.value * scale;
            const color = textEditorSimpleMode.value ? drawColor.value : DEFAULT_TEXT_COLOR;

            const fittedBounds = getFittedTextStrokeBounds({
                content: normalizedContent,
                color,
                fontSize: initialFontSize,
                bounds: editorBounds
            });

            const textStroke = [{
                id,
                x: fittedBounds.x,
                y: fittedBounds.y,
                width: fittedBounds.width,
                height: fittedBounds.height,
                editorWidth: editorBounds.width,
                editorHeight: editorBounds.height,
                color,
                thickness: drawThickness.value,
                type: 'text',
                content: normalizedContent,
                text: normalizedContent.text,
                fontSize: initialFontSize
            }];

            activePage.value.strokes.push(textStroke);
            strokeChangeCallback({
                id,
                type: 'add',
                page: activePage.value,
                stroke: textStroke
            });
        }

        closeTextEditor();
        redrawAllStrokes();
    };

    const isPointNearStroke = (x, y, stroke, threshold = 10) => {
        if (!stroke || stroke.length === 0) return false;
        
        const first = stroke[0];

        // If rotated, inverse-rotate the test point around the stroke center
        let testX = x, testY = y;
        const angle = first.rotation || 0;
        if (angle) {
            const b = getStrokeBounds(stroke, 0);
            if (b) {
                const cx = (b.minX + b.maxX) / 2;
                const cy = (b.minY + b.maxY) / 2;
                const cosA = Math.cos(-angle);
                const sinA = Math.sin(-angle);
                const dx = x - cx;
                const dy = y - cy;
                testX = cx + dx * cosA - dy * sinA;
                testY = cy + dx * sinA + dy * cosA;
            }
        }
        
        // Check image strokes
        if (first.type === 'image') {
            const halfW = first.width / 2;
            const halfH = first.height / 2;
            const cx = first.x + halfW;
            const cy = first.y + halfH;
            return testX >= cx - halfW - threshold && testX <= cx + halfW + threshold && testY >= cy - halfH - threshold && testY <= cy + halfH + threshold;
        }
        
        // Check highlight-rect strokes
        if (first.type === 'highlight-rect') {
            // Check all rectangles in the compound highlight
            const rects = first.rects || [{ x: first.x, y: first.y, width: first.width, height: first.height }];
            for (const rect of rects) {
                if (x >= rect.x - threshold && 
                    x <= rect.x + rect.width + threshold && 
                    y >= rect.y - threshold && 
                    y <= rect.y + rect.height + threshold) {
                    return true;
                }
            }
            return false;
        }
        
        // Check text strokes
        if (first.type === 'text') {
            const textBox = getTextBoxSize(stroke);
            if (!textBox) return false;
            const textWidth = textBox.width;
            const textHeight = textBox.height;
            
                 return testX >= first.x - threshold && 
                     testX <= first.x + textWidth + threshold && 
                     testY >= first.y - threshold && 
                     testY <= first.y + textHeight + threshold;
        }
        
        // Check shape strokes
        if (first.type === 'line') {
            const dx = first.endX - first.startX;
            const dy = first.endY - first.startY;
            const length = Math.sqrt(dx * dx + dy * dy);
            if (length === 0) return false;
            
            const t = Math.max(0, Math.min(1, ((testX - first.startX) * dx + (testY - first.startY) * dy) / (length * length)));
            const projX = first.startX + t * dx;
            const projY = first.startY + t * dy;
            const distance = Math.sqrt((testX - projX) ** 2 + (testY - projY) ** 2);
            return distance < threshold;
        }
        
        if (first.type === 'rectangle') {
            const minX = Math.min(first.startX, first.endX);
            const maxX = Math.max(first.startX, first.endX);
            const minY = Math.min(first.startY, first.endY);
            const maxY = Math.max(first.startY, first.endY);
            
                 return testX >= minX - threshold && testX <= maxX + threshold && 
                     testY >= minY - threshold && testY <= maxY + threshold &&
                     (testX <= minX + threshold || testX >= maxX - threshold || 
                      testY <= minY + threshold || testY >= maxY - threshold);
        }
        
        if (first.type === 'circle') {
            if (first.radiusX !== undefined || first.radiusY !== undefined) {
                // Ellipse hit detection
                const rx = first.radiusX !== undefined ? first.radiusX : Math.abs(first.endX - first.startX);
                const ry = first.radiusY !== undefined ? first.radiusY : Math.abs(first.endY - first.startY);
                
                // (x-h)^2/a^2 + (y-k)^2/b^2 = 1
                const normalizedX = (x - first.startX);
                const normalizedY = (y - first.startY);
                
                const value = (normalizedX * normalizedX) / (rx * rx) + (normalizedY * normalizedY) / (ry * ry);
                
                // Allow selecting if close to proper 1 (border)
                // Approximate width of stroke in ellipse units
                const epsilon = threshold / Math.min(rx, ry); 
                return Math.abs(value - 1) < epsilon * 2; // Loose check
            }
            const radius = Math.sqrt((first.endX - first.startX) ** 2 + (first.endY - first.startY) ** 2);
            const distance = Math.sqrt((testX - first.startX) ** 2 + (testY - first.startY) ** 2);
            return Math.abs(distance - radius) < threshold;
        }
        
        // Check pen strokes (point-based)
        for (let point of stroke) {
            const distance = Math.sqrt((point.x - testX) ** 2 + (point.y - testY) ** 2);
            if (distance < threshold) {
                return true;
            }
        }
        
        return false;
    };

    const findStrokeAtPoint = (x, y) => {
        const page = activePage.value;
        const strokes = page.strokes || [];
        
        // Search in reverse order to prioritize top strokes
        for (let i = strokes.length - 1; i >= 0; i--) {
            if (isPointNearStroke(x, y, strokes[i])) {
                return { pageId: page.id, pageIndex: page.index, strokeIndex: i, stroke: strokes[i] };
            }
        }

        showStrokeMenu.value = false;
        selectedStroke.value = null;
        redrawAllStrokes();
        return null;
    };

    const isAnyStrokeAtPoint = (x, y, canvasIndex) => {
        const strokes = activePage.value.strokes || [];

        for (let i = strokes.length - 1; i >= 0; i--) {
            if (isPointNearStroke(x, y, strokes[i])) return true;
        }
        return false;
    };

    const SELECTION_PADDING = 10;

    const getStrokeBounds = (stroke, padding = 5) => {
        if (!stroke || stroke.length === 0) return null;
        
        const first = stroke[0];
        const pad = Math.max(0, padding);
        
        if (first.type === 'image') {
            const angle = first.rotation || 0;
            const cx = first.x + first.width / 2;
            const cy = first.y + first.height / 2;
            const corners = [
                { x: first.x, y: first.y },
                { x: first.x + first.width, y: first.y },
                { x: first.x + first.width, y: first.y + first.height },
                { x: first.x, y: first.y + first.height }
            ];
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            const cosA = Math.cos(angle);
            const sinA = Math.sin(angle);
            corners.forEach(p => {
                const dx = p.x - cx;
                const dy = p.y - cy;
                const rx = cx + dx * cosA - dy * sinA;
                const ry = cy + dx * sinA + dy * cosA;
                minX = Math.min(minX, rx);
                minY = Math.min(minY, ry);
                maxX = Math.max(maxX, rx);
                maxY = Math.max(maxY, ry);
            });
            return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
        } else if (first.type === 'highlight-rect') {
            // Do NOT support rotation for highlight rectangles; compute simple union bounds
            const rects = first.rects || [{ x: first.x, y: first.y, width: first.width, height: first.height }];
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            rects.forEach(rect => {
                minX = Math.min(minX, rect.x);
                minY = Math.min(minY, rect.y);
                maxX = Math.max(maxX, rect.x + rect.width);
                maxY = Math.max(maxY, rect.y + rect.height);
            });
            return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
        } else if (first.type === 'text') {
            const textBox = getTextBoxSize(stroke);
            if (!textBox) return null;
            const angle = first.rotation || 0;
            const cx = first.x + textBox.width / 2;
            const cy = first.y + textBox.height / 2;
            const corners = [
                { x: first.x, y: first.y },
                { x: first.x + textBox.width, y: first.y },
                { x: first.x + textBox.width, y: first.y + textBox.height },
                { x: first.x, y: first.y + textBox.height }
            ];
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            const cosA = Math.cos(angle);
            const sinA = Math.sin(angle);
            corners.forEach(p => {
                const dx = p.x - cx, dy = p.y - cy;
                const rx = cx + dx * cosA - dy * sinA;
                const ry = cy + dx * sinA + dy * cosA;
                minX = Math.min(minX, rx);
                minY = Math.min(minY, ry);
                maxX = Math.max(maxX, rx);
                maxY = Math.max(maxY, ry);
            });
            return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
        } else if (first.type === 'line' || first.type === 'rectangle' || first.type === 'circle') {
            const angle = first.rotation || 0;
            let points = [];
            if (first.type === 'line') {
                points = [ { x: first.startX, y: first.startY }, { x: first.endX, y: first.endY } ];
            } else if (first.type === 'rectangle') {
                points = [
                    { x: first.startX, y: first.startY },
                    { x: first.endX, y: first.startY },
                    { x: first.endX, y: first.endY },
                    { x: first.startX, y: first.endY }
                ];
            } else if (first.type === 'circle') {
                // Use bounding box of ellipse or circle
                let rx, ry;
                if (first.radiusX !== undefined || first.radiusY !== undefined) {
                    rx = first.radiusX !== undefined ? first.radiusX : Math.abs(first.endX - first.startX);
                    ry = first.radiusY !== undefined ? first.radiusY : Math.abs(first.endY - first.startY);
                } else {
                    const radius = Math.sqrt((first.endX - first.startX) ** 2 + (first.endY - first.startY) ** 2);
                    rx = radius; ry = radius;
                }
                points = [
                    { x: first.startX - rx, y: first.startY - ry },
                    { x: first.startX + rx, y: first.startY - ry },
                    { x: first.startX + rx, y: first.startY + ry },
                    { x: first.startX - rx, y: first.startY + ry }
                ];
            }
            // Center by unrotated bounds
            let uMinX = Infinity, uMinY = Infinity, uMaxX = -Infinity, uMaxY = -Infinity;
            points.forEach(p => { uMinX = Math.min(uMinX, p.x); uMinY = Math.min(uMinY, p.y); uMaxX = Math.max(uMaxX, p.x); uMaxY = Math.max(uMaxY, p.y); });
            const cx = (uMinX + uMaxX) / 2;
            const cy = (uMinY + uMaxY) / 2;
            const cosA = Math.cos(angle);
            const sinA = Math.sin(angle);
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            points.forEach(p => {
                const dx = p.x - cx, dy = p.y - cy;
                const rx = cx + dx * cosA - dy * sinA;
                const ry = cy + dx * sinA + dy * cosA;
                minX = Math.min(minX, rx);
                minY = Math.min(minY, ry);
                maxX = Math.max(maxX, rx);
                maxY = Math.max(maxY, ry);
            });
            return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
 }
    };

    // Compute unrotated bounds (ignores `rotation`), used for oriented selection box
    const getUnrotatedBounds = (stroke, padding = 5) => {
        if (!stroke || stroke.length === 0) return null;
        const first = stroke[0];
        const pad = Math.max(0, padding);
        if (first.type === 'image') {
            return { minX: first.x - pad, minY: first.y - pad, maxX: first.x + first.width + pad, maxY: first.y + first.height + pad };
        } else if (first.type === 'highlight-rect') {
            const rects = first.rects || [{ x: first.x, y: first.y, width: first.width, height: first.height }];
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            rects.forEach(rect => {
                minX = Math.min(minX, rect.x);
                minY = Math.min(minY, rect.y);
                maxX = Math.max(maxX, rect.x + rect.width);
                maxY = Math.max(maxY, rect.y + rect.height);
            });
            return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
        } else if (first.type === 'text') {
            const textBox = getTextBoxSize(stroke);
            if (!textBox) return null;
            return {
                minX: first.x - pad,
                minY: first.y - pad,
                maxX: first.x + textBox.width + pad,
                maxY: first.y + textBox.height + pad
            };
        } else if (first.type === 'line' || first.type === 'rectangle' || first.type === 'circle') {
            let points = [];
            if (first.type === 'line') {
                points = [ { x: first.startX, y: first.startY }, { x: first.endX, y: first.endY } ];
            } else if (first.type === 'rectangle') {
                points = [
                    { x: first.startX, y: first.startY },
                    { x: first.endX, y: first.startY },
                    { x: first.endX, y: first.endY },
                    { x: first.startX, y: first.endY }
                ];
            } else if (first.type === 'circle') {
                let rx, ry;
                if (first.radiusX !== undefined || first.radiusY !== undefined) {
                    rx = first.radiusX !== undefined ? first.radiusX : Math.abs(first.endX - first.startX);
                    ry = first.radiusY !== undefined ? first.radiusY : Math.abs(first.endY - first.startY);
                } else {
                    const radius = Math.sqrt((first.endX - first.startX) ** 2 + (first.endY - first.startY) ** 2);
                    rx = radius; ry = radius;
                }
                points = [
                    { x: first.startX - rx, y: first.startY - ry },
                    { x: first.startX + rx, y: first.startY - ry },
                    { x: first.startX + rx, y: first.startY + ry },
                    { x: first.startX - rx, y: first.startY + ry }
                ];
            }
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            points.forEach(p => { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); });
            return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
        } else {
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            for (let p of stroke) {
                minX = Math.min(minX, p.x);
                minY = Math.min(minY, p.y);
                maxX = Math.max(maxX, p.x);
                maxY = Math.max(maxY, p.y);
            }
            return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
        }
    };

    const getResizeHandle = (x, y, bounds, stroke) => {
        if (!bounds) return null;
        
        const handleSize = 8;
        const threshold = handleSize;
        const handles = [
            { x: bounds.minX, y: bounds.minY, handle: 'nw' },
            { x: bounds.maxX, y: bounds.minY, handle: 'ne' },
            { x: bounds.minX, y: bounds.maxY, handle: 'sw' },
            { x: bounds.maxX, y: bounds.maxY, handle: 'se' },
            { x: (bounds.minX + bounds.maxX) / 2, y: bounds.minY, handle: 'n' },
            { x: (bounds.minX + bounds.maxX) / 2, y: bounds.maxY, handle: 's' },
            { x: bounds.minX, y: (bounds.minY + bounds.maxY) / 2, handle: 'w' },
            { x: bounds.maxX, y: (bounds.minY + bounds.maxY) / 2, handle: 'e' }
        ];
        
        for (let h of handles) {
            if (Math.abs(x - h.x) <= threshold && Math.abs(y - h.y) <= threshold) {
                return h.handle;
            }
        }

        return null;
    };

    const selectStrokeInSelectionBox = () => {
        if (!selectionStart.value || !selectionEnd.value) return;

        const page = activePage.value;
        const strokes = page.strokes || [];

        // Convert selection box from screen (CSS) coords to canvas coords
        const canvas = page.drawingCanvas || null;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;

        const sx = Math.min(selectionStart.value.x, selectionEnd.value.x) * scaleX;
        const sy = Math.min(selectionStart.value.y, selectionEnd.value.y) * scaleY;
        const ex = Math.max(selectionStart.value.x, selectionEnd.value.x) * scaleX;
        const ey = Math.max(selectionStart.value.y, selectionEnd.value.y) * scaleY;

        const selections = [];
        let topmostIndex = -1;

        // Collect all strokes intersecting the selection box (search top-down)
        for (let i = strokes.length - 1; i >= 0; i--) {
            const stroke = strokes[i];
            const bounds = getStrokeBounds(stroke, 0);
            if (!bounds) continue;

            // Intersection test (AABB)
            if (bounds.minX < ex && bounds.maxX > sx &&
                bounds.minY < ey && bounds.maxY > sy) {
                selections.push({
                    pageIndex: page.index,
                    pageId: page.id,
                    strokeIndex: i,
                    stroke
                });
                if (topmostIndex === -1) topmostIndex = i; // first match in reverse loop is topmost
            }
        }

        selectedStrokes.value = selections;

        if (topmostIndex !== -1) {
            const stroke = strokes[topmostIndex];
            selectedStroke.value = {
                pageIndex: page.index,
                pageId: page.id,
                strokeIndex: topmostIndex,
                stroke,
                originalStroke: JSON.parse(JSON.stringify(stroke))
            };
            showStrokeMenu.value = true;
            redrawAllStrokes();
            drawSelectionBoundingBox();
        } else {
            showStrokeMenu.value = false;
            selectedStroke.value = null;
            redrawAllStrokes();
        }
    };

    const startDrawing = (e) => {
        showStrokeStyleMenu.value = false;

        if (handToolActive.value) {
            const scrollEl = getScrollContainer();
            if (!scrollEl) return;

            const canvas = activePage.value?.drawingCanvas || null;

            isHandToolPanning.value = true;
            handPanPointerId.value = e.pointerId;
            handPanCanvasEl.value = canvas;
            handPanStart.value = {
                x: e.clientX,
                y: e.clientY,
                scrollLeft: scrollEl.scrollLeft,
                scrollTop: scrollEl.scrollTop,
            };

            if (canvas && e.pointerId !== undefined) {
                canvas.setPointerCapture(e.pointerId);
            }

            stopEvent(e);
            return;
        }

        if (textModesActive.value) return;

        // Track active pointer type
        activePointerType.value = e.pointerType;

        if (e.pointerType === 'pen') {
            isPenHovering.value = true;
        }

        // Generate a new stroke ID
        currentStrokeId.value = uuid();

        // Handle select mode
        if (isSelectModeActive.value) {
            // Handle drag mode
            if (isStrokeHovering.value || selectedStroke.value) {
                const page = activePage.value;
                const canvasIndex = page.index;
                if (canvasIndex === -1) return;

                const canvas = page.drawingCanvas || null;
                const pt = getCanvasPointFromEvent(canvas, e);
                if (!pt) return;
                const { x, y } = pt;
                
                // Check if clicking on a resize handle of already selected stroke
                // Disable resizing when multiple selection is active
                if (selectedStrokes.value.length <= 1 && selectedStroke.value && selectedStroke.value.pageId === page.id) {
                        const handlePadding = SELECTION_PADDING;
                            const bounds = getStrokeBounds(selectedStroke.value.stroke, SELECTION_PADDING);
                            let handle = getResizeHandle(x, y, bounds, selectedStroke.value.stroke);
                            // Treat top-right corner as rotation handle for all strokes (single selection), except highlight-rect/text
                            if (handle === 'ne') {
                                const multiActive = Array.isArray(selectedStrokes.value) && selectedStrokes.value.filter(s => s.pageIndex === canvasIndex).length > 1;
                                const type = selectedStroke.value.stroke[0]?.type;
                                if (!multiActive && type !== 'highlight-rect' && type !== 'text') handle = 'rotate';
                            }
                    
                    if (handle) {
                        const firstSel = selectedStroke.value.stroke[0];
                        if ((handle === 'rotate' || handle === 'ne') && firstSel.type !== 'highlight-rect' && firstSel.type !== 'text') {
                            isRotating.value = true;
                            resizeHandle.value = handle;
                            dragStartPos.value = { x, y };
                            const b = getStrokeBounds(selectedStroke.value.stroke, 0);
                            rotateStartCenter.value = { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
                            rotateStartAngle.value = Math.atan2(y - rotateStartCenter.value.y, x - rotateStartCenter.value.x);
                            isMouseDown.value = true;
                            currentCanvasIndex = canvasIndex;
                            if (canvas && e.pointerId !== undefined) {
                                canvas.setPointerCapture(e.pointerId);
                            }
                            activePointerId.value = e.pointerId;
                            stopEvent(e);
                            return;
                        } else {
                            isResizing.value = true;
                            resizeHandle.value = handle;
                            dragStartPos.value = { x, y };
                            resizeStartBounds.value = {
                                padded: { ...bounds },
                                raw: getStrokeBounds(selectedStroke.value.originalStroke || selectedStroke.value.stroke, 0),
                                padding: handlePadding
                            };
                            isMouseDown.value = true;
                            currentCanvasIndex = canvasIndex;
                            if (canvas && e.pointerId !== undefined) {
                                canvas.setPointerCapture(e.pointerId);
                            }
                            activePointerId.value = e.pointerId;
                            stopEvent(e);
                            return;
                        }
                    }
                }
                
                const found = findStrokeAtPoint(x, y);
    
                if (found) {
                    const ctrl = !!e.ctrlKey;

                    const newSelection = {
                        pageId: page.id,
                        pageIndex: canvasIndex,
                        strokeIndex: found.strokeIndex,
                        stroke: found.stroke,
                        originalStroke: JSON.parse(JSON.stringify(found.stroke))
                    };

                    if (ctrl) {
                        // Toggle multi-selection
                        const idx = selectedStrokes.value.findIndex(s => s.pageIndex === canvasIndex && s.strokeIndex === found.strokeIndex);
                        if (idx === -1) {
                            selectedStrokes.value.push({ pageId: page.id, pageIndex: canvasIndex, strokeIndex: found.strokeIndex, stroke: found.stroke });
                        } else {
                            selectedStrokes.value.splice(idx, 1);
                        }

                        selectedStroke.value = newSelection; // latest selection

                        // Redraw highlight on latest
                        redrawAllStrokes();
                        drawSelectionBoundingBox();
                        showStrokeMenu.value = true;

                        stopEvent(e);
                        return;
                    }

                    // Non-ctrl click: if multi-selection is active and clicking a member, keep multi-selection
                    const isMemberOfSelection = Array.isArray(selectedStrokes.value)
                        && selectedStrokes.value.some(s => s.pageIndex === canvasIndex && s.strokeIndex === found.strokeIndex);
                    const multiActive = Array.isArray(selectedStrokes.value) && selectedStrokes.value.length > 1;
                    if (!(multiActive && isMemberOfSelection)) {
                        // Collapse to single selection only when clicking outside current multi-selection
                        selectedStrokes.value = [{ pageId: page.id, pageIndex: canvasIndex, strokeIndex: found.strokeIndex, stroke: found.stroke }];
                    }
                    selectedStroke.value = newSelection;
                    
                    // Prepare for potential dragging (left-click only)
                    isDragging.value = false; // Don't start dragging immediately
                    dragStartPos.value = { x, y };
                    lastX = x;
                    lastY = y;
                    
                    isMouseDown.value = true;
                    currentCanvasIndex = canvasIndex;
                    
                    if (canvas && e.pointerId !== undefined) {
                        canvas.setPointerCapture(e.pointerId);
                    }
                    activePointerId.value = e.pointerId;
                    
                    // Redraw with highlight (will show combined bbox if multi)
                    redrawAllStrokes();
                    drawSelectionBoundingBox();

                    stopEvent(e);
                    return;
                }
    
                // stopEvent(e);
                // return;
            }

            // Start new selection rectangle
            handleSelectionStart(e);

            return;
        }

        // Handle selection mode
        if (isSelectionMode.value) {
            handleSelectionStart(e);
            return;
        }

        // Allow touch only when enableTouchDrawing is true
        if (e.pointerType === 'touch' && !enableTouchDrawing.value) return;
        
        // Handle text mode
        if (isTextInputMode.value) {
            if (isSecondaryPointerAction(e)) return;

            const canvasIndex = getCanvasIndexFromEvent(e);
            if (canvasIndex === -1) return;
            
            const canvas = activePage.value.drawingCanvas || null;
            const pt = getCanvasPointFromEvent(canvas, e);
            if (!pt) return;
            const { x, y } = pt;

            if (!canvas) return;

            const preferredSize = getPreferredTextEditorSize();
            const width = Math.min(preferredSize.width, canvas.width);
            const height = Math.min(preferredSize.height, canvas.height);
            const clampedX = Math.max(0, Math.min(x, Math.max(0, canvas.width - width)));
            const clampedY = Math.max(0, Math.min(y, Math.max(0, canvas.height - height)));

            textPosition.value = { x, y };
            textCanvasIndex.value = activePage.value.index;

            openTextEditor({
                bounds: { x: clampedX, y: clampedY, width, height },
                content: '',
                strokeRef: null
            });

            stopEvent(e);
            redrawAllStrokes();

            return;
        }
        
        // Check if pen secondary button (barrel button/eraser) is pressed
        // buttons: 1 = primary, 2 = secondary, 32 = eraser button
        const isPenSecondaryButton = e.pointerType === 'pen' && (e.buttons === 2 || e.buttons === 32 || e.button === 5);
        const shouldErase = isEraser.value || isPenSecondaryButton;
        
        // Prevent default to avoid interference with touch/pen
        stopEvent(e);
        
        // Determine which canvas this event is for
        currentCanvasIndex = getCanvasIndexFromEvent(e);
        if (currentCanvasIndex === -1) return;

        const canvas = activePage.value.drawingCanvas || null;
        const drawingContext = activePage.value.drawingContext || null;
        
        if (!canvas || !drawingContext) return;
        
        // Capture the pointer to ensure we get all events
        if (canvas && e.pointerId !== undefined) {
            canvas.setPointerCapture(e.pointerId);
        }
        
        // Track this pointer
        activePointerId.value = e.pointerId;
        isMouseDown.value = true;
        
        const pt = getCanvasPointFromEvent(canvas, e);
        if (!pt) return;
        lastX = pt.x;
        lastY = pt.y;
        startX = lastX;
        startY = lastY;

        if (shouldErase) {
            eraseAtPoint(lastX, lastY);
        } else if (drawMode.value === 'pen') {
            currentStroke.value = [{
                id: currentStrokeId.value,
                x: lastX,
                y: lastY,
                color: drawColor.value,
                thickness: drawThickness.value,
                type: 'pen'
            }];
            drawingContext.beginPath();
            drawingContext.moveTo(lastX, lastY);
        } else {
            // For shapes, save canvas state
            canvasSnapshot = drawingContext.getImageData(0, 0, canvas.width, canvas.height);
        }
    };

    const draw = (e) => {
        if (handToolActive.value) {
            if (!isHandToolPanning.value) return;
            if (e.pointerId !== handPanPointerId.value) return;

            const scrollEl = getScrollContainer();
            if (!scrollEl || !handPanStart.value) return;

            const dx = e.clientX - handPanStart.value.x;
            const dy = e.clientY - handPanStart.value.y;

            scrollEl.scrollLeft = handPanStart.value.scrollLeft - dx;
            scrollEl.scrollTop = handPanStart.value.scrollTop - dy;

            stopEvent(e);
            return;
        }

        if (textModesActive.value) return;

        if (isSelectModeActive.value && (isStrokeHovering.value || selectedStroke.value)) {
            // Handle rotation
            if (isRotating.value && selectedStroke.value && (resizeHandle.value === 'rotate' || resizeHandle.value === 'ne')) {
                if (e.pointerId !== activePointerId.value) return;
                const canvas = activePage.value.drawingCanvas || null;
                const pt = getCanvasPointFromEvent(canvas, e);
                if (!pt) return;
                const currentX = pt.x;
                const currentY = pt.y;
                const strokes = activePage.value.strokes || [];
                const stroke = strokes[selectedStroke.value.strokeIndex];
                const first = stroke[0];
                const origFirst = selectedStroke.value.originalStroke[0];
                const center = rotateStartCenter.value || { x: (first.x + (first.x + first.width)) / 2, y: (first.y + (first.y + first.height)) / 2 };
                const currentAngle = Math.atan2(currentY - center.y, currentX - center.x);
                const delta = currentAngle - rotateStartAngle.value;
                first.rotation = (origFirst.rotation || 0) + delta;
                redrawAllStrokes();
                drawSelectionBoundingBox();
                showStrokeMenu.value = false;
                stopEvent(e);
                return;
            }

            // Handle resizing
            if (isResizing.value && selectedStroke.value && resizeHandle.value) {
                if (e.pointerId !== activePointerId.value) return;
                
                const canvas = activePage.value?.drawingCanvas || null;
                const pt = getCanvasPointFromEvent(canvas, e);
                if (!pt) return;
                const currentX = pt.x;
                const currentY = pt.y;
                
                let dx = currentX - dragStartPos.value.x;
                let dy = currentY - dragStartPos.value.y;
                
                const strokes = activePage.value.strokes || [];
                const stroke = strokes[selectedStroke.value.strokeIndex];
                
                if (stroke && resizeStartBounds.value) {
                    showStrokeMenu.value = false;
                    const first = stroke[0];
                    const startBounds = resizeStartBounds.value.padded;
                    const startRawBounds = resizeStartBounds.value.raw;
                    const boundsPadding = resizeStartBounds.value.padding ?? 0;
                    if (!startBounds || !startRawBounds) return;
                    
                    // Resize handles are axis-aligned; keep drag deltas in screen/canvas axes.
                    
                    // Calculate new bounds based on resize handle
                    let newMinX = startBounds.minX;
                    let newMinY = startBounds.minY;
                    let newMaxX = startBounds.maxX;
                    let newMaxY = startBounds.maxY;
                    
                    const handle = resizeHandle.value;
                    const isCornerResize = ['nw', 'ne', 'sw', 'se'].includes(handle);
                    
                    if (isCornerResize) {
                        const startWidth = startBounds.maxX - startBounds.minX;
                        const startHeight = startBounds.maxY - startBounds.minY;
                        const aspectRatio = startWidth / startHeight;

                        let width, height;

                        // Calculate proposed dimensions based on drag
                        if (handle === 'se') {
                            width = (startBounds.maxX + dx) - startBounds.minX;
                            height = (startBounds.maxY + dy) - startBounds.minY;
                        } else if (handle === 'sw') {
                            width = startBounds.maxX - (startBounds.minX + dx);
                            height = (startBounds.maxY + dy) - startBounds.minY;
                        } else if (handle === 'nw') {
                            width = startBounds.maxX - (startBounds.minX + dx);
                            height = startBounds.maxY - (startBounds.minY + dy);
                        } else if (handle === 'ne') {
                            width = (startBounds.maxX + dx) - startBounds.minX;
                            height = startBounds.maxY - (startBounds.minY + dy);
                        }

                        // Enforce aspect ratio based on dominant axis
                        if (Math.abs(width / startWidth) > Math.abs(height / startHeight)) {
                            height = width / aspectRatio; // Maintain sign for direction
                        } else {
                            width = height * aspectRatio; // Maintain sign for direction
                        }

                        // Apply new dimensions to corners
                        if (handle === 'se') {
                            newMaxX = startBounds.minX + width;
                            newMaxY = startBounds.minY + height;
                        } else if (handle === 'sw') {
                            newMinX = startBounds.maxX - width;
                            newMaxY = startBounds.minY + height;
                        } else if (handle === 'nw') {
                            newMinX = startBounds.maxX - width;
                            newMinY = startBounds.maxY - height;
                        } else if (handle === 'ne') {
                            newMaxX = startBounds.minX + width;
                            newMinY = startBounds.maxY - height;
                        }
                    } else {
                        // For edge resizes, allow independent scaling
                        if (handle.includes('n')) newMinY += dy;
                        if (handle.includes('s')) newMaxY += dy;
                        if (handle.includes('w')) newMinX += dx;
                        if (handle.includes('e')) newMaxX += dx;
                    }
                    
                    // Convert from padded bounds to raw stroke bounds
                    const newRawMinX = newMinX + boundsPadding;
                    const newRawMinY = newMinY + boundsPadding;
                    const newRawMaxX = newMaxX - boundsPadding;
                    const newRawMaxY = newMaxY - boundsPadding;

                    // Ensure minimum size
                    if (newRawMaxX - newRawMinX < 10) return;
                    if (newRawMaxY - newRawMinY < 10) return;

                    const baseWidth = Math.max(1, startRawBounds.maxX - startRawBounds.minX);
                    const baseHeight = Math.max(1, startRawBounds.maxY - startRawBounds.minY);
                    
                    const scaleXFactor = (newRawMaxX - newRawMinX) / baseWidth;
                    const scaleYFactor = (newRawMaxY - newRawMinY) / baseHeight;
                    
                    // Get original stroke to calculate scaling from
                    const originalStroke = selectedStroke.value.originalStroke;
                    const origFirst = originalStroke[0];

                    // Fixed Anchor Logic for Rotated Resizing
                    // 1. Determine the Fixed Anchor Point (A) on the Reference AABB (startRawBounds)
                    let anchorX, anchorY;
                    const scBounds = startRawBounds;
                    
                    if (handle === 'nw') { anchorX = scBounds.maxX; anchorY = scBounds.maxY; }
                    else if (handle === 'ne') { anchorX = scBounds.minX; anchorY = scBounds.maxY; }
                    else if (handle === 'sw') { anchorX = scBounds.maxX; anchorY = scBounds.minY; }
                    else if (handle === 'se') { anchorX = scBounds.minX; anchorY = scBounds.minY; }
                    else if (handle === 'n') { anchorX = (scBounds.minX + scBounds.maxX)/2; anchorY = scBounds.maxY; }
                    else if (handle === 's') { anchorX = (scBounds.minX + scBounds.maxX)/2; anchorY = scBounds.minY; }
                    else if (handle === 'w') { anchorX = scBounds.maxX; anchorY = (scBounds.minY + scBounds.maxY)/2; }
                    else if (handle === 'e') { anchorX = scBounds.minX; anchorY = (scBounds.minY + scBounds.maxY)/2; }
                    else { anchorX = (scBounds.minX + scBounds.maxX)/2; anchorY = (scBounds.minY + scBounds.maxY)/2; }

                    if (origFirst.type === 'text' || origFirst.type === 'image') {
                        const origHalfW = origFirst.width / 2;
                        const origHalfH = origFirst.height / 2;
                        const origCenterX = origFirst.x + origHalfW;
                        const origCenterY = origFirst.y + origHalfH;

                        let finalScaleX = scaleXFactor;
                        let finalScaleY = scaleYFactor;

                        if (origFirst.type === 'text') {
                            const originalFontSize = Math.max(8, Number(origFirst.fontSize) || 16);
                            const fontScale = Math.max(0.25, Math.sqrt(scaleXFactor * scaleYFactor));
                            first.fontSize = Math.max(8, Math.round(originalFontSize * fontScale));
                            
                            first.width = origFirst.width * fontScale;
                            first.height = origFirst.height * fontScale;
                            
                            // Use fontScale for dimension scaling, but keep AABB scale for position
                            // to ensure anchor behavior
                        } else {
                            first.width = origFirst.width * scaleXFactor;
                            first.height = origFirst.height * scaleYFactor;
                        }

                        // Update Center relative to Anchor using AABB scale factors
                        const newCenterX = anchorX + (origCenterX - anchorX) * scaleXFactor;
                        const newCenterY = anchorY + (origCenterY - anchorY) * scaleYFactor;
                        
                        first.x = newCenterX - (first.width / 2);
                        first.y = newCenterY - (first.height / 2);

                        if (origFirst.type === 'text') {
                            first.editorWidth = first.width;
                            first.editorHeight = first.height;
                        }
                    } else if (origFirst.type === 'highlight-rect') {
                        // Scale all rectangles in the compound highlight
                        const origRects = origFirst.rects || [{ x: origFirst.x, y: origFirst.y, width: origFirst.width, height: origFirst.height }];
                        const rects = first.rects || [{ x: first.x, y: first.y, width: first.width, height: first.height }];
                        
                        // Calculate original bounds
                        let origMinX = Infinity, origMinY = Infinity, origMaxX = -Infinity, origMaxY = -Infinity;
                        origRects.forEach(rect => {
                            origMinX = Math.min(origMinX, rect.x);
                            origMinY = Math.min(origMinY, rect.y);
                            origMaxX = Math.max(origMaxX, rect.x + rect.width);
                            origMaxY = Math.max(origMaxY, rect.y + rect.height);
                        });
                        
                        // Scale each rectangle
                        rects.forEach((rect, i) => {
                            const origRect = origRects[i];
                            rect.x = newRawMinX + (origRect.x - origMinX) * scaleXFactor;
                            rect.y = newRawMinY + (origRect.y - origMinY) * scaleYFactor;
                            rect.width = origRect.width * scaleXFactor;
                            rect.height = origRect.height * scaleYFactor;
                        });
                    } else if (origFirst.type === 'circle') {
                        // Calculate new center and radii for ellipse
                        const newWidth = newRawMaxX - newRawMinX;
                        const newHeight = newRawMaxY - newRawMinY;
                        
                        first.startX = newRawMinX + newWidth / 2;
                        first.startY = newRawMinY + newHeight / 2;
                        
                        first.radiusX = newWidth / 2;
                        first.radiusY = newHeight / 2;
                        
                        // Update end coordinates to match the X-radius for consistency with basic circle logic
                        // (though drawShape will prioritize radiusX/Y if present)
                        first.endX = first.startX + first.radiusX;
                        first.endY = first.startY;
                        
                        first.x = first.startX;
                        first.y = first.startY;
                    } else if (origFirst.type === 'line' || origFirst.type === 'rectangle') {
                        const origMinX = Math.min(origFirst.startX, origFirst.endX);
                        const origMaxX = Math.max(origFirst.startX, origFirst.endX);
                        const origMinY = Math.min(origFirst.startY, origFirst.endY);
                        const origMaxY = Math.max(origFirst.startY, origFirst.endY);

                        first.startX = newRawMinX + (origFirst.startX - origMinX) * scaleXFactor;
                        first.startY = newRawMinY + (origFirst.startY - origMinY) * scaleYFactor;
                        first.endX = newRawMinX + (origFirst.endX - origMinX) * scaleXFactor;
                        first.endY = newRawMinY + (origFirst.endY - origMinY) * scaleYFactor;
                        first.x = first.startX;
                        first.y = first.startY;
                    } else {
                        // Pen stroke - scale all points
                        const origBounds = startRawBounds;
                        for (let i = 0; i < stroke.length; i++) {
                            const origPoint = originalStroke[i];
                            stroke[i].x = newRawMinX + (origPoint.x - origBounds.minX) * scaleXFactor;
                            stroke[i].y = newRawMinY + (origPoint.y - origBounds.minY) * scaleYFactor;
                        }
                    }
                    
                    // Redraw to show the resize preview
                    redrawAllStrokes();
                    drawSelectionBoundingBox();
                    showStrokeMenu.value = false;
                }
                
                stopEvent(e);
                return;
            }
            
            // Handle active dragging
            if (isDragging.value && selectedStroke.value) {
                // Only continue with the same pointer that started
                if (e.pointerId !== activePointerId.value) return;
                
                const canvas = activePage.value.drawingCanvas || null;
                const pt = getCanvasPointFromEvent(canvas, e);
                if (!pt) return;
                const currentX = pt.x;
                const currentY = pt.y;
                
                const dx = currentX - lastX;
                const dy = currentY - lastY;
                
                const strokes = activePage.value.strokes || [];

                const moveStrokeBy = (s) => {
                    const first = s[0];
                    if (first.type === 'image') {
                        first.x += dx;
                        first.y += dy;
                    } else if (first.type === 'highlight-rect') {
                        const rects = first.rects || [{ x: first.x, y: first.y, width: first.width, height: first.height }];
                        rects.forEach(rect => { rect.x += dx; rect.y += dy; });
                        if (first.x !== undefined) { first.x += dx; first.y += dy; }
                    } else if (first.type === 'text') {
                        first.x += dx;
                        first.y += dy;
                    } else if (first.type === 'line' || first.type === 'rectangle' || first.type === 'circle') {
                        first.startX += dx;
                        first.startY += dy;
                        first.endX += dx;
                        first.endY += dy;
                        first.x = first.startX;
                        first.y = first.startY;
                    } else {
                        for (let point of s) { point.x += dx; point.y += dy; }
                    }
                };

                if (Array.isArray(selectedStrokes.value) && selectedStrokes.value.length > 1) {
                    selectedStrokes.value.forEach(sel => {
                        if (sel.pageIndex !== currentCanvasIndex) return;
                        const s = strokes[sel.strokeIndex];
                        if (s) moveStrokeBy(s);
                    });
                    // Keep selectedStrokes linked to live stroke references so bbox updates during drag
                    selectedStrokes.value.forEach(sel => {
                        if (sel.pageIndex !== currentCanvasIndex) return;
                        sel.stroke = strokes[sel.strokeIndex];
                    });
                } else {
                    const s = strokes[selectedStroke.value.strokeIndex];
                    if (s) moveStrokeBy(s);
                }

                // Redraw to show the drag preview (combined bbox if multi)
                redrawAllStrokes();
                drawSelectionBoundingBox();
                
                lastX = currentX;
                lastY = currentY;

                stopEvent(e);
            }
            // Check if we should start dragging
            else if (isMouseDown.value && selectedStroke.value) {
                if (e.pointerId !== activePointerId.value) return;
                
                const canvas = activePage.value.drawingCanvas || null;
                const pt = getCanvasPointFromEvent(canvas, e);
                if (!pt) return;
                const currentX = pt.x;
                const currentY = pt.y;
                
                const distance = Math.sqrt(
                    Math.pow(currentX - dragStartPos.value.x, 2) + 
                    Math.pow(currentY - dragStartPos.value.y, 2)
                );
                
                // Start dragging if moved more than 5 pixels
                if (distance > 5) {
                    isDragging.value = true;
                    showStrokeMenu.value = false; // Hide menu when dragging starts
                    lastX = currentX;
                    lastY = currentY;
                }
            }
            
            return;
        };

        
        // Handle selection rectangle
        if ((isSelectionMode.value || isSelectModeActive.value) && isSelecting.value) {
            handleSelectionRectangle(e);
            return;
        }
        
        // Only continue with the same pointer that started
        if (e.pointerId !== activePointerId.value) return;
        
        // Block touch unless touch drawing is enabled
        if (e.pointerType === 'touch' && !enableTouchDrawing.value) return;
        
        // Check if pen secondary button is pressed for erasing
        const isPenSecondaryButton = e.pointerType === 'pen' && (e.buttons === 2 || e.buttons === 32 || e.button === 5);
        const shouldErase = isEraser.value || isPenSecondaryButton;
        
        stopEvent(e);
        
        if (currentCanvasIndex === -1) return;
        
        const canvas = activePage.value.drawingCanvas || null;
        const drawingContext = activePage.value.drawingContext || null;
        
        if (!canvas || !drawingContext) return;
        
        const pt = getCanvasPointFromEvent(canvas, e);
        if (!pt) return;
        const currentX = pt.x;
        const currentY = pt.y;
        
        if (shouldErase) {
            eraseAtPoint(currentX, currentY);
        } else if (drawMode.value === 'pen') {
            currentStroke.value.push({
                id: currentStrokeId.value,
                x: currentX,
                y: currentY,
                color: drawColor.value,
                thickness: drawThickness.value,
                type: 'pen'
            });
            
            drawingContext.lineTo(currentX, currentY);
            drawingContext.strokeStyle = drawColor.value;
            drawingContext.lineWidth = drawThickness.value;
            drawingContext.lineCap = 'round';
            drawingContext.lineJoin = 'round';
            drawingContext.stroke();
        } else {
            // For shapes, restore snapshot and draw preview
            if (canvasSnapshot) {
                drawingContext.putImageData(canvasSnapshot, 0, 0);
            }
            
            drawingContext.strokeStyle = drawColor.value;
            drawingContext.lineWidth = drawThickness.value;
            drawingContext.lineCap = 'round';
            drawingContext.lineJoin = 'round';
            
            if (drawMode.value === 'line' || drawMode.value === 'rectangle' || drawMode.value === 'circle') {
                drawShape(drawingContext, drawMode.value, startX, startY, currentX, currentY);
            }
        }
        
        lastX = currentX;
        lastY = currentY;
    };

    const stopDrawing = (e) => {
        if (handToolActive.value) {
            if (!isHandToolPanning.value) return;
            if (e && e.pointerId !== handPanPointerId.value) return;

            if (handPanCanvasEl.value && e && e.pointerId !== undefined) {
                try {
                    handPanCanvasEl.value.releasePointerCapture(e.pointerId);
                } catch (err) {
                    // Ignore if capture was already released
                }
            }

            isHandToolPanning.value = false;
            handPanStart.value = null;
            handPanPointerId.value = null;
            handPanCanvasEl.value = null;

            if (e) stopEvent(e);
            return;
        }

        if (textModesActive.value) return;
        
        if (isSelectModeActive.value && (isStrokeHovering.value || isDragging.value || isResizing.value || isRotating.value) && isMouseDown.value && selectedStroke.value) {
            // Only stop if it's the same pointer
            if (e && e.pointerId !== activePointerId.value) return;

            const canvas = activePage.value.drawingCanvas || null;
            
            if (canvas && e && e.pointerId !== undefined) {
                try {
                    canvas.releasePointerCapture(e.pointerId);
                } catch (err) {
                    // Ignore if capture was already released
                }
            }
            
            const stroke = activePage.value.strokes[selectedStroke.value.strokeIndex];
            
            // Save to history if resized, dragged, or rotated
            if (isResizing.value || isDragging.value || isRotating.value) {
                const canvas = activePage.value.drawingCanvas || null;
                const pt = getCanvasPointFromEvent(canvas, e);
                if (!pt) return;
                const currentX = pt.x;
                const currentY = pt.y;
                
                const hasMoved = Math.abs(currentX - dragStartPos.value.x) > 1 || 
                                Math.abs(currentY - dragStartPos.value.y) > 1;
                
                if (hasMoved) {
                    if (Array.isArray(selectedStrokes.value) && selectedStrokes.value.length > 1) {
                        // Emit history for each moved stroke on this canvas
                        selectedStrokes.value.forEach(sel => {
                            if (sel.pageIndex !== currentCanvasIndex) return;
                            const s = activePage.value.strokes[sel.strokeIndex];
                            if (!s) return;
                            strokeChangeCallback({
                                id: s[0].id,
                                type: 'move',
                                page: activePage.value,
                                strokeIndex: sel.strokeIndex,
                                stroke: JSON.parse(JSON.stringify(s)),
                                previousStroke: sel.originalStroke || JSON.parse(JSON.stringify(s))
                            });
                        });
                        // Keep style menu visible for multi-selection after move
                        showStrokeMenu.value = true;
                    } else {
                        const changeType = isRotating.value ? 'rotate' : (isResizing.value ? 'resize' : 'move');
                        strokeChangeCallback({
                            id: stroke[0].id,
                            type: changeType,
                            page: activePage.value,
                            strokeIndex: selectedStroke.value.strokeIndex,
                            stroke: JSON.parse(JSON.stringify(stroke)),
                            previousStroke: selectedStroke.value.originalStroke
                        });
                        showStrokeMenu.value = true;
                    }
                }
            }
            
            // Redraw without highlight after drag/resize
            if (isDragging.value || isResizing.value) {
                redrawAllStrokes();
                // Redraw highlight to show final position
                if (selectedStroke.value) {
                    if (Array.isArray(selectedStrokes.value) && selectedStrokes.value.length > 1) {
                        // Update originals for all selections on this canvas
                        selectedStrokes.value.forEach(sel => {
                            if (sel.pageIndex !== currentCanvasIndex) return;
                            const s = activePage.value.strokes[sel.strokeIndex];
                            if (s) {
                                // Keep live reference for stroke, snapshot original for future operations
                                sel.stroke = s;
                                sel.originalStroke = JSON.parse(JSON.stringify(s));
                            }
                        });
                    } else {
                        // Update originalStroke to reflect the new state so subsequent edits are based on this
                        selectedStroke.value.stroke = JSON.parse(JSON.stringify(stroke));
                        selectedStroke.value.originalStroke = JSON.parse(JSON.stringify(stroke));
                    }
                    drawSelectionBoundingBox();
                }
            }

            isDragging.value = false;
            isResizing.value = false;
            isRotating.value = false;
            resizeHandle.value = null;
            resizeStartBounds.value = null;
            isMouseDown.value = false;
            activePointerId.value = null;
            activePointerType.value = null;
            dragStartPos.value = null;
            currentCanvasIndex = -1;
            return;
        };

        // Handle selection complete
        if ((isSelectionMode.value || isSelectModeActive.value) && isSelecting.value && selectionStart.value && selectionEnd.value) {
            handleSelectionEnd(e);
            return;
        }
        
        // Only stop if it's the same pointer
        if (e && e.pointerId !== activePointerId.value) return;
        
        if (currentCanvasIndex === -1) return;
        
        // Release pointer capture
        const canvas = activePage.value.drawingCanvas || null;
        if (canvas && e && e.pointerId !== undefined) {
            try {
                canvas.releasePointerCapture(e.pointerId);
            } catch (err) {
                // Ignore if capture was already released
            }
        }
        
        isMouseDown.value = false;
        activePointerId.value = null;
        activePointerType.value = null;
        
        let newStroke = null;
        if (isDrawing.value && drawMode.value !== 'pen' && canvasSnapshot) {
            // Check if shape has any dimension
            if (startX !== lastX || startY !== lastY) {
                // Save shape as a stroke
                const shape = {
                    id: currentStrokeId.value,
                    type: drawMode.value,
                    startX,
                    startY,
                    endX: lastX,
                    endY: lastY,
                    color: drawColor.value,
                    thickness: drawThickness.value
                };
                newStroke = [shape];
                activePage.value.strokes.push(newStroke);
            } else {
                const ctx = activePage.value?.drawingContext || null;
                if (ctx) ctx.putImageData(canvasSnapshot, 0, 0);
            }
            canvasSnapshot = null;
        } else if (isDrawing.value && currentStroke.value.length > 1) {
            newStroke = [...currentStroke.value];
            activePage.value.strokes.push(newStroke);
            currentStroke.value = [];
        } else {
            // Discard single point pen strokes or empty shapes
            currentStroke.value = [];
        }

        if (newStroke) {
            strokeChangeCallback({
                id: currentStrokeId.value,
                type: 'add',
                page: activePage.value,
                stroke: newStroke
            });

            currentStrokeId.value = null;
        }
        
        const drawingContext = activePage.value?.drawingContext || null;
        if (drawingContext) {
            drawingContext.closePath();
        }
        
        currentCanvasIndex = -1;
    };

    const onPointerMove = (e) => {
        if (e.pointerType === 'pen') {
            isPenHovering.value = true;
        }

        if (isSelectModeActive.value) {
            let newStrokeHovering = false;
            let newBBoxHovering = false;
            let newResizeHandle = null;
    
            // Perform hit detection only when mouse is not down (hovering)
            if (!isMouseDown.value) {
                const canvasIndex = activePage.value.index;
                if (canvasIndex !== -1) {
                    const canvas = activePage.value.drawingCanvas || null;
                    const pt = getCanvasPointFromEvent(canvas, e);
                    
                    if (pt) {
                        const { x, y } = pt;
    
                        // 1. Check stroke hover
                        newStrokeHovering = isAnyStrokeAtPoint(x, y, canvasIndex);
    
                        // 2. Check bounding box & resize handle hover (only if selected stroke is on this page)
                        if (selectedStroke.value && selectedStroke.value.pageId === activePage.value.id) {
                            const bounds = getStrokeBounds(selectedStroke.value.stroke, 5);
                            if (bounds) {
                                newResizeHandle = getResizeHandle(x, y, bounds, selectedStroke.value.stroke);
    
                                const inside = x >= bounds.minX && x <= bounds.maxX && y >= bounds.minY && y <= bounds.maxY;
                                let nearEdge = false;
                                
                                // Optimization: Check edges only if not already inside or on a handle
                                if (!inside && !newResizeHandle) {
                                    const edgeThreshold = 6;
                                    const nearLeft = Math.abs(x - bounds.minX) <= edgeThreshold && y >= bounds.minY - edgeThreshold && y <= bounds.maxY + edgeThreshold;
                                    const nearRight = Math.abs(x - bounds.maxX) <= edgeThreshold && y >= bounds.minY - edgeThreshold && y <= bounds.maxY + edgeThreshold;
                                    const nearTop = Math.abs(y - bounds.minY) <= edgeThreshold && x >= bounds.minX - edgeThreshold && x <= bounds.maxX + edgeThreshold;
                                    const nearBottom = Math.abs(y - bounds.maxY) <= edgeThreshold && x >= bounds.minX - edgeThreshold && x <= bounds.maxX + edgeThreshold;
                                    nearEdge = nearLeft || nearRight || nearTop || nearBottom;
                                }
    
                                newBBoxHovering = !!newResizeHandle || inside || nearEdge;
                            }
                        }
                    }
                }
            }
    
            // Batch update reactive state
            if (isStrokeHovering.value !== newStrokeHovering) {
                isStrokeHovering.value = newStrokeHovering;
            }
            if (isBoundingBoxHovering.value !== newBBoxHovering) {
                isBoundingBoxHovering.value = newBBoxHovering;
            }
            if (!isMouseDown.value) {
                // Map NE to rotate for single-selected strokes (except highlight-rect/text)
                if (newResizeHandle === 'ne' && selectedStroke.value) {
                    const multiActive = Array.isArray(selectedStrokes.value) && selectedStrokes.value.filter(s => s.pageIndex === getCanvasIndexFromEvent(e)).length > 1;
                    const type = selectedStroke.value.stroke[0]?.type;
                    if (!multiActive && type !== 'highlight-rect' && type !== 'text') newResizeHandle = 'rotate';
                }
                if (resizeHandle.value !== newResizeHandle) {
                    resizeHandle.value = newResizeHandle;
                }
            }
        }

        draw(e);
    };

    const onPointerLeave = (e) => {
        if (e.pointerType === 'pen') {
            isPenHovering.value = false;
        }
        
        isStrokeHovering.value = false;
        isBoundingBoxHovering.value = false;
        stopDrawing(e);
    };
    
    const resetToolState = () => {
        closeTextEditor();
        isTextHighlightMode.value = false;
        isTextSelectionMode.value = false;
        isTextInputMode.value = false;
        isDrawing.value = false;
        isEraser.value = false;
        isSelectionMode.value = false;
        isStrokeHovering.value = false;
        selectedStrokes.value = [];
        selectedStroke.value = null;
        isDragging.value = false;
        isResizing.value = false;
        resizeHandle.value = null;
        showStrokeMenu.value = false;
        isSelectModeActive.value = false;
        handToolActive.value = false;
        showStrokeMenu.value = false;
        showStrokeStyleMenu.value = false;
    };

    const changeStrokeColor = (newColor) => {
        if (!selectedStroke.value) return;
        const pageId = selectedStroke.value.pageId;
        const strokes = activePage.value.strokes || [];

        const isMulti = Array.isArray(selectedStrokes.value) && selectedStrokes.value.length > 1;
        if (isMulti) {
            // Apply color to all selected strokes on the same page
            selectedStrokes.value.forEach(sel => {
                if (sel.pageId !== pageId) return;
                const s = strokes[sel.strokeIndex];
                if (!s) return;
                const originalStroke = JSON.parse(JSON.stringify(s));
                for (let point of s) {
                    point.color = newColor;
                }
                strokeChangeCallback({
                    id: s[0].id,
                    type: 'color-change',
                    page: activePage.value,
                    strokeIndex: sel.strokeIndex,
                    stroke: JSON.parse(JSON.stringify(s)),
                    previousStroke: originalStroke
                });
            });
        } else {
            const stroke = strokes[selectedStroke.value.strokeIndex];
            if (stroke) {
                const originalStroke = JSON.parse(JSON.stringify(stroke));
                for (let point of stroke) {
                    point.color = newColor;
                }
                strokeChangeCallback({
                    id: stroke[0].id,
                    type: 'color-change',
                    page: activePage.value,
                    strokeIndex: selectedStroke.value.strokeIndex,
                    stroke: JSON.parse(JSON.stringify(stroke)),
                    previousStroke: originalStroke
                });
            }
        }

        // Redraw and bbox reflect multi or single
        redrawAllStrokes();
        drawSelectionBoundingBox();
    };

    const changeStrokeThickness = (newThickness) => {
        if (!selectedStroke.value) return;
        const pageId = selectedStroke.value.pageId;
        const strokes = activePage.value.strokes || [];
        const thicknessVal = parseInt(newThickness, 10);

        const isMulti = Array.isArray(selectedStrokes.value) && selectedStrokes.value.length > 1;
        if (isMulti) {
            selectedStrokes.value.forEach(sel => {
                if (sel.pageId !== pageId) return;
                const s = strokes[sel.strokeIndex];
                if (!s) return;
                const originalStroke = JSON.parse(JSON.stringify(s));
                for (let point of s) {
                    point.thickness = thicknessVal;
                }
                strokeChangeCallback({
                    id: s[0].id,
                    type: 'thickness-change',
                    page: activePage.value,
                    strokeIndex: sel.strokeIndex,
                    stroke: JSON.parse(JSON.stringify(s)),
                    previousStroke: originalStroke
                });
            });
        } else {
            const stroke = strokes[selectedStroke.value.strokeIndex];
            if (stroke) {
                const originalStroke = JSON.parse(JSON.stringify(stroke));
                for (let point of stroke) {
                    point.thickness = thicknessVal;
                }
                strokeChangeCallback({
                    id: stroke[0].id,
                    type: 'thickness-change',
                    page: activePage.value,
                    strokeIndex: selectedStroke.value.strokeIndex,
                    stroke: JSON.parse(JSON.stringify(stroke)),
                    previousStroke: originalStroke
                });
            }
        }

        redrawAllStrokes();
        drawSelectionBoundingBox();
    };

    const changeStrokeText = (newText) => {
        if (!selectedStroke.value) return;
        const pageId = selectedStroke.value.pageId;
        const strokes = activePage.value.strokes || [];
        const html = convertPlainTextToHtml(newText || '');
        const normalized = normalizeTextStrokeContent({ text: newText || '', html });

        const isMulti = Array.isArray(selectedStrokes.value) && selectedStrokes.value.length > 1;
        if (isMulti) {
            selectedStrokes.value.forEach(sel => {
                if (sel.pageId !== pageId) return;
                const s = strokes[sel.strokeIndex];
                if (!s || s[0].type !== 'text') return;
                const originalStroke = JSON.parse(JSON.stringify(s));
                s[0].text = newText;
                s[0].content = normalized;
                strokeChangeCallback({
                    id: s[0].id,
                    type: 'text-change',
                    page: activePage.value,
                    strokeIndex: sel.strokeIndex,
                    stroke: JSON.parse(JSON.stringify(s)),
                    previousStroke: originalStroke
                });
            });
        } else {
            const stroke = strokes[selectedStroke.value.strokeIndex];
            if (stroke && stroke[0].type === 'text') {
                const originalStroke = JSON.parse(JSON.stringify(stroke));
                stroke[0].text = newText;
                stroke[0].content = normalized;
                strokeChangeCallback({
                    id: stroke[0].id,
                    type: 'text-change',
                    page: activePage.value,
                    strokeIndex: selectedStroke.value.strokeIndex,
                    stroke: JSON.parse(JSON.stringify(stroke)),
                    previousStroke: originalStroke
                });
            }
        }

        redrawAllStrokes();
        drawSelectionBoundingBox();
    };

    const deleteSelectedStroke = () => {
        if (!selectedStroke.value) return;

        const isMulti = Array.isArray(selectedStrokes.value) && selectedStrokes.value.length > 1;
        if (isMulti) {
            // Group deletions by page, remove descending by index
            const pages = new Map();
            selectedStrokes.value.forEach(sel => {
                const arr = pages.get(sel.pageIndex) || [];
                arr.push(sel.strokeIndex);
                pages.set(sel.pageIndex, arr);
            });

            pages.forEach((indices, pageIdx) => {
                const strokes = activePage.value.strokes || [];
                const sorted = [...indices].sort((a, b) => b - a);
                const removals = sorted.map(index => ({ index, data: strokes[index] }));
                // Splice descending to avoid reindexing issues
                sorted.forEach(index => { strokes.splice(index, 1); });
                strokeChangeCallback({
                    id: removals[0]?.data?.[0]?.id,
                    type: 'erase',
                    page: activePage.value,
                    strokes: removals
                });
                redrawAllStrokes();
            });

            selectedStrokes.value = [];
            selectedStroke.value = null;
            showStrokeMenu.value = false;
            return;
        }

        // Single deletion
        const strokes = activePage.value.strokes || [];
        const stroke = strokes[selectedStroke.value.strokeIndex];
        if (stroke) {
            strokes.splice(selectedStroke.value.strokeIndex, 1);
            strokeChangeCallback({
                id: stroke[0].id,
                type: 'erase',
                page: activePage.value,
                strokes: [{ index: selectedStroke.value.strokeIndex, data: stroke }]
            });
            redrawAllStrokes();
        }
        selectedStroke.value = null;
        showStrokeMenu.value = false;
    };

    const createHighlightRectangle = (rectsOrX, y, width, height) => {
        const id = uuid();
        
        // Check if we received an array of rects or individual values
        let highlightStroke;
        if (Array.isArray(rectsOrX)) {
            // Multiple rectangles - create a compound highlight
            highlightStroke = [{
                id,
                type: 'highlight-rect',
                rects: rectsOrX, // Array of {x, y, width, height}
                color: drawColor.value,
                thickness: drawThickness.value
            }];
        } else {
            // Single rectangle (backward compatibility)
            highlightStroke = [{
                id,
                type: 'highlight-rect',
                rects: [{ x: rectsOrX, y, width, height }],
                color: drawColor.value,
                thickness: drawThickness.value
            }];
        }
        
        activePage.value.strokes.push(highlightStroke);
        
        strokeChangeCallback({
            id,
            type: 'add',
            page: activePage.value,
            stroke: highlightStroke
        });
        
        redrawAllStrokes();
    };

    const highlightTextSelection = () => {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;
        
        const range = selection.getRangeAt(0);
        const rects = range.getClientRects();
        
        if (rects.length === 0) return;
        
        // Group rects by page and store all rectangles for each page
        const rectsByPage = new Map();
        
        Array.from(rects).forEach(rect => {
            // Skip very small rects (often artifacts)
            if (rect.width < 1 || rect.height < 1) return;
            
            // Find which page this rect belongs to
            const canvas = activePage.value.drawingCanvas || null;
            const canvasIndex = activePage.value.index;
            const canvasRect = canvas.getBoundingClientRect();
            
            // Check if rect overlaps with canvas
            if (rect.bottom > canvasRect.top && rect.top < canvasRect.bottom &&
                rect.right > canvasRect.left && rect.left < canvasRect.right) {
                
                const scaleX = canvas.width / canvasRect.width;
                const scaleY = canvas.height / canvasRect.height;
                
                const x = (rect.left - canvasRect.left) * scaleX;
                const y = (rect.top - canvasRect.top) * scaleY;
                const width = rect.width * scaleX;
                const height = rect.height * scaleY;
                
                if (!rectsByPage.has(canvasIndex)) {
                    rectsByPage.set(canvasIndex, []);
                }
                rectsByPage.get(canvasIndex).push({ x, y, width, height });
            }
        });
        
        // Merge overlapping/adjacent rectangles and create highlights
        rectsByPage.forEach((rects, pageIndex) => {
            if (rects.length === 0) return;
            
            // Sort rectangles by y position first, then x
            rects.sort((a, b) => {
                const yDiff = a.y - b.y;
                return Math.abs(yDiff) < 2 ? a.x - b.x : yDiff;
            });
            
            // Merge rectangles that are on the same line and close/overlapping
            const merged = [];
            let current = { ...rects[0] };
            
            for (let i = 1; i < rects.length; i++) {
                const rect = rects[i];
                const verticalOverlap = Math.max(0, Math.min(current.y + current.height, rect.y + rect.height) - Math.max(current.y, rect.y));
                const onSameLine = verticalOverlap > Math.min(current.height, rect.height) * 0.5;
                const gap = rect.x - (current.x + current.width);
                const closeOrOverlapping = gap < 3; // Small tolerance for gaps
                
                if (onSameLine && closeOrOverlapping) {
                    // Merge: extend current rectangle
                    const newRight = Math.max(current.x + current.width, rect.x + rect.width);
                    const newTop = Math.min(current.y, rect.y);
                    const newBottom = Math.max(current.y + current.height, rect.y + rect.height);
                    current.x = Math.min(current.x, rect.x);
                    current.y = newTop;
                    current.width = newRight - current.x;
                    current.height = newBottom - newTop;
                } else {
                    // Start new rectangle
                    merged.push(current);
                    current = { ...rect };
                }
            }
            merged.push(current);
            
            createHighlightRectangle(merged);
        });

        // Clear the text selection
        window.getSelection()?.removeAllRanges();
    };

    const handleStrokeMenu = (e) => {
        if (!isStrokeHovering.value) return;
        
        const canvasIndex = getCanvasIndexFromEvent(e);
        if (canvasIndex === -1) return;
        
        const canvas = activePage.value.drawingCanvas || null;
        if (!canvas) return;
        const pt = getCanvasPointFromEvent(canvas, e);
        if (!pt) return;
        const { x, y, clientX, clientY } = pt;
        
        const found = findStrokeAtPoint(x, y);

        if (found) {
            selectedStroke.value = {
                ...found,
                originalStroke: JSON.parse(JSON.stringify(found.stroke))
            };
            
            // Show context menu
            showStrokeMenu.value = true;
            strokeMenuPosition.value = {
                x: clientX,
                y: clientY
            };

            currentCanvasIndex = canvasIndex;
            
            // Redraw with highlight
            redrawAllStrokes();
            drawSelectionBoundingBox();
        }
        
        stopEvent(e);
    };

    const editSelectedTextStroke = () => {
        if (!selectedStroke.value) return;
        if (selectedStroke.value.stroke?.[0]?.type !== 'text') return;

        const first = selectedStroke.value.stroke[0];
        const preferredSize = getPreferredTextEditorSize();

        showStrokeMenu.value = false;

        openTextEditor({
            bounds: {
                x: first.x,
                y: first.y,
                width: first.editorWidth || preferredSize.width,
                height: first.editorHeight || preferredSize.height
            },
            content: getTextStrokeContent(first).html,
            strokeRef: {
                pageId: selectedStroke.value.pageId,
                pageIndex: selectedStroke.value.pageIndex,
                strokeIndex: selectedStroke.value.strokeIndex
            }
        });

        redrawAllStrokes();
    };

    const boundingBoxColors = {
        default: '#2a7fff',
        rotate: '#ff2a7f'
    };

    const drawSelectionBoundingBox = () => {
        const strokeIndex = selectedStroke.value.strokeIndex;
        if (strokeIndex === undefined) return;

        const page = activePage.value;
        const canvas = page.drawingCanvas || null;
        const ctx = page.drawingContext || null;
        if (!canvas || !ctx) return;
        const strokes = page.strokes || [];
        const multi = Array.isArray(selectedStrokes.value) && selectedStrokes.value.filter(s => s.pageIndex === page.index).length > 1;
        const stroke = strokes[strokeIndex];
        
        if (!stroke || stroke.length === 0) {
            // If multi-selection is active, continue to compute combined bounds
            if (!multi) return;
        }
        
        const first = stroke[0];
        
        ctx.save();
        ctx.strokeStyle = boundingBoxColors.default;
        ctx.lineWidth = 2;
        
        let minX, minY, maxX, maxY, padding = SELECTION_PADDING;
        let shouldDrawBorder = true;

        if (multi) {
            // Compute union bounds across all selected strokes on this canvas
            minX = Infinity;
            minY = Infinity;
            maxX = -Infinity;
            maxY = -Infinity;
            selectedStrokes.value.forEach(sel => {
                if (sel.pageIndex !== page.index) return;
                const b = getStrokeBounds(sel.stroke, 0);
                if (!b) return;
                minX = Math.min(minX, b.minX);
                minY = Math.min(minY, b.minY);
                maxX = Math.max(maxX, b.maxX);
                maxY = Math.max(maxY, b.maxY);
            });

            if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) {
                ctx.restore();
                return;
            }
            
            // Add padding to multi-selection bounds
            minX -= padding;
            minY -= padding;
            maxX += padding;
            maxY += padding;
            
            // Draw bounding box for multi-selection (no resize handles)
            if (shouldDrawBorder) {
                ctx.strokeRect(minX, minY, maxX - minX, maxY - minY);
            }
        } 
        
        else {
            const b = getStrokeBounds(stroke, 0);
            if (!b) { ctx.restore(); return; }
            minX = b.minX;
            minY = b.minY;
            maxX = b.maxX;
            maxY = b.maxY;

            minX -= padding;
            minY -= padding;
            maxX += padding;
            maxY += padding;
            
            if (shouldDrawBorder) {
                ctx.strokeRect(minX, minY, maxX - minX, maxY - minY);
            }
            
            if (!multi) {
                ctx.setLineDash([]);
                const handleSize = 8;
                const handles = [
                    { x: minX, y: minY, handle: 'nw' },
                    { x: maxX, y: minY, handle: 'ne' },
                    { x: minX, y: maxY, handle: 'sw' },
                    { x: maxX, y: maxY, handle: 'se' },
                    { x: (minX + maxX) / 2, y: minY, handle: 'n' },
                    { x: (minX + maxX) / 2, y: maxY, handle: 's' },
                    { x: minX, y: (minY + maxY) / 2, handle: 'w' },
                    { x: maxX, y: (minY + maxY) / 2, handle: 'e' }
                ];
                let rotationAvailable = first.type !== 'highlight-rect' && first.type !== 'text';
                handles.forEach(h => {
                    if (h.handle === 'ne' && rotationAvailable) {
                        ctx.fillStyle = boundingBoxColors.rotate;
                        ctx.beginPath();
                        ctx.arc(h.x, h.y, handleSize / 2, 0, Math.PI * 2);
                        ctx.fill();
                    } else {
                        ctx.fillStyle = boundingBoxColors.default;
                        ctx.fillRect(h.x - handleSize / 2, h.y - handleSize / 2, handleSize, handleSize);
                    }
                });
            }
        }
        
        ctx.restore();
    };

    const handleTextboxBlur = () => {};

    const eraseAtPoint = (x, y) => {
        const eraserRadius = 10;
        const strokes = activePage.value.strokes || [];
        
        const strokesToRemove = [];
        const keptStrokes = [];
        let strokeId = null;

        strokes.forEach((stroke, index) => {
            strokeId = null;
            let shouldRemove = false;
            for (let point of stroke) {
                const distance = Math.sqrt(Math.pow(point.x - x, 2) + Math.pow(point.y - y, 2));
                if (distance < eraserRadius) {
                    strokeId = stroke.id;
                    shouldRemove = true;
                    break;
                }
            }
            
            if (shouldRemove) {
                strokesToRemove.push({ index, data: stroke });
            } else {
                keptStrokes.push(stroke);
            }
        });
        
        if (strokesToRemove.length > 0) {
            activePage.value.strokes = keptStrokes;
            strokeChangeCallback({
                id: strokeId,
                type: 'erase',
                page: activePage.value,
                strokes: strokesToRemove
            });
            redrawAllStrokes();
        }
    };

    const redrawAllStrokes = (targetPage) => {
        const page = targetPage || activePage.value;
        const canvas = page.drawingCanvas || null;
        const drawingContext = page.drawingContext || null;
        if (!canvas || !drawingContext) return;
    
        const strokes = page.strokes || [];
        
        drawingContext.clearRect(0, 0, canvas.width, canvas.height);

        // Load all images first (use cache), then render everything
        const imagePromises = [];
        const imageMap = new Map();
        
        strokes.forEach((stroke, index) => {
            if (stroke.length > 0 && stroke[0].type === 'image') {
                const imageData = stroke[0].imageData;
                
                // Check if image is already cached
                if (imageCache.has(imageData)) {
                    imageMap.set(index, imageCache.get(imageData));
                } else {
                    // Load and cache the image
                    const promise = new Promise((resolve) => {
                        const img = new Image();
                        img.onload = () => {
                            imageCache.set(imageData, img);
                            imageMap.set(index, img);
                            resolve();
                        };
                        img.onerror = () => resolve(); // Continue even if image fails
                        img.src = imageData;
                    });
                    imagePromises.push(promise);
                }
            }
        });
        
        // Wait for any new images to load, then render
        Promise.all(imagePromises).then(() => {
            const selectedIndex = (selectedStroke.value && selectedStroke.value.pageId === page.id)
                ? selectedStroke.value.strokeIndex
                : -1;

            const renderStroke = (stroke, index) => {
                if (!stroke || stroke.length === 0) return;

                const first = stroke[0];

                // Save canvas state before drawing each stroke
                drawingContext.save();

                // Check if it's an image
                if (first.type === 'image') {
                    const img = imageMap.get(index);
                    if (img) {
                        const angle = first.rotation || 0;
                        if (angle) {
                            const cx = first.x + first.width / 2;
                            const cy = first.y + first.height / 2;
                            drawingContext.translate(cx, cy);
                            drawingContext.rotate(angle);
                            drawingContext.drawImage(img, -first.width / 2, -first.height / 2, first.width, first.height);
                        } else {
                            drawingContext.drawImage(img, first.x, first.y, first.width, first.height);
                        }
                    }
                    drawingContext.restore();
                    return;
                }

                // Check if it's a highlight rectangle (no rotation support)
                if (first.type === 'highlight-rect') {
                    drawingContext.fillStyle = first.color;
                    drawingContext.globalAlpha = 0.3;
                    // Use a single path to avoid overlapping seams
                    drawingContext.beginPath();
                    const rects = first.rects || [{ x: first.x, y: first.y, width: first.width, height: first.height }];
                    rects.forEach(rect => {
                        drawingContext.rect(rect.x, rect.y, rect.width, rect.height);
                    });
                    drawingContext.fill();
                    drawingContext.restore(); // This resets globalAlpha
                    return;
                }

                // Do not early-return for text; allow rotation/general path below

                // Apply rotation transform for non-image strokes if present
                const angle = first.rotation || 0;
                if (angle) {
                    const b = getStrokeBounds(stroke, 0);
                    const cx = (b.minX + b.maxX) / 2;
                    const cy = (b.minY + b.maxY) / 2;
                    drawingContext.translate(cx, cy);
                    drawingContext.rotate(angle);
                }

                // Check if it's a shape
                if (first.type === 'line' || first.type === 'rectangle' || first.type === 'circle') {
                    drawingContext.strokeStyle = first.color;
                    drawingContext.lineWidth = first.thickness;
                    drawingContext.lineCap = 'round';
                    drawingContext.lineJoin = 'round';
                    // Draw with coordinates relative to center when rotated
                    if (angle) {
                        const b = getStrokeBounds(stroke, 0);
                        const cx = (b.minX + b.maxX) / 2;
                        const cy = (b.minY + b.maxY) / 2;
                        drawShape(drawingContext, first.type, first.startX - cx, first.startY - cy, first.endX - cx, first.endY - cy, first);
                    } else {
                        drawShape(drawingContext, first.type, first.startX, first.startY, first.endX, first.endY, first);
                    }
                } else if (first.type === 'highlight-rect') {
                    drawingContext.fillStyle = first.color;
                    drawingContext.globalAlpha = 0.3;
                    drawingContext.beginPath();
                    const rects = first.rects || [{ x: first.x, y: first.y, width: first.width, height: first.height }];
                    if (angle) {
                        const b = getStrokeBounds(stroke, 0);
                        const cx = (b.minX + b.maxX) / 2;
                        const cy = (b.minY + b.maxY) / 2;
                        rects.forEach(rect => {
                            drawingContext.rect(rect.x - cx, rect.y - cy, rect.width, rect.height);
                        });
                    } else {
                        rects.forEach(rect => {
                            drawingContext.rect(rect.x, rect.y, rect.width, rect.height);
                        });
                    }
                    drawingContext.fill();
                } else if (first.type === 'text') {
                    const textBox = getTextBoxSize(stroke);
                    if (!textBox) {
                        drawingContext.restore();
                        return;
                    }

                    if (angle) {
                        const b = getStrokeBounds(stroke, 0);
                        const cx = (b.minX + b.maxX) / 2;
                        const cy = (b.minY + b.maxY) / 2;
                        drawTextStroke(drawingContext, first, first.x - cx, first.y - cy, textBox.width, textBox.height);
                    } else {
                        drawTextStroke(drawingContext, first, first.x, first.y, textBox.width, textBox.height);
                    }
                } else {
                    // It's a pen stroke
                    drawingContext.beginPath();
                    if (angle) {
                        const b = getStrokeBounds(stroke, 0);
                        const cx = (b.minX + b.maxX) / 2;
                        const cy = (b.minY + b.maxY) / 2;
                        drawingContext.moveTo(stroke[0].x - cx, stroke[0].y - cy);
                        for (let i = 1; i < stroke.length; i++) {
                            drawingContext.lineTo(stroke[i].x - cx, stroke[i].y - cy);
                        }
                    } else {
                        drawingContext.moveTo(stroke[0].x, stroke[0].y);
                        for (let i = 1; i < stroke.length; i++) {
                            drawingContext.lineTo(stroke[i].x, stroke[i].y);
                        }
                    }
                    drawingContext.strokeStyle = stroke[0].color;
                    drawingContext.lineWidth = stroke[0].thickness;
                    drawingContext.lineCap = 'round';
                    drawingContext.lineJoin = 'round';
                    drawingContext.stroke();
                }

                // Restore canvas state after drawing
                drawingContext.restore();
            };

            // Draw all non-selected strokes first
            strokes.forEach((stroke, index) => {
                if (index === selectedIndex) return;
                renderStroke(stroke, index);
            });

            // Draw selected stroke last so it's always on top
            if (selectedIndex >= 0 && strokes[selectedIndex]) {
                renderStroke(strokes[selectedIndex], selectedIndex);
            }

            // Always draw selection overlay last so it stays on top.
            if (selectedIndex >= 0) {
                drawSelectionBoundingBox();
            }
        });
    };

    const captureSelection = () => {
        if (!selectionStart.value || !selectionEnd.value) return;
        
        const canvasIndex = selectionStart.value.canvasIndex;
        const pdfCanvas = activePage.value.canvas;
        const drawCanvas = activePage.value.drawingCanvas;
        
        if (!pdfCanvas || !drawCanvas) return;
        
        // Get display coordinates
        const rect = drawCanvas.getBoundingClientRect();
        const scaleX = pdfCanvas.width / rect.width;
        const scaleY = pdfCanvas.height / rect.height;
        
        // Calculate selection rectangle in canvas coordinates
        let x = Math.min(selectionStart.value.x, selectionEnd.value.x) * scaleX;
        let y = Math.min(selectionStart.value.y, selectionEnd.value.y) * scaleY;
        let selectedWidth = Math.abs(selectionEnd.value.x - selectionStart.value.x) * scaleX;
        let selectedHeight = Math.abs(selectionEnd.value.y - selectionStart.value.y) * scaleY;
        
        // Exclude the 1px border from capture (offset by 1px on all sides)
        const borderOffset = 1;
        x += borderOffset;
        y += borderOffset;
        selectedWidth = Math.max(1, selectedWidth - borderOffset * 2);
        selectedHeight = Math.max(1, selectedHeight - borderOffset * 2);
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = pdfCanvas.width;
        tempCanvas.height = pdfCanvas.height;
        const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });
        
        // Draw PDF canvas
        tempCtx.drawImage(pdfCanvas, 0, 0);
        // Draw annotations canvas
        tempCtx.drawImage(drawCanvas, 0, 0);
        
        // Extract the selected region
        try {
            const imageData = tempCtx.getImageData(x, y, selectedWidth, selectedHeight);
            const cropCanvas = document.createElement('canvas');
            cropCanvas.width = selectedWidth;
            cropCanvas.height = selectedHeight;
            const cropCtx = cropCanvas.getContext('2d', { willReadFrequently: true });
            cropCtx.putImageData(imageData, 0, 0);
            
            const dataUrl = cropCanvas.toDataURL('image/png');
            
            // Set as copied stroke
            copyAsStroke({
                inserted: 0,
                stroke: [{
                    type: 'image',
                    x: x,
                    y: y,
                    width: selectedWidth,
                    height: selectedHeight,
                    imageData: dataUrl
                }]
            });

            // Redraw to clear the selection rectangle
            redrawAllStrokes();
            isSelectModeActive.value = true;
        } catch (error) {
            console.error('Error capturing selection:', error);
        }
    };

     const drawImageCanvas = async (src) => {
        await nextTick();
        const canvas = activePage.value.canvas;
        const drawCanvas = activePage.value.drawingCanvas;
        if (canvas && drawCanvas) {
            const img = new Image();
            img.onload = () => {
                // Fit image to current width setting
                const targetWidth = (pagesContainer.value?.clientWidth || canvas.parentElement?.clientWidth || img.width);
                const scale = targetWidth / img.width;
                const canvasWidth = img.width * scale;
                const canvasHeight = img.height * scale;

                const pixelRatio = window.devicePixelRatio || 1;

                canvas.width = canvasWidth * pixelRatio;
                canvas.height = canvasHeight * pixelRatio;
                canvas.style.width = `100%`;
                canvas.style.height = `auto`;

                drawCanvas.width = canvasWidth * pixelRatio;
                drawCanvas.height = canvasHeight * pixelRatio;
                drawCanvas.style.width = `100%`;
                drawCanvas.style.height = `100%`;

                const ctx = canvas.getContext('2d', { willReadFrequently: true });
                ctx.clearRect(0, 0, canvasWidth * pixelRatio, canvasHeight * pixelRatio);
                ctx.drawImage(img, 0, 0, canvasWidth * pixelRatio, canvasHeight * pixelRatio);

                activePage.value.drawingContext = drawCanvas.getContext('2d', { willReadFrequently: true });
                redrawAllStrokes();
                activePage.value.rendered = true;
            };
            img.src = src;
        }
    }

    const clampStrokeMenuPosition = async () => {
        // Ensure the menu has rendered before measuring
        await nextTick();
        const el = strokeMenu.value;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight;

        // Account for CSS transform: translate(-50%, 10px)
        const halfW = rect.width / 2;
        const offsetY = 0; // matches SCSS transform Y
        const margin = 8;   // keep a small margin from edges

        // Prefer placing menu to the right of the stroke if it fits, else left
        let preferredX = strokeMenuPosition.value.x;
        let preferredY = strokeMenuPosition.value.y;

        if (selectedStroke?.value) {
            const canvas = activePage.value.drawingCanvas || null;
            if (canvas) {
                const cRect = canvas.getBoundingClientRect();
                const scaleXToClient = cRect.width / canvas.width;
                const scaleYToClient = cRect.height / canvas.height;

                const stroke = selectedStroke.value.stroke;
                const first = stroke[0];
                let minX, minY, maxX, maxY;

                if (first.type === 'image') {
                    const b = getStrokeBounds(stroke, 0);
                    if (b) {
                        minX = b.minX; minY = b.minY; maxX = b.maxX; maxY = b.maxY;
                    }
                } else if (first.type === 'highlight-rect') {
                    // Calculate bounding box for all rectangles
                    const rects = first.rects || [{ x: first.x, y: first.y, width: first.width, height: first.height }];
                    minX = Infinity;
                    minY = Infinity;
                    maxX = -Infinity;
                    maxY = -Infinity;
                    rects.forEach(rect => {
                        minX = Math.min(minX, rect.x);
                        minY = Math.min(minY, rect.y);
                        maxX = Math.max(maxX, rect.x + rect.width);
                        maxY = Math.max(maxY, rect.y + rect.height);
                    });
                } else if (first.type === 'text') {
                    const textBox = getTextBoxSize(stroke);
                    if (textBox) {
                        minX = first.x;
                        minY = first.y;
                        maxX = first.x + textBox.width;
                        maxY = first.y + textBox.height;
                    }
                } else if (first.type === 'line' || first.type === 'rectangle' || first.type === 'circle') {
                    if (first.type === 'circle') {
                        let rx, ry;
                        if (first.radiusX !== undefined || first.radiusY !== undefined) {
                            rx = first.radiusX !== undefined ? first.radiusX : Math.abs(first.endX - first.startX);
                            ry = first.radiusY !== undefined ? first.radiusY : Math.abs(first.endY - first.startY);
                        } else {
                            const radius = Math.sqrt((first.endX - first.startX) ** 2 + (first.endY - first.startY) ** 2);
                            rx = radius;
                            ry = radius;
                        }
                        minX = first.startX - rx; maxX = first.startX + rx;
                        minY = first.startY - ry; maxY = first.startY + ry;
                    } else {
                        minX = Math.min(first.startX, first.endX);
                        maxX = Math.max(first.startX, first.endX);
                        minY = Math.min(first.startY, first.endY);
                        maxY = Math.max(first.startY, first.endY);
                    }
                } else {
                    // pen stroke
                    minX = Infinity; minY = Infinity; maxX = -Infinity; maxY = -Infinity;
                    for (const p of stroke) {
                        if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y;
                        if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y;
                    }
                }

                if (minX !== undefined) {
                    const clientMinX = cRect.left + minX * scaleXToClient;
                    const clientMaxX = cRect.left + maxX * scaleXToClient;
                    const clientMinY = cRect.top + minY * scaleYToClient;
                    const clientMaxY = cRect.top + maxY * scaleYToClient;

                    const offset = 10;
                    const menuWidth = rect.width;
                    const menuHeight = rect.height;

                    // Anchor menu top-right to stroke bottom-right with a small offset
                    let desiredRight = clientMaxX + offset;
                    let desiredTop = clientMaxY + offset;
                    let desiredLeft = desiredRight - menuWidth;

                    // If right placement overflows, place menu to the left of the stroke
                    if (desiredRight > viewportWidth - margin) {
                        desiredRight = clientMinX - offset;
                        desiredLeft = desiredRight - menuWidth;
                    }

                    // If bottom placement overflows, move menu above the stroke
                    if (desiredTop + menuHeight > viewportHeight - margin) {
                        desiredTop = clientMinY - offset - menuHeight;
                    }

                    // Clamp to viewport margins to keep fully visible
                    desiredLeft = Math.min(Math.max(margin, desiredLeft), viewportWidth - margin - menuWidth);
                    desiredTop = Math.min(Math.max(margin, desiredTop), viewportHeight - margin - menuHeight);

                    // Convert desired top-left into transform-adjusted center coordinates
                    preferredX = desiredLeft + halfW;
                    preferredY = desiredTop - offsetY;
                }
            }
        }

        const minX = margin + halfW;
        const maxX = viewportWidth - margin - halfW;
        const minY = margin - offsetY; // ensure top (with offset) >= margin
        const maxY = viewportHeight - margin - rect.height - offsetY;

        const clampedX = Math.min(Math.max(minX, preferredX), Math.max(minX, maxX));
        const clampedY = Math.min(Math.max(minY, preferredY), Math.max(minY, maxY));

        if (clampedX !== strokeMenuPosition.value.x || clampedY !== strokeMenuPosition.value.y) {
            strokeMenuPosition.value = { x: clampedX, y: clampedY };
        }
    };

    return {
        currentStroke,
        isTextHighlightMode,
        isTextSelectionMode,
        isSelectModeActive,
        isDrawing,
        isEraser,
        drawMode,
        drawColor,
        drawThickness,
        colors,
        isTextInputMode,
        textPosition,
        textCanvasIndex,
        fontSize,
        textboxPosition,
        textEditorPosition,
        textEditorSimpleMode,
        textEditorHtml,
        isSelectionMode,
        selectionStart,
        selectionEnd,
        isPenHovering,
        isStrokeHovering,
        isBoundingBoxHovering,
        selectedStroke,
        selectedStrokes,
        isDragging,
        isResizing,
        strokeMenu,
        showStrokeMenu,
        strokeMenuPosition,
        handToolActive,
        isHandToolPanning,
        startDrawing,
        draw,
        stopDrawing,
        onPointerMove,
        onPointerLeave,
        editSelectedTextStroke,
        commitTextEditor,
        closeTextEditor,
        syncTextEditorPosition,
        updateTextEditorSize,
        updateTextEditorPosition,
        resetToolState,
        handleTextboxBlur,
        redrawAllStrokes,
        drawImageCanvas,
        changeStrokeColor,
        changeStrokeThickness,
        changeStrokeText,
        deleteSelectedStroke,
        handleStrokeMenu,
        resizeCursor,
        initialStrokeStyles,
        activeStrokeStyle,
        setInitialStrokeColor,
        setInitialStrokeThickness,
        handleStrokeStyleButtonClick,
        clampStrokeMenuPosition,
        createHighlightRectangle,
        highlightTextSelection,
        copiedStroke,
        copiedStrokes,
        copySelectedStroke,
        insertCopiedStroke,
        retrieveClipboardData,
        isSelectedStrokeType,
        selectStrokes,
        showStrokeStyleMenu
    };
}