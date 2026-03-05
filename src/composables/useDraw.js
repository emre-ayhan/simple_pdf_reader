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

const colorPalette = [
    '#111827', '#1f2937', '#374151', '#6b7280', '#9ca3af',
    '#1d4ed8', '#2563eb', '#3b82f6', '#0ea5e9', '#06b6d4',
    '#0f766e', '#14b8a6', '#047857', '#10b981', '#22c55e',
    '#84cc16', '#eab308', '#f59e0b', '#f97316', '#dc2626',
    '#ef4444', '#f43f5e', '#ec4899', '#7c3aed', '#8b5cf6',
    '#a855f7', '#d946ef', '#92400e', '#78350f', '#a16207',
];

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

export function useDraw(pagesContainer, activePage, addToHistory) {
    const { get: storeGet, set: storeSet } = useStore();

    // Drawing variables
    const isSelectModeActive = ref(false);
    const isTextSelectionMode = ref(true);
    const isTextHighlightMode = ref(false);
    const isDrawing = ref(false);
    const isEraser = ref(false);
    const drawMode = ref('pen'); // 'pen', 'line', 'rectangle', 'circle', 'text', 'highlight'

    const normalizeDash = (dash) => {
        const allowed = ['solid', 'dashed', 'dotted'];
        return allowed.includes(dash) ? dash : 'solid';
    };

    const normalizeOpacity = (opacity) => {
        const parsed = Number(opacity);
        if (!Number.isFinite(parsed)) return 1;
        return Math.max(0.05, Math.min(1, parsed));
    };

    const normalizeDrawStyle = (style = {}) => ({
        color: typeof style.color === 'string' ? style.color : '#1d4ed8',
        thickness: Math.max(1, Number(style.thickness) || 2),
        fill: Boolean(style.fill),
        opacity: normalizeOpacity(style.opacity),
        dash: normalizeDash(style.dash)
    });

    const normalizeStrokeStylePreset = (style = {}) => {
        const normalized = normalizeDrawStyle(style);
        return {
            color: normalized.color,
            thickness: normalized.thickness,
            fill: normalized.fill,
            opacity: normalized.opacity,
            dash: normalized.dash
        };
    };

    const drawStyle = ref({
        color: '#1d4ed8',
        thickness: 2,
        fill: false,
        opacity: 1,
        dash: 'solid'
    });

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

    const selectedStrokeIndex = ref(0);

    const showStrokeStyleMenu = ref(false);

    const strokeStyles = ref([{
        color: '#1d4ed8',
        thickness: 2,
        fill: false,
        opacity: 1,
        dash: 'solid'
    }, {
        color: '#ef4444',
        thickness: 2,
        fill: false,
        opacity: 1,
        dash: 'solid'
    }, {
        color: '#22c55e',
        thickness: 2,
        fill: false,
        opacity: 1,
        dash: 'solid'
    }, {
        color: '#f97316',
        thickness: 2,
        fill: false,
        opacity: 1,
        dash: 'solid'
    }]);

    const activeStrokeStyle = computed(() => {
        return strokeStyles.value.find(style => style.color === drawStyle.value.color) || null;
    });

    storeGet('strokeStyles').then(value => {
        if (Array.isArray(value) && value.length === 4) {
            strokeStyles.value = value.map(style => normalizeStrokeStylePreset(style));
        }
    })

    storeGet('selectedStrokeIndex', 0).then(value => {
        selectedStrokeIndex.value = value;
        const style = strokeStyles.value[value];
        if (!style) return;
        drawStyle.value = normalizeDrawStyle(style);
    });

    const getScaledDrawingThickness = () => {
        const dpr = window.devicePixelRatio || 1;
        return drawStyle.value.thickness * dpr;
    }

    const updateStrokeStyle = (index, style, value) => {
        if (index < 0 || index >= strokeStyles.value.length) return;
        strokeStyles.value[index][style] = value;

        drawStyle.value = {
            ...drawStyle.value,
            [style]: value
        };

        // Persist to store
        storeSet('strokeStyles', strokeStyles.value);
    }

    const handleStrokeStyleButtonClick = (index) => {
        if (index < 0 || index >= strokeStyles.value.length) return;
        const style = strokeStyles.value[index];

        if (style.color === drawStyle.value.color) {
            showStrokeStyleMenu.value = !showStrokeStyleMenu.value;
            return;
        }

        drawStyle.value = normalizeDrawStyle(style);
        selectedStrokeIndex.value = index;
        storeSet('selectedStrokeIndex', index);
    }


    // Text mode variables
    const DEFAULT_TEXT_COLOR = '#000000';
    const TEXT_RENDER_OVERFLOW_ALLOWANCE_FACTOR = 0.2;
    const TEXT_EDITOR_DRAG_THRESHOLD = 6;
    const ADVANCED_EDITOR_EXTRA_HEIGHT = 120;
    const SIMPLE_TEXT_STROKE_MIN_WIDTH = 260;
    const isTextInputMode = ref(false);
    const textPosition = ref(null);
    const textCanvasIndex = ref(-1);
    const fontSize = ref(16);
    const textboxPosition = ref(null); // Screen position for the textbox
    const textEditorHtml = ref('');
    const textEditorBounds = ref(null); // Canvas coordinates
    const textStrokeTargetBounds = ref(null);
    const textEditorPosition = ref(null)
    const textEditorSimpleMode = ref(true);
    const textEditorChromeHeight = ref(ADVANCED_EDITOR_EXTRA_HEIGHT);
    const textEditorToolbarHeight = ref(72);
    const textEditorFooterHeight = ref(Math.max(0, ADVANCED_EDITOR_EXTRA_HEIGHT - 72));
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
    const isCaptureSelectionMode = ref(false);
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

    const handleCaptureSelectionRectangle = (e) => {
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
            ctx.strokeStyle = BOUNDING_BOX_HANDLE_COLOR;
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
        if (isCaptureSelectionMode.value) {
            captureSelection();
        } else if (isSelectModeActive.value) {
            selectStrokesInSelectionBox();
        } else if (isTextInputMode.value) {
            const page = activePage.value;
            const canvas = page?.drawingCanvas || null;
            if (canvas && selectionStart.value && selectionEnd.value) {
                const rect = canvas.getBoundingClientRect();
                const scaleX = canvas.width / rect.width;
                const scaleY = canvas.height / rect.height;

                const dragWidthCss = Math.abs(selectionEnd.value.x - selectionStart.value.x);
                const dragHeightCss = Math.abs(selectionEnd.value.y - selectionStart.value.y);
                const isDragSelection = dragWidthCss >= TEXT_EDITOR_DRAG_THRESHOLD || dragHeightCss >= TEXT_EDITOR_DRAG_THRESHOLD;

                if (!isDragSelection) {
                    const pt = getCanvasPointFromEvent(canvas, e);
                    if (pt) {
                        const { x, y } = pt;
                        const preferredSize = getPreferredTextEditorSize();
                        const width = Math.min(preferredSize.width, canvas.width);
                        const height = Math.min(preferredSize.height, canvas.height);
                        const clampedX = Math.max(0, Math.min(x, Math.max(0, canvas.width - width)));
                        const clampedY = Math.max(0, Math.min(y, Math.max(0, canvas.height - height)));

                        textEditorSimpleMode.value = true;
                        textPosition.value = { x, y };
                        textCanvasIndex.value = activePage.value.index;

                        openTextEditor({
                            bounds: { x: clampedX, y: clampedY + 24, width, height },
                            content: '',
                            strokeRef: null
                        });

                        redrawAllStrokes();
                    }
                } else {
                    textEditorSimpleMode.value = false;

                    const sx = Math.min(selectionStart.value.x, selectionEnd.value.x) * scaleX;
                    const sy = Math.min(selectionStart.value.y, selectionEnd.value.y) * scaleY;
                    const ex = Math.max(selectionStart.value.x, selectionEnd.value.x) * scaleX;
                    const ey = Math.max(selectionStart.value.y, selectionEnd.value.y) * scaleY;

                    const width = Math.max(24, ex - sx);
                    const selectedHeight = Math.max(24, ey - sy);
                    const toolbarHeight = getAdvancedEditorToolbarHeight();
                    const editorY = Math.max(0, sy - toolbarHeight);
                    const rawHeight = selectedHeight + getAdvancedEditorChromeHeight();
                    const maxAvailableHeight = Math.max(24, canvas.height - editorY);
                    const height = Math.min(rawHeight, maxAvailableHeight);

                    textPosition.value = { x: sx, y: sy };
                    textCanvasIndex.value = activePage.value.index;

                    openTextEditor({
                        bounds: { x: sx, y: editorY, width, height },
                        content: '',
                        strokeRef: null
                    });

                    redrawAllStrokes();
                }
            }
        }

        isSelecting.value = false;
        selectionStart.value = null;
        selectionEnd.value = null;
        isCaptureSelectionMode.value = false;
        stopEvent(e);
        isMouseDown.value = false;
    }

    // Stroke selection and dragging
    const selectedStrokes = ref([]); // For multi-selection
    const selectedStroke = ref(null); // { pageIndex, strokeIndex, stroke }
    const strokeMenu = ref(null);
    const strokeMenuPosition = ref({ x: 0, y: 0 });
    const isDragging = ref(false);
    const dragStartPos = ref(null);
    const showStrokeMenu = ref(false);
    const isResizing = ref(false);
    const resizeHandle = ref(null); // 'nw', 'ne', 'sw', 'se', 'n', 's', 'e', 'w'
    const resizeStartBounds = ref(null);
    const isRotating = ref(false);
    const rotateStartCenter = ref(null);
    const rotateStartAngle = ref(0); // angle of rotate-handle vector at rotation start
    const rotatePointerAngleOffset = ref(0); // pointer angle relative to rotate-handle angle at drag start
    const suppressNextSelectionClick = ref(false);

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

        const toCursorFromAngle = (angleRad) => {
            if (!Number.isFinite(angleRad)) return null;
            const deg = ((angleRad * 180 / Math.PI) % 180 + 180) % 180;
            if (deg < 22.5 || deg >= 157.5) return 'ew-resize';
            if (deg < 67.5) return 'nwse-resize';
            if (deg < 112.5) return 'ns-resize';
            if (deg < 157.5) return 'nesw-resize';
            return 'ew-resize';
        };

        const toExactResizeCursor = (angleRad) => {
            if (!Number.isFinite(angleRad)) return null;
            const fallback = toCursorFromAngle(angleRad) || 'ew-resize';
            const deg = angleRad * (180 / Math.PI);
            const svg = encodeURIComponent(
                `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
                    <g transform="rotate(${deg} 12 12)">
                        <line x1="5" y1="12" x2="19" y2="12" stroke="#2a7fff" stroke-width="2" stroke-linecap="round"/>
                        <path d="M5 12 L9 9 M5 12 L9 15" stroke="#2a7fff" stroke-width="2" stroke-linecap="round" fill="none"/>
                        <path d="M19 12 L15 9 M19 12 L15 15" stroke="#2a7fff" stroke-width="2" stroke-linecap="round" fill="none"/>
                    </g>
                </svg>`
            );
            return `url("data:image/svg+xml;utf8,${svg}") 12 12, ${fallback}`;
        };

        const defaultAngleByHandle = {
            n: Math.PI / 2,
            s: Math.PI / 2,
            e: 0,
            w: 0,
            nw: Math.PI / 4,
            se: Math.PI / 4,
            ne: (3 * Math.PI) / 4,
            sw: (3 * Math.PI) / 4
        };

        const selected = selectedStroke.value?.stroke;
        const geometry = selected ? getRotatedSelectionGeometry(selected, SELECTION_PADDING) : null;
        const handles = geometry?.handles;

        if (handles) {
            let from = null;
            let to = null;

            if (handle === 'n' || handle === 's') {
                from = handles.n;
                to = handles.s;
            } else if (handle === 'e' || handle === 'w') {
                from = handles.w;
                to = handles.e;
            } else if (handle === 'nw' || handle === 'se') {
                from = handles.nw;
                to = handles.se;
            } else if (handle === 'ne' || handle === 'sw') {
                from = handles.ne;
                to = handles.sw;
            }

            if (from && to) {
                const angle = Math.atan2(to.y - from.y, to.x - from.x);
                const orientedCursor = toExactResizeCursor(angle);
                if (orientedCursor) return orientedCursor;
            }
        }

        const fallbackAngle = defaultAngleByHandle[handle];
        if (fallbackAngle !== undefined) {
            return toExactResizeCursor(fallbackAngle);
        }
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
        if (!isSelectModeActive.value) return;
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
                addToHistory({ id: newId, type: 'add', page: page, stroke: newStroke });
                const strokeIndex = page.strokes.length - 1;
                newSelections.push({ pageIndex: page.index, pageId: page.id, strokeIndex, stroke: newStroke });
            });

            selectedStrokes.value = newSelections;
            const last = newSelections[newSelections.length - 1];
            selectedStroke.value = last ? { ...last, originalStroke: JSON.parse(JSON.stringify(last.stroke)) } : null;
            redrawAllStrokes();
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
        addToHistory({
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

        redrawAllStrokes();
    };


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
        const style = stroke && !Array.isArray(stroke) ? stroke : {};
        const shouldFill = Boolean(style.fill) && (type === 'rectangle' || type === 'circle');
        if (shouldFill) {
            ctx.fillStyle = style.color || '#1d4ed8';
        }

        if (type === 'line') {
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.lineTo(endX, endY);
            ctx.stroke();
        } else if (type === 'rectangle') {
            if (shouldFill) {
                ctx.fillRect(startX, startY, endX - startX, endY - startY);
            }
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
            if (shouldFill) {
                ctx.fill();
            }
            ctx.stroke();
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

    const getStoredTextEditorMode = (first) => {
        if (!first) return 'advanced';
        if (first.editorMode === 'simple' || first.editorMode === 'advanced') {
            return first.editorMode;
        }
        return 'advanced';
    };

    const setStoredTextEditorMode = (first, isSimple) => {
        if (!first) return;
        first.editorMode = isSimple ? 'simple' : 'advanced';
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
        const isSimpleMode = getStoredTextEditorMode(first) === 'simple';
        const explicitWidth = Number(first.width);
        const explicitHeight = Number(first.height);
        const rotationWidth = Number(first.rotationBoxWidth);
        const rotationHeight = Number(first.rotationBoxHeight);
        const hasRotation = Math.abs(Number(first.rotation || 0)) > 0.0001;

        if (isSimpleMode && hasRotation) {
            return {
                width: Math.max(
                    24,
                    Number.isFinite(rotationWidth) && rotationWidth > 0
                        ? rotationWidth
                        : (Number.isFinite(explicitWidth) && explicitWidth > 0 ? explicitWidth : fallbackWidth)
                ),
                height: Math.max(
                    24,
                    Number.isFinite(rotationHeight) && rotationHeight > 0
                        ? rotationHeight
                        : (Number.isFinite(explicitHeight) && explicitHeight > 0 ? explicitHeight : fallbackHeight)
                )
            };
        }

        if (isSimpleMode) {
            const singleLineText = String(content.text || '').replace(/\r?\n+/g, ' ').replace(/\s{2,}/g, ' ').trim();
            const measuredWidth = ctx.measureText(singleLineText).width;
            const rightSafety = Math.max(8, Math.round(fontPx * 0.5));
            return {
                width: Math.max(24, measuredWidth + rightSafety),
                height: Math.max(24, fallbackHeight)
            };
        }

        return {
            width: Math.max(24, Number.isFinite(explicitWidth) && explicitWidth > 0 ? explicitWidth : fallbackWidth),
            height: Math.max(24, Number.isFinite(explicitHeight) && explicitHeight > 0 ? explicitHeight : fallbackHeight)
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

    const getAdvancedEditorChromeHeight = () => {
        const measured = Number(textEditorChromeHeight.value);
        if (Number.isFinite(measured) && measured >= 0) {
            return measured;
        }
        return ADVANCED_EDITOR_EXTRA_HEIGHT;
    };

    const getAdvancedEditorToolbarHeight = () => {
        const measured = Number(textEditorToolbarHeight.value);
        if (Number.isFinite(measured) && measured >= 0) {
            return measured;
        }
        return 72;
    };

    const getAdvancedEditorFooterHeight = () => {
        const measured = Number(textEditorFooterHeight.value);
        if (Number.isFinite(measured) && measured >= 0) {
            return measured;
        }
        return Math.max(0, getAdvancedEditorChromeHeight() - getAdvancedEditorToolbarHeight());
    };

    const getAdvancedTextContentBounds = (editorBounds) => {
        const safeBounds = editorBounds || { x: 0, y: 0, width: 24, height: 24 };
        const toolbarHeight = getAdvancedEditorToolbarHeight();
        const footerHeight = getAdvancedEditorFooterHeight();
        const totalChrome = toolbarHeight + footerHeight;
        const chromeHeight = Math.min(
            totalChrome,
            Math.max(0, Number(safeBounds.height || 0) - 24)
        );
        const appliedToolbar = Math.min(toolbarHeight, chromeHeight);

        return {
            x: safeBounds.x,
            y: safeBounds.y + appliedToolbar,
            width: Math.max(24, Number(safeBounds.width) || 24),
            height: Math.max(24, Number(safeBounds.height || 24) - chromeHeight)
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

    const updateTextEditorSize = ({ width, height, chromeHeight, toolbarHeight, footerHeight }) => {
        if (!textEditorPosition.value || !textEditorBounds.value) return;
        const minSize = getTextEditorMinSize();

        if (Number.isFinite(Number(toolbarHeight))) {
            textEditorToolbarHeight.value = Math.max(0, Number(toolbarHeight));
        }

        if (Number.isFinite(Number(footerHeight))) {
            textEditorFooterHeight.value = Math.max(0, Number(footerHeight));
        }

        if (Number.isFinite(Number(chromeHeight))) {
            textEditorChromeHeight.value = Math.max(0, Number(chromeHeight));
        } else {
            textEditorChromeHeight.value = Math.max(0, textEditorToolbarHeight.value + textEditorFooterHeight.value);
        }

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

    const openTextEditor = ({ bounds, content = '', strokeRef = null, targetBounds = null }) => {
        if (!bounds) return;
        const preferredSize = getPreferredTextEditorSize();
        const normalizedBounds = {
            ...bounds,
            width: Math.max(24, Number(bounds.width) || preferredSize.width),
            height: Math.max(24, Number(bounds.height) || preferredSize.height)
        };
        textEditorBounds.value = normalizedBounds;

        if (targetBounds) {
            textStrokeTargetBounds.value = targetBounds;
        } else if (!textEditorSimpleMode.value) {
            textStrokeTargetBounds.value = getAdvancedTextContentBounds(normalizedBounds);
        } else {
            textStrokeTargetBounds.value = null;
        }

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
        const singleLineText = normalizedContent.text.replace(/\r?\n+/g, ' ').replace(/\s{2,}/g, ' ').trim();
        const simpleModeContent = {
            text: singleLineText,
            html: singleLineText ? convertPlainTextToHtml(singleLineText) : ''
        };
        const contentToCommit = textEditorSimpleMode.value ? simpleModeContent : normalizedContent;

        if (!bounds || !contentToCommit.text.trim()) {
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

                stroke[0].content = contentToCommit;
                stroke[0].text = contentToCommit.text;
                stroke[0].fontSize = stroke[0].fontSize || fontSize.value * scale;
                const existingBaseFont = Number(stroke[0].baseFontSize);
                stroke[0].baseFontSize = (Number.isFinite(existingBaseFont) && existingBaseFont > 0)
                    ? existingBaseFont
                    : Math.max(8, Number(stroke[0].fontSize) || 16);
                setStoredTextEditorMode(stroke[0], textEditorSimpleMode.value);
                stroke[0].editorWidth = editorBounds.width;
                stroke[0].editorHeight = editorBounds.height;

                const fittedBounds = textEditorSimpleMode.value
                    ? getFittedTextStrokeBounds({
                        content: contentToCommit,
                        color: stroke[0].color,
                        fontSize: stroke[0].fontSize,
                        bounds: editorBounds
                    })
                    : getAdvancedTextContentBounds(editorBounds);

                if (!textEditorSimpleMode.value && textStrokeTargetBounds.value) {
                    fittedBounds.width = textStrokeTargetBounds.value.width;
                    fittedBounds.height = textStrokeTargetBounds.value.height;
                }

                if (textEditorSimpleMode.value) {
                    fittedBounds.width = Math.max(SIMPLE_TEXT_STROKE_MIN_WIDTH, fittedBounds.width + 24);
                }

                stroke[0].x = fittedBounds.x;
                stroke[0].y = fittedBounds.y;
                stroke[0].width = fittedBounds.width;
                stroke[0].height = fittedBounds.height;
                if (getStoredTextEditorMode(stroke[0]) === 'simple') {
                    stroke[0].rotationBoxWidth = stroke[0].width;
                    stroke[0].rotationBoxHeight = stroke[0].height;
                }

                addToHistory({
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
            const color = textEditorSimpleMode.value ? drawStyle.value.color : DEFAULT_TEXT_COLOR;

            const fittedBounds = textEditorSimpleMode.value
                ? getFittedTextStrokeBounds({
                    content: contentToCommit,
                    color,
                    fontSize: initialFontSize,
                    bounds: editorBounds
                })
                : getAdvancedTextContentBounds(editorBounds);

            if (!textEditorSimpleMode.value && textStrokeTargetBounds.value) {
                fittedBounds.width = textStrokeTargetBounds.value.width;
                fittedBounds.height = textStrokeTargetBounds.value.height;
            }

            const textStroke = [{
                id,
                x: fittedBounds.x,
                y: fittedBounds.y,
                width: fittedBounds.width,
                height: fittedBounds.height,
                editorWidth: editorBounds.width,
                editorHeight: editorBounds.height,
                color,
                thickness: getScaledDrawingThickness(),
                type: 'text',
                content: contentToCommit,
                text: contentToCommit.text,
                fontSize: initialFontSize,
                baseFontSize: initialFontSize,
                editorMode: textEditorSimpleMode.value ? 'simple' : 'advanced'
            }];

            if (textEditorSimpleMode.value && textStroke[0]) {
                textStroke[0].width = Math.max(SIMPLE_TEXT_STROKE_MIN_WIDTH, textStroke[0].width + 24);
                textStroke[0].rotationBoxWidth = textStroke[0].width;
                textStroke[0].rotationBoxHeight = textStroke[0].height;
            }

            activePage.value.strokes.push(textStroke);
            addToHistory({
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
            const center = getStrokeRotationCenter(stroke);
            if (center) {
                const cx = center.x;
                const cy = center.y;
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
        for (let i = 0; i < stroke.length - 1; i++) {
            const p1 = stroke[i];
            const p2 = stroke[i + 1];
            const segDX = p2.x - p1.x;
            const segDY = p2.y - p1.y;
            const segLenSq = segDX * segDX + segDY * segDY;
            if (segLenSq === 0) continue;
            const t = Math.max(0, Math.min(1, ((testX - p1.x) * segDX + (testY - p1.y) * segDY) / segLenSq));
            const projX = p1.x + t * segDX;
            const projY = p1.y + t * segDY;
            const distance = Math.sqrt((testX - projX) ** 2 + (testY - projY) ** 2);
            const dynamicThreshold = Math.max(threshold, Number(p1.thickness || 2) * 1.5);
            if (distance <= dynamicThreshold) {
                return true;
            }
        }

        // Check pen points as a fallback
        for (let point of stroke) {
            const distance = Math.sqrt((point.x - testX) ** 2 + (point.y - testY) ** 2);
            if (distance < threshold) {
                return true;
            }
        }
        
        return false;
    };

    const pickStrokeAtPoint = (x, y) => {
        const page = activePage.value;
        const strokes = page.strokes || [];

        const svgLayer = page?.annotationSvg || null;
        if (svgLayer && typeof svgLayer.createSVGPoint === 'function') {
            const svgPoint = svgLayer.createSVGPoint();
            svgPoint.x = x;
            svgPoint.y = y;

            const pickable = Array.from(svgLayer.querySelectorAll('[data-stroke-index]'));
            for (let i = pickable.length - 1; i >= 0; i--) {
                const el = pickable[i];
                try {
                    if (!(el instanceof SVGGeometryElement)) continue;

                    let hit = false;
                    const fill = (el.getAttribute('fill') || '').toLowerCase();
                    if (fill && fill !== 'none' && typeof el.isPointInFill === 'function') {
                        hit = el.isPointInFill(svgPoint);
                    }

                    if (!hit && typeof el.isPointInStroke === 'function') {
                        hit = el.isPointInStroke(svgPoint);
                        if (!hit) {
                            const prevStrokeWidth = el.getAttribute('stroke-width');
                            const currentStrokeWidth = Math.max(1, Number(prevStrokeWidth || 1));
                            el.setAttribute('stroke-width', String(currentStrokeWidth + 10));
                            hit = el.isPointInStroke(svgPoint);
                            if (prevStrokeWidth === null) {
                                el.removeAttribute('stroke-width');
                            } else {
                                el.setAttribute('stroke-width', prevStrokeWidth);
                            }
                        }
                    }

                    if (hit) {
                        const pickedIndex = Number(el.getAttribute('data-stroke-index'));
                        if (Number.isInteger(pickedIndex) && pickedIndex >= 0 && strokes[pickedIndex]) {
                            return { pageId: page.id, pageIndex: page.index, strokeIndex: pickedIndex, stroke: strokes[pickedIndex] };
                        }
                    }
                } catch (err) {
                    // continue with fallback hit-testing
                }
            }
        }
        
        // Search in reverse order to prioritize top strokes
        for (let i = strokes.length - 1; i >= 0; i--) {
            if (isPointNearStroke(x, y, strokes[i])) {
                return { pageId: page.id, pageIndex: page.index, strokeIndex: i, stroke: strokes[i] };
            }
        }

        return null;
    };

    const findStrokeAtPoint = (x, y) => {
        const found = pickStrokeAtPoint(x, y);
        if (found) {
            return found;
        }

        selectedStroke.value = null;
        redrawAllStrokes();
        return null;
    };

    const isAnyStrokeAtPoint = (x, y, canvasIndex) => {
        return !!pickStrokeAtPoint(x, y);
    };

    const SELECTION_PADDING = 10;

    const getBoundsFromPoints = (points = [], padding = 0) => {
        if (!Array.isArray(points) || points.length === 0) return null;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        points.forEach(point => {
            minX = Math.min(minX, point.x);
            minY = Math.min(minY, point.y);
            maxX = Math.max(maxX, point.x);
            maxY = Math.max(maxY, point.y);
        });
        const pad = Math.max(0, Number(padding) || 0);
        return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
    };

    const getShapeControlPoints = (first) => {
        if (!first) return null;
        if (first.type === 'line') {
            return [{ x: first.startX, y: first.startY }, { x: first.endX, y: first.endY }];
        }

        if (first.type === 'rectangle') {
            return [
                { x: first.startX, y: first.startY },
                { x: first.endX, y: first.startY },
                { x: first.endX, y: first.endY },
                { x: first.startX, y: first.endY }
            ];
        }

        if (first.type === 'circle') {
            let rx;
            let ry;
            if (first.radiusX !== undefined || first.radiusY !== undefined) {
                rx = first.radiusX !== undefined ? first.radiusX : Math.abs(first.endX - first.startX);
                ry = first.radiusY !== undefined ? first.radiusY : Math.abs(first.endY - first.startY);
            } else {
                const radius = Math.sqrt((first.endX - first.startX) ** 2 + (first.endY - first.startY) ** 2);
                rx = radius;
                ry = radius;
            }
            return [
                { x: first.startX - rx, y: first.startY - ry },
                { x: first.startX + rx, y: first.startY - ry },
                { x: first.startX + rx, y: first.startY + ry },
                { x: first.startX - rx, y: first.startY + ry }
            ];
        }

        return null;
    };

    const getHighlightRectsBounds = (first, padding = 0) => {
        if (!first) return null;
        const rects = first.rects || [{ x: first.x, y: first.y, width: first.width, height: first.height }];
        const points = [];
        rects.forEach(rect => {
            points.push({ x: rect.x, y: rect.y });
            points.push({ x: rect.x + rect.width, y: rect.y + rect.height });
        });
        return getBoundsFromPoints(points, padding);
    };

    const getStrokeBounds = (stroke, padding = 5) => {
        if (!stroke || stroke.length === 0) return null;
        
        const first = stroke[0];
        const pad = Math.max(0, padding);
        
        if (first.type === 'image') {
            const angle = first.rotation || 0;
            const center = getStrokeRotationCenter(stroke) || { x: first.x + first.width / 2, y: first.y + first.height / 2 };
            const cx = center.x;
            const cy = center.y;
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
            return getHighlightRectsBounds(first, pad);
        } else if (first.type === 'text') {
            const textBox = getTextBoxSize(stroke);
            if (!textBox) return null;
            const angle = first.rotation || 0;
            const center = getStrokeRotationCenter(stroke) || { x: first.x + textBox.width / 2, y: first.y + textBox.height / 2 };
            const cx = center.x;
            const cy = center.y;
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
            const points = getShapeControlPoints(first) || [];
            // Center by unrotated bounds
            const unrotated = getBoundsFromPoints(points, 0);
            if (!unrotated) return null;
            const center = getStrokeRotationCenter(stroke) || {
                x: (unrotated.minX + unrotated.maxX) / 2,
                y: (unrotated.minY + unrotated.maxY) / 2
            };
            const cx = center.x;
            const cy = center.y;
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
        } else {
            const rawBounds = getBoundsFromPoints(stroke, 0);
            if (!rawBounds) return null;
            const minX = rawBounds.minX;
            const minY = rawBounds.minY;
            const maxX = rawBounds.maxX;
            const maxY = rawBounds.maxY;

            const angle = first.rotation || 0;
            if (!angle) {
                return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
            }

            const center = getStrokeRotationCenter(stroke) || { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
            const cx = center.x;
            const cy = center.y;
            const corners = [
                { x: minX, y: minY },
                { x: maxX, y: minY },
                { x: maxX, y: maxY },
                { x: minX, y: maxY }
            ];
            let rMinX = Infinity, rMinY = Infinity, rMaxX = -Infinity, rMaxY = -Infinity;
            const cosA = Math.cos(angle);
            const sinA = Math.sin(angle);
            corners.forEach(point => {
                const dx = point.x - cx;
                const dy = point.y - cy;
                const rx = cx + dx * cosA - dy * sinA;
                const ry = cy + dx * sinA + dy * cosA;
                rMinX = Math.min(rMinX, rx);
                rMinY = Math.min(rMinY, ry);
                rMaxX = Math.max(rMaxX, rx);
                rMaxY = Math.max(rMaxY, ry);
            });

            return { minX: rMinX - pad, minY: rMinY - pad, maxX: rMaxX + pad, maxY: rMaxY + pad };
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
            return getHighlightRectsBounds(first, pad);
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
            const points = getShapeControlPoints(first);
            return getBoundsFromPoints(points, pad);
        } else {
            return getBoundsFromPoints(stroke, pad);
        }
    };

    const getStrokeRotationCenter = (stroke) => {
        if (!stroke || stroke.length === 0) return null;
        const first = stroke[0] || {};
        if (Number.isFinite(first.rotationCenterX) && Number.isFinite(first.rotationCenterY)) {
            return { x: first.rotationCenterX, y: first.rotationCenterY };
        }
        const b = getUnrotatedBounds(stroke, 0);
        if (!b) return null;
        return {
            x: (b.minX + b.maxX) / 2,
            y: (b.minY + b.maxY) / 2
        };
    };

    const getRotatedSelectionGeometry = (stroke, padding = 0) => {
        if (!stroke || stroke.length === 0) return null;
        const first = stroke[0] || {};
        const angle = Number(first.rotation || 0);
        if (Math.abs(angle) < 0.0001) return null;

        const localBounds = getUnrotatedBounds(stroke, Math.max(0, Number(padding) || 0));
        const center = getStrokeRotationCenter(stroke);
        if (!localBounds || !center) return null;

        const toWorld = (point) => rotatePointAround(point, center, angle);
        const nw = toWorld({ x: localBounds.minX, y: localBounds.minY });
        const ne = toWorld({ x: localBounds.maxX, y: localBounds.minY });
        const se = toWorld({ x: localBounds.maxX, y: localBounds.maxY });
        const sw = toWorld({ x: localBounds.minX, y: localBounds.maxY });

        const handles = {
            nw,
            ne,
            sw,
            se,
            n: toWorld({ x: (localBounds.minX + localBounds.maxX) / 2, y: localBounds.minY }),
            s: toWorld({ x: (localBounds.minX + localBounds.maxX) / 2, y: localBounds.maxY }),
            w: toWorld({ x: localBounds.minX, y: (localBounds.minY + localBounds.maxY) / 2 }),
            e: toWorld({ x: localBounds.maxX, y: (localBounds.minY + localBounds.maxY) / 2 })
        };

        return {
            angle,
            center,
            localBounds,
            corners: [nw, ne, se, sw],
            handles
        };
    };

    const getRotateHandlePosition = ({ rotatedSelection = null, bounds = null, offset = 24 } = {}) => {
        const safeOffset = Math.max(8, Number(offset) || 24);

        if (rotatedSelection?.handles?.n && rotatedSelection?.center) {
            const anchor = rotatedSelection.handles.n;
            const center = rotatedSelection.center;
            let vx = anchor.x - center.x;
            let vy = anchor.y - center.y;
            const len = Math.hypot(vx, vy);
            if (len < 0.0001) {
                vx = 0;
                vy = -1;
            } else {
                vx /= len;
                vy /= len;
            }
            return {
                x: anchor.x + vx * safeOffset,
                y: anchor.y + vy * safeOffset,
                anchorX: anchor.x,
                anchorY: anchor.y
            };
        }

        if (!bounds) return null;

        const anchorX = (bounds.minX + bounds.maxX) / 2;
        const anchorY = bounds.minY;
        return {
            x: anchorX,
            y: anchorY - safeOffset,
            anchorX,
            anchorY
        };
    };

    const pointInPolygon = (x, y, polygonPoints = []) => {
        if (!Array.isArray(polygonPoints) || polygonPoints.length < 3) return false;
        let inside = false;
        for (let i = 0, j = polygonPoints.length - 1; i < polygonPoints.length; j = i++) {
            const xi = polygonPoints[i].x, yi = polygonPoints[i].y;
            const xj = polygonPoints[j].x, yj = polygonPoints[j].y;
            const intersects = ((yi > y) !== (yj > y))
                && (x < ((xj - xi) * (y - yi)) / ((yj - yi) || Number.EPSILON) + xi);
            if (intersects) inside = !inside;
        }
        return inside;
    };

    const pointSegmentDistance = (x, y, x1, y1, x2, y2) => {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const lenSq = dx * dx + dy * dy;
        if (lenSq === 0) {
            return Math.hypot(x - x1, y - y1);
        }
        const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / lenSq));
        const px = x1 + t * dx;
        const py = y1 + t * dy;
        return Math.hypot(x - px, y - py);
    };

    const isPointInsideOrNearRotatedSelection = (x, y, geometry, edgeThreshold = 6) => {
        if (!geometry?.corners || geometry.corners.length !== 4) return false;
        if (pointInPolygon(x, y, geometry.corners)) return true;

        const c = geometry.corners;
        for (let i = 0; i < c.length; i++) {
            const a = c[i];
            const b = c[(i + 1) % c.length];
            if (pointSegmentDistance(x, y, a.x, a.y, b.x, b.y) <= edgeThreshold) {
                return true;
            }
        }
        return false;
    };

    const getResizeHandle = (x, y, bounds, stroke, padding = 8) => {
        const first = stroke?.[0] || null;
        if (first?.type === 'highlight-rect') return null;
        const rotationAvailable = first && first.type !== 'highlight-rect';
        const rotatedSelection = getRotatedSelectionGeometry(stroke, padding);
        if (rotatedSelection?.handles) {
            if (rotationAvailable) {
                const rotateHandle = getRotateHandlePosition({ rotatedSelection, offset: 24 });
                if (rotateHandle && Math.hypot(x - rotateHandle.x, y - rotateHandle.y) <= 10) {
                    return 'rotate';
                }
            }

            const threshold = 8;
            const order = ['nw', 'ne', 'sw', 'se', 'n', 's', 'w', 'e'];
            for (const handleName of order) {
                const handlePoint = rotatedSelection.handles[handleName];
                if (!handlePoint) continue;
                if (Math.abs(x - handlePoint.x) <= threshold && Math.abs(y - handlePoint.y) <= threshold) {
                    return handleName;
                }
            }
            return null;
        }

        const localBounds = bounds;
        if (!localBounds) return null;

        if (rotationAvailable) {
            const rotateHandle = getRotateHandlePosition({ bounds: localBounds, offset: 24 });
            if (rotateHandle && Math.hypot(x - rotateHandle.x, y - rotateHandle.y) <= 10) {
                return 'rotate';
            }
        }

        const handleSize = 8;
        const threshold = handleSize;
        const handles = [
            { x: localBounds.minX, y: localBounds.minY, handle: 'nw' },
            { x: localBounds.maxX, y: localBounds.minY, handle: 'ne' },
            { x: localBounds.minX, y: localBounds.maxY, handle: 'sw' },
            { x: localBounds.maxX, y: localBounds.maxY, handle: 'se' },
            { x: (localBounds.minX + localBounds.maxX) / 2, y: localBounds.minY, handle: 'n' },
            { x: (localBounds.minX + localBounds.maxX) / 2, y: localBounds.maxY, handle: 's' },
            { x: localBounds.minX, y: (localBounds.minY + localBounds.maxY) / 2, handle: 'w' },
            { x: localBounds.maxX, y: (localBounds.minY + localBounds.maxY) / 2, handle: 'e' }
        ];

        for (let h of handles) {
            if (Math.abs(x - h.x) <= threshold && Math.abs(y - h.y) <= threshold) {
                return h.handle;
            }
        }

        return null;
    };

    const mapValueBetweenBounds = (value, fromMin, fromMax, toMin, toMax) => {
        const span = fromMax - fromMin;
        if (Math.abs(span) < 0.0001) return (toMin + toMax) / 2;
        const t = (value - fromMin) / span;
        return toMin + t * (toMax - toMin);
    };

    const transformStrokeFromOriginalBounds = (liveStroke, originalStroke, fromBounds, toBounds) => {
        if (!liveStroke?.length || !originalStroke?.length || !fromBounds || !toBounds) return;

        const first = liveStroke[0];
        const origFirst = originalStroke[0];

        const mapPoint = (point) => ({
            x: mapValueBetweenBounds(point.x, fromBounds.minX, fromBounds.maxX, toBounds.minX, toBounds.maxX),
            y: mapValueBetweenBounds(point.y, fromBounds.minY, fromBounds.maxY, toBounds.minY, toBounds.maxY)
        });

        if (origFirst.type === 'image' || origFirst.type === 'text') {
            const topLeft = mapPoint({ x: origFirst.x, y: origFirst.y });
            const bottomRight = mapPoint({ x: origFirst.x + origFirst.width, y: origFirst.y + origFirst.height });
            first.x = Math.min(topLeft.x, bottomRight.x);
            first.y = Math.min(topLeft.y, bottomRight.y);
            first.width = Math.max(1, Math.abs(bottomRight.x - topLeft.x));
            first.height = Math.max(1, Math.abs(bottomRight.y - topLeft.y));
            if (origFirst.type === 'text') {
                const scaleX = Math.abs((toBounds.maxX - toBounds.minX) / Math.max(1, fromBounds.maxX - fromBounds.minX));
                const scaleY = Math.abs((toBounds.maxY - toBounds.minY) / Math.max(1, fromBounds.maxY - fromBounds.minY));
                const fontScale = Math.max(0.25, Math.sqrt(scaleX * scaleY));
                const baseFontSize = Math.max(8, Number(origFirst.baseFontSize) || Number(origFirst.fontSize) || 16);
                first.baseFontSize = baseFontSize;
                first.fontSize = Math.max(8, Math.round((Number(origFirst.fontSize) || 16) * fontScale));
                first.editorWidth = first.width;
                first.editorHeight = first.height;
            }
            return;
        }

        if (origFirst.type === 'highlight-rect') {
            const origRects = origFirst.rects || [{ x: origFirst.x, y: origFirst.y, width: origFirst.width, height: origFirst.height }];
            first.rects = origRects.map(rect => {
                const p1 = mapPoint({ x: rect.x, y: rect.y });
                const p2 = mapPoint({ x: rect.x + rect.width, y: rect.y + rect.height });
                return {
                    x: Math.min(p1.x, p2.x),
                    y: Math.min(p1.y, p2.y),
                    width: Math.max(1, Math.abs(p2.x - p1.x)),
                    height: Math.max(1, Math.abs(p2.y - p1.y))
                };
            });
            if (first.rects[0]) {
                first.x = first.rects[0].x;
                first.y = first.rects[0].y;
                first.width = first.rects[0].width;
                first.height = first.rects[0].height;
            }
            return;
        }

        if (origFirst.type === 'line' || origFirst.type === 'rectangle') {
            const start = mapPoint({ x: origFirst.startX, y: origFirst.startY });
            const end = mapPoint({ x: origFirst.endX, y: origFirst.endY });
            first.startX = start.x;
            first.startY = start.y;
            first.endX = end.x;
            first.endY = end.y;
            first.x = first.startX;
            first.y = first.startY;
            return;
        }

        if (origFirst.type === 'circle') {
            const center = mapPoint({ x: origFirst.startX, y: origFirst.startY });
            first.startX = center.x;
            first.startY = center.y;

            const end = mapPoint({ x: origFirst.endX, y: origFirst.endY });
            first.endX = end.x;
            first.endY = end.y;

            if (origFirst.radiusX !== undefined || origFirst.radiusY !== undefined) {
                const scaleX = Math.abs((toBounds.maxX - toBounds.minX) / Math.max(1, fromBounds.maxX - fromBounds.minX));
                const scaleY = Math.abs((toBounds.maxY - toBounds.minY) / Math.max(1, fromBounds.maxY - fromBounds.minY));
                const rx = origFirst.radiusX !== undefined ? origFirst.radiusX : Math.abs(origFirst.endX - origFirst.startX);
                const ry = origFirst.radiusY !== undefined ? origFirst.radiusY : Math.abs(origFirst.endY - origFirst.startY);
                first.radiusX = Math.max(1, rx * scaleX);
                first.radiusY = Math.max(1, ry * scaleY);
            }

            first.x = first.startX;
            first.y = first.startY;
            return;
        }

        for (let i = 0; i < liveStroke.length; i++) {
            const origPoint = originalStroke[i];
            if (!origPoint) continue;
            const point = mapPoint({ x: origPoint.x, y: origPoint.y });
            liveStroke[i].x = point.x;
            liveStroke[i].y = point.y;
        }
    };

    const rotatePointAround = (point, center, angle) => {
        const dx = point.x - center.x;
        const dy = point.y - center.y;
        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle);
        return {
            x: center.x + dx * cosA - dy * sinA,
            y: center.y + dx * sinA + dy * cosA
        };
    };

    const translateStrokeBy = (stroke, dx, dy) => {
        if (!Array.isArray(stroke) || stroke.length === 0) return;
        const first = stroke[0] || {};

        if (first.type === 'image' || first.type === 'text') {
            first.x += dx;
            first.y += dy;
        } else if (first.type === 'highlight-rect') {
            const rects = first.rects || [{ x: first.x, y: first.y, width: first.width, height: first.height }];
            rects.forEach(rect => {
                rect.x += dx;
                rect.y += dy;
            });
            first.rects = rects;
            if (rects[0]) {
                first.x = rects[0].x;
                first.y = rects[0].y;
                first.width = rects[0].width;
                first.height = rects[0].height;
            }
        } else if (first.type === 'line' || first.type === 'rectangle') {
            first.startX += dx;
            first.startY += dy;
            first.endX += dx;
            first.endY += dy;
            first.x = first.startX;
            first.y = first.startY;
        } else if (first.type === 'circle') {
            first.startX += dx;
            first.startY += dy;
            first.endX += dx;
            first.endY += dy;
            first.x = first.startX;
            first.y = first.startY;
        } else {
            stroke.forEach(point => {
                point.x += dx;
                point.y += dy;
            });
        }

        if (Number.isFinite(first.rotationCenterX) && Number.isFinite(first.rotationCenterY)) {
            first.rotationCenterX += dx;
            first.rotationCenterY += dy;
        }
    };

    const selectStrokesInSelectionBox = () => {
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
        } else {
            selectedStroke.value = null;
        }

        redrawAllStrokes();
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
            textEditorPosition.value = null;

            const page = activePage.value;
            const canvasIndex = page.index;
            if (canvasIndex === -1) return;

            const canvas = page.drawingCanvas || null;
            const pt = getCanvasPointFromEvent(canvas, e);
            if (!pt) return;
            const { x, y } = pt;

            // Handle drag mode
            // Check if clicking on a resize handle of already selected stroke
            // Disable resizing when multiple selection is active
            if (selectedStrokes.value.length <= 1 && selectedStroke.value && selectedStroke.value.pageId === page.id) {
                    const handlePadding = SELECTION_PADDING;
                        const bounds = getStrokeBounds(selectedStroke.value.stroke, SELECTION_PADDING);
                        let handle = getResizeHandle(x, y, bounds, selectedStroke.value.stroke, handlePadding);
                
                if (handle) {
                    const firstSel = selectedStroke.value.stroke[0];
                    if (handle === 'rotate' && firstSel.type !== 'highlight-rect') {
                        if (firstSel.type === 'text') {
                            const textBox = getTextBoxSize(selectedStroke.value.stroke);
                            if (textBox) {
                                firstSel.rotationBoxWidth = textBox.width;
                                firstSel.rotationBoxHeight = textBox.height;
                                if (!Number.isFinite(Number(firstSel.width)) || Number(firstSel.width) <= 0) {
                                    firstSel.width = textBox.width;
                                }
                                if (!Number.isFinite(Number(firstSel.height)) || Number(firstSel.height) <= 0) {
                                    firstSel.height = textBox.height;
                                }
                            }
                        }

                        isRotating.value = true;
                        resizeHandle.value = handle;
                        dragStartPos.value = { x, y };
                        const rotateCenter = getStrokeRotationCenter(selectedStroke.value.stroke)
                            || (getStrokeBounds(selectedStroke.value.stroke, 0)
                                ? (() => {
                                    const b = getStrokeBounds(selectedStroke.value.stroke, 0);
                                    return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
                                })()
                                : { x, y });
                        rotateStartCenter.value = rotateCenter;
                        firstSel.rotationCenterX = rotateCenter.x;
                        firstSel.rotationCenterY = rotateCenter.y;

                        const rotateGeometry = getRotatedSelectionGeometry(selectedStroke.value.stroke, SELECTION_PADDING);
                        const rotateHandlePos = getRotateHandlePosition({
                            rotatedSelection: rotateGeometry,
                            bounds: getStrokeBounds(selectedStroke.value.stroke, SELECTION_PADDING),
                            offset: 24
                        });

                        const startRefX = rotateHandlePos?.x ?? x;
                        const startRefY = rotateHandlePos?.y ?? y;
                        const startHandleAngle = Math.atan2(startRefY - rotateStartCenter.value.y, startRefX - rotateStartCenter.value.x);
                        const startPointerAngle = Math.atan2(y - rotateStartCenter.value.y, x - rotateStartCenter.value.x);
                        rotateStartAngle.value = startHandleAngle;
                        rotatePointerAngleOffset.value = startPointerAngle - startHandleAngle;
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
                        const originalStroke = JSON.parse(JSON.stringify(selectedStroke.value.stroke));
                        const rawBounds = getStrokeBounds(originalStroke, 0);
                        const localBounds = getUnrotatedBounds(originalStroke, 0);
                        const resizeCenter = rawBounds
                            ? { x: (rawBounds.minX + rawBounds.maxX) / 2, y: (rawBounds.minY + rawBounds.maxY) / 2 }
                            : { x, y };
                        resizeStartBounds.value = {
                            padded: { ...bounds },
                            raw: rawBounds,
                            local: localBounds,
                            padding: handlePadding,
                            originalStroke,
                            center: resizeCenter,
                            startPointer: { x, y },
                            startDistance: Math.max(1, Math.hypot(x - resizeCenter.x, y - resizeCenter.y))
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
                    const shift = !!e.shiftKey;

                    const newSelection = {
                        pageId: page.id,
                        pageIndex: canvasIndex,
                        strokeIndex: found.strokeIndex,
                        stroke: found.stroke,
                        originalStroke: JSON.parse(JSON.stringify(found.stroke))
                    };

                    if (shift) {
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
                        stopEvent(e);
                        return;
                    }

                    // Non-shift click: if multi-selection is active and clicking a member, keep multi-selection
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
                    stopEvent(e);
                    return;
                }

            // stopEvent(e);
            // return;

            // Start new selection rectangle
            handleSelectionStart(e);

            return;
        }

        // Handle selection mode
        if (isCaptureSelectionMode.value) {
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
            handleSelectionStart(e);
            isMouseDown.value = true;
            currentCanvasIndex = canvasIndex;
            if (canvas && e.pointerId !== undefined) {
                canvas.setPointerCapture(e.pointerId);
            }
            activePointerId.value = e.pointerId;
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
                color: drawStyle.value.color,
                thickness: getScaledDrawingThickness(),
                fill: drawStyle.value.fill,
                opacity: drawStyle.value.opacity,
                dash: drawStyle.value.dash,
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
            if (isRotating.value && selectedStroke.value && resizeHandle.value === 'rotate') {
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
                const currentPointerAngle = Math.atan2(currentY - center.y, currentX - center.x);
                const adjustedPointerAngle = currentPointerAngle - (rotatePointerAngleOffset.value || 0);
                const delta = adjustedPointerAngle - rotateStartAngle.value;
                first.rotation = (origFirst.rotation || 0) + delta;
                first.rotationCenterX = center.x;
                first.rotationCenterY = center.y;
                selectedStroke.value.stroke = stroke;
                redrawAllStrokes();
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
                    const first = stroke[0];
                    const startBounds = resizeStartBounds.value.padded;
                    const startRawBounds = resizeStartBounds.value.raw;
                    const boundsPadding = resizeStartBounds.value.padding ?? 0;
                    if (!startBounds || !startRawBounds) return;

                    const originalStrokeForResize = resizeStartBounds.value.originalStroke || selectedStroke.value.originalStroke;
                    const originalFirstForResize = originalStrokeForResize?.[0];
                    const isRotatedResize = Math.abs(Number(originalFirstForResize?.rotation || 0)) > 0.0001;

                    if (isRotatedResize && startRawBounds) {
                        const angle = Number(originalFirstForResize.rotation || 0);
                        const fixedCenter = resizeStartBounds.value.center || getStrokeRotationCenter(originalStrokeForResize);
                        const startLocalBounds = resizeStartBounds.value.local || getUnrotatedBounds(originalStrokeForResize, 0);
                        const handle = resizeHandle.value;

                        if (!fixedCenter || !startLocalBounds) return;

                        const startPointer = resizeStartBounds.value.startPointer || dragStartPos.value || { x: currentX, y: currentY };
                        const startLocalPointer = rotatePointAround(startPointer, fixedCenter, -angle);
                        const currentLocalPointer = rotatePointAround({ x: currentX, y: currentY }, fixedCenter, -angle);

                        const localDx = currentLocalPointer.x - startLocalPointer.x;
                        const localDy = currentLocalPointer.y - startLocalPointer.y;

                        let newLocalMinX = startLocalBounds.minX;
                        let newLocalMinY = startLocalBounds.minY;
                        let newLocalMaxX = startLocalBounds.maxX;
                        let newLocalMaxY = startLocalBounds.maxY;

                        if (handle.includes('n')) newLocalMinY += localDy;
                        if (handle.includes('s')) newLocalMaxY += localDy;
                        if (handle.includes('w')) newLocalMinX += localDx;
                        if (handle.includes('e')) newLocalMaxX += localDx;

                        const epsilon = 0.5;
                        if (Math.abs(newLocalMaxX - newLocalMinX) < epsilon) {
                            if (handle.includes('w')) newLocalMinX = newLocalMaxX - epsilon;
                            else if (handle.includes('e')) newLocalMaxX = newLocalMinX + epsilon;
                            else newLocalMaxX = newLocalMinX + epsilon;
                        }

                        if (Math.abs(newLocalMaxY - newLocalMinY) < epsilon) {
                            if (handle.includes('n')) newLocalMinY = newLocalMaxY - epsilon;
                            else if (handle.includes('s')) newLocalMaxY = newLocalMinY + epsilon;
                            else newLocalMaxY = newLocalMinY + epsilon;
                        }

                        const targetLocalBounds = {
                            minX: newLocalMinX,
                            minY: newLocalMinY,
                            maxX: newLocalMaxX,
                            maxY: newLocalMaxY
                        };

                        transformStrokeFromOriginalBounds(
                            stroke,
                            originalStrokeForResize,
                            startLocalBounds,
                            targetLocalBounds
                        );

                        const targetCenter = {
                            x: (targetLocalBounds.minX + targetLocalBounds.maxX) / 2,
                            y: (targetLocalBounds.minY + targetLocalBounds.maxY) / 2
                        };

                        first.rotation = angle;
                        first.rotationCenterX = targetCenter.x;
                        first.rotationCenterY = targetCenter.y;

                        const liveGeometry = getRotatedSelectionGeometry(stroke, boundsPadding);
                        const liveHandlePoint = liveGeometry?.handles?.[handle] || null;
                        if (liveHandlePoint) {
                            const lockDx = currentX - liveHandlePoint.x;
                            const lockDy = currentY - liveHandlePoint.y;
                            if (Math.abs(lockDx) > 0.001 || Math.abs(lockDy) > 0.001) {
                                translateStrokeBy(stroke, lockDx, lockDy);
                            }
                        }

                        selectedStroke.value.stroke = stroke;

                        redrawAllStrokes();
                        stopEvent(e);
                        return;
                    }

                    // Resize handles are axis-aligned; keep drag deltas in screen/canvas axes.
                    
                    // Calculate new bounds based on resize handle
                    let newMinX = startBounds.minX;
                    let newMinY = startBounds.minY;
                    let newMaxX = startBounds.maxX;
                    let newMaxY = startBounds.maxY;
                    
                    const handle = resizeHandle.value;
                    const isCornerResize = ['nw', 'ne', 'sw', 'se'].includes(handle);
                    
                    if (isCornerResize) {
                        // Free corner resize (no forced aspect lock)
                        if (handle.includes('n')) newMinY += dy;
                        if (handle.includes('s')) newMaxY += dy;
                        if (handle.includes('w')) newMinX += dx;
                        if (handle.includes('e')) newMaxX += dx;
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

                    // Keep dimensions non-zero while allowing reflection
                    const epsilon = 0.5;
                    let adjustedRawMinX = newRawMinX;
                    let adjustedRawMinY = newRawMinY;
                    let adjustedRawMaxX = newRawMaxX;
                    let adjustedRawMaxY = newRawMaxY;

                    if (Math.abs(adjustedRawMaxX - adjustedRawMinX) < epsilon) {
                        if (handle.includes('w')) adjustedRawMinX = adjustedRawMaxX - epsilon;
                        else if (handle.includes('e')) adjustedRawMaxX = adjustedRawMinX + epsilon;
                        else adjustedRawMaxX = adjustedRawMinX + epsilon;
                    }

                    if (Math.abs(adjustedRawMaxY - adjustedRawMinY) < epsilon) {
                        if (handle.includes('n')) adjustedRawMinY = adjustedRawMaxY - epsilon;
                        else if (handle.includes('s')) adjustedRawMaxY = adjustedRawMinY + epsilon;
                        else adjustedRawMaxY = adjustedRawMinY + epsilon;
                    }

                    const baseWidth = Math.max(1, startRawBounds.maxX - startRawBounds.minX);
                    const baseHeight = Math.max(1, startRawBounds.maxY - startRawBounds.minY);
                    
                    const scaleXFactor = (adjustedRawMaxX - adjustedRawMinX) / baseWidth;
                    const scaleYFactor = (adjustedRawMaxY - adjustedRawMinY) / baseHeight;
                    
                    // Get original stroke to calculate scaling from
                    const originalStroke = resizeStartBounds.value.originalStroke || selectedStroke.value.originalStroke;
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

                    if (origFirst.type === 'text') {
                        const targetBounds = {
                            minX: adjustedRawMinX,
                            minY: adjustedRawMinY,
                            maxX: adjustedRawMaxX,
                            maxY: adjustedRawMaxY
                        };
                        const isAdvancedText = getStoredTextEditorMode(origFirst) === 'advanced';
                        const isSideResize = ['n', 's', 'e', 'w'].includes(handle);

                        if (isAdvancedText && isSideResize) {
                            const mapX = (value) => mapValueBetweenBounds(
                                value,
                                startRawBounds.minX,
                                startRawBounds.maxX,
                                targetBounds.minX,
                                targetBounds.maxX
                            );
                            const mapY = (value) => mapValueBetweenBounds(
                                value,
                                startRawBounds.minY,
                                startRawBounds.maxY,
                                targetBounds.minY,
                                targetBounds.maxY
                            );

                            const topLeft = {
                                x: mapX(origFirst.x),
                                y: mapY(origFirst.y)
                            };
                            const bottomRight = {
                                x: mapX(origFirst.x + origFirst.width),
                                y: mapY(origFirst.y + origFirst.height)
                            };

                            first.x = Math.min(topLeft.x, bottomRight.x);
                            first.y = Math.min(topLeft.y, bottomRight.y);
                            first.width = Math.max(1, Math.abs(bottomRight.x - topLeft.x));
                            first.height = Math.max(1, Math.abs(bottomRight.y - topLeft.y));

                            first.baseFontSize = Math.max(8, Number(origFirst.baseFontSize) || Number(origFirst.fontSize) || 16);
                            first.fontSize = Math.max(8, Number(origFirst.fontSize) || first.baseFontSize);
                            first.editorWidth = first.width;
                            first.editorHeight = Math.max(24, first.height + getAdvancedEditorChromeHeight());
                        } else {
                            transformStrokeFromOriginalBounds(
                                stroke,
                                originalStroke,
                                startRawBounds,
                                targetBounds
                            );

                            first.editorWidth = first.width;
                            first.editorHeight = getStoredTextEditorMode(first) === 'simple'
                                ? first.height
                                : Math.max(24, first.height + getAdvancedEditorChromeHeight());
                        }
                    } else if (origFirst.type === 'image') {
                        const origHalfW = origFirst.width / 2;
                        const origHalfH = origFirst.height / 2;
                        const origCenterX = origFirst.x + origHalfW;
                        const origCenterY = origFirst.y + origHalfH;

                        let finalScaleX = scaleXFactor;
                        let finalScaleY = scaleYFactor;

                        first.width = origFirst.width * scaleXFactor;
                        first.height = origFirst.height * scaleYFactor;

                        // Update Center relative to Anchor using AABB scale factors
                        const newCenterX = anchorX + (origCenterX - anchorX) * scaleXFactor;
                        const newCenterY = anchorY + (origCenterY - anchorY) * scaleYFactor;
                        
                        first.x = newCenterX - (first.width / 2);
                        first.y = newCenterY - (first.height / 2);

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
                            rect.x = adjustedRawMinX + (origRect.x - origMinX) * scaleXFactor;
                            rect.y = adjustedRawMinY + (origRect.y - origMinY) * scaleYFactor;
                            rect.width = origRect.width * scaleXFactor;
                            rect.height = origRect.height * scaleYFactor;
                        });
                    } else if (origFirst.type === 'circle') {
                        // Calculate new center and radii for ellipse
                        const newWidth = adjustedRawMaxX - adjustedRawMinX;
                        const newHeight = adjustedRawMaxY - adjustedRawMinY;
                        
                        first.startX = adjustedRawMinX + newWidth / 2;
                        first.startY = adjustedRawMinY + newHeight / 2;
                        
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

                        first.startX = adjustedRawMinX + (origFirst.startX - origMinX) * scaleXFactor;
                        first.startY = adjustedRawMinY + (origFirst.startY - origMinY) * scaleYFactor;
                        first.endX = adjustedRawMinX + (origFirst.endX - origMinX) * scaleXFactor;
                        first.endY = adjustedRawMinY + (origFirst.endY - origMinY) * scaleYFactor;
                        first.x = first.startX;
                        first.y = first.startY;
                    } else {
                        // Pen stroke - scale all points
                        const origBounds = startRawBounds;
                        for (let i = 0; i < stroke.length; i++) {
                            const origPoint = originalStroke[i];
                            stroke[i].x = adjustedRawMinX + (origPoint.x - origBounds.minX) * scaleXFactor;
                            stroke[i].y = adjustedRawMinY + (origPoint.y - origBounds.minY) * scaleYFactor;
                        }
                    }
                    selectedStroke.value.stroke = stroke;
                    
                    // Redraw to show the resize preview
                    redrawAllStrokes();
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

                    if (Number.isFinite(first.rotationCenterX) && Number.isFinite(first.rotationCenterY)) {
                        first.rotationCenterX += dx;
                        first.rotationCenterY += dy;
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
                    lastX = currentX;
                    lastY = currentY;
                }
            }
            
            return;
        };

        
        // Handle selection rectangle
        if ((isCaptureSelectionMode.value || isSelectModeActive.value || isTextInputMode.value) && isSelecting.value) {
            handleCaptureSelectionRectangle(e);
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
                color: drawStyle.value.color,
                thickness: getScaledDrawingThickness(),
                fill: drawStyle.value.fill,
                opacity: drawStyle.value.opacity,
                dash: drawStyle.value.dash,
                type: 'pen'
            });
            
            drawingContext.lineTo(currentX, currentY);
            drawingContext.strokeStyle = drawStyle.value.color;
            drawingContext.lineWidth = getScaledDrawingThickness();
            drawingContext.lineCap = 'round';
            drawingContext.lineJoin = 'round';
            drawingContext.globalAlpha = drawStyle.value.opacity;
            drawingContext.setLineDash(drawStyle.value.dash === 'dashed' ? [8, 6] : (drawStyle.value.dash === 'dotted' ? [2, 6] : []));
            drawingContext.stroke();
            drawingContext.setLineDash([]);
            drawingContext.globalAlpha = 1;
        } else {
            // For shapes, restore snapshot and draw preview
            if (canvasSnapshot) {
                drawingContext.putImageData(canvasSnapshot, 0, 0);
            }
            
            drawingContext.strokeStyle = drawStyle.value.color;
            drawingContext.lineWidth = getScaledDrawingThickness();
            drawingContext.lineCap = 'round';
            drawingContext.lineJoin = 'round';
            drawingContext.globalAlpha = drawStyle.value.opacity;
            drawingContext.setLineDash(drawStyle.value.dash === 'dashed' ? [8, 6] : (drawStyle.value.dash === 'dotted' ? [2, 6] : []));
            
            if (drawMode.value === 'line' || drawMode.value === 'rectangle' || drawMode.value === 'circle') {
                drawShape(drawingContext, drawMode.value, startX, startY, currentX, currentY, drawStyle.value);
            }

            drawingContext.setLineDash([]);
            drawingContext.globalAlpha = 1;
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
            const didTransformStroke = isDragging.value || isResizing.value || isRotating.value;
            
            // Redraw without highlight after drag/resize
            if (didTransformStroke) {
                // Save to history if resized, dragged, or rotated
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
                            addToHistory({
                                id: s[0].id,
                                type: 'move',
                                page: activePage.value,
                                strokeIndex: sel.strokeIndex,
                                stroke: JSON.parse(JSON.stringify(s)),
                                previousStroke: sel.originalStroke || JSON.parse(JSON.stringify(s))
                            });
                        });
                    } else {
                        const changeType = isRotating.value ? 'rotate' : (isResizing.value ? 'resize' : 'move');
                        addToHistory({
                            id: stroke[0].id,
                            type: changeType,
                            page: activePage.value,
                            strokeIndex: selectedStroke.value.strokeIndex,
                            stroke: JSON.parse(JSON.stringify(stroke)),
                            previousStroke: selectedStroke.value.originalStroke
                        });
                    }
                }

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
                        selectedStroke.value.stroke = stroke;
                        selectedStroke.value.originalStroke = JSON.parse(JSON.stringify(stroke));
                    }
                }

                suppressNextSelectionClick.value = true;
            }

            isDragging.value = false;
            isResizing.value = false;
            isRotating.value = false;
            resizeHandle.value = null;
            resizeStartBounds.value = null;
            rotatePointerAngleOffset.value = 0;
            isMouseDown.value = false;
            activePointerId.value = null;
            activePointerType.value = null;
            dragStartPos.value = null;
            currentCanvasIndex = -1;
            return;
        };

        // Handle selection complete
        if ((isCaptureSelectionMode.value || isSelectModeActive.value || isTextInputMode.value) && isSelecting.value && selectionStart.value && selectionEnd.value) {
            handleSelectionEnd(e);

            const canvas = activePage.value.drawingCanvas || null;
            if (canvas && e && e.pointerId !== undefined) {
                try {
                    canvas.releasePointerCapture(e.pointerId);
                } catch (err) {
                    // Ignore if capture was already released
                }
            }

            activePointerId.value = null;
            activePointerType.value = null;
            dragStartPos.value = null;
            currentCanvasIndex = -1;
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
                    color: drawStyle.value.color,
                    thickness: getScaledDrawingThickness(),
                    fill: drawStyle.value.fill,
                    opacity: drawStyle.value.opacity,
                    dash: drawStyle.value.dash
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
            addToHistory({
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
        redrawAllStrokes();
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
                                newResizeHandle = getResizeHandle(x, y, bounds, selectedStroke.value.stroke, 5);

                                const rotatedSelection = getRotatedSelectionGeometry(selectedStroke.value.stroke, 5);
                                if (rotatedSelection) {
                                    newBBoxHovering = !!newResizeHandle || isPointInsideOrNearRotatedSelection(x, y, rotatedSelection, 6);
                                } else {
                                    const localBounds = bounds;
                                    const testX = x;
                                    const testY = y;
                                    const inside = testX >= localBounds.minX && testX <= localBounds.maxX && testY >= localBounds.minY && testY <= localBounds.maxY;
                                    let nearEdge = false;

                                    // Optimization: Check edges only if not already inside or on a handle
                                    if (!inside && !newResizeHandle) {
                                        const edgeThreshold = 6;
                                        const nearLeft = Math.abs(testX - localBounds.minX) <= edgeThreshold && testY >= localBounds.minY - edgeThreshold && testY <= localBounds.maxY + edgeThreshold;
                                        const nearRight = Math.abs(testX - localBounds.maxX) <= edgeThreshold && testY >= localBounds.minY - edgeThreshold && testY <= localBounds.maxY + edgeThreshold;
                                        const nearTop = Math.abs(testY - localBounds.minY) <= edgeThreshold && testX >= localBounds.minX - edgeThreshold && testX <= localBounds.maxX + edgeThreshold;
                                        const nearBottom = Math.abs(testY - localBounds.maxY) <= edgeThreshold && testX >= localBounds.minX - edgeThreshold && testX <= localBounds.maxX + edgeThreshold;
                                        nearEdge = nearLeft || nearRight || nearTop || nearBottom;
                                    }

                                    newBBoxHovering = !!newResizeHandle || inside || nearEdge;
                                }
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
        isCaptureSelectionMode.value = false;
        isSelectModeActive.value = false;
        isTextSelectionMode.value = false;
        isTextHighlightMode.value = false;
        isTextInputMode.value = false;
        isDrawing.value = false;
        isEraser.value = false;
        isStrokeHovering.value = false;
        selectedStrokes.value = [];
        selectedStroke.value = null;
        isDragging.value = false;
        isResizing.value = false;
        resizeHandle.value = null;
        resizeStartBounds.value = null;
        handToolActive.value = false;
        showStrokeStyleMenu.value = false;

        // Also clear any native text selection that might be lingering, which can interfere with interactions
        window.getSelection()?.removeAllRanges();
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
                addToHistory({
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
                addToHistory({
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
                addToHistory({
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
                addToHistory({
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
                addToHistory({
                    id: removals[0]?.data?.[0]?.id,
                    type: 'erase',
                    page: activePage.value,
                    strokes: removals
                });
                redrawAllStrokes();
            });

            selectedStrokes.value = [];
            selectedStroke.value = null;
            return;
        }

        // Single deletion
        const strokes = activePage.value.strokes || [];
        const stroke = strokes[selectedStroke.value.strokeIndex];
        if (stroke) {
            strokes.splice(selectedStroke.value.strokeIndex, 1);
            addToHistory({
                id: stroke[0].id,
                type: 'erase',
                page: activePage.value,
                strokes: [{ index: selectedStroke.value.strokeIndex, data: stroke }]
            });
            redrawAllStrokes();
        }
    
        selectedStroke.value = null;
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
                color: drawStyle.value.color,
                thickness: getScaledDrawingThickness(),
                fill: true,
                opacity: Math.min(drawStyle.value.opacity, 0.6),
                dash: drawStyle.value.dash
            }];
        } else {
            // Single rectangle (backward compatibility)
            highlightStroke = [{
                id,
                type: 'highlight-rect',
                rects: [{ x: rectsOrX, y, width, height }],
                color: drawStyle.value.color,
                thickness: getScaledDrawingThickness(),
                fill: true,
                opacity: Math.min(drawStyle.value.opacity, 0.6),
                dash: drawStyle.value.dash
            }];
        }
        
        activePage.value.strokes.push(highlightStroke);
        
        addToHistory({
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

    const editSelectedTextStroke = () => {
        if (!selectedStroke.value) return;
        if (selectedStroke.value.stroke?.[0]?.type !== 'text') return;

        const first = selectedStroke.value.stroke[0];
        const content = getTextStrokeContent(first);
        textEditorSimpleMode.value = getStoredTextEditorMode(first) === 'simple';
        const preferredSize = getPreferredTextEditorSize();
        const toolbarHeight = getAdvancedEditorToolbarHeight();
        const advancedEditorHeight = Math.max(
            24,
            Number(first.editorHeight)
                || (Math.max(24, Number(first.height) || 24) + getAdvancedEditorChromeHeight())
        );

        openTextEditor({
            bounds: {
                x: first.x,
                y: textEditorSimpleMode.value ? first.y : Math.max(0, first.y - toolbarHeight),
                width: first.editorWidth || preferredSize.width,
                height: textEditorSimpleMode.value ? (first.editorHeight || preferredSize.height) : advancedEditorHeight
            },
            strokeRef: {
                pageId: selectedStroke.value.pageId,
                pageIndex: selectedStroke.value.pageIndex,
                strokeIndex: selectedStroke.value.strokeIndex
            },
            content: textEditorSimpleMode.value ? content.text : content.html,
            targetBounds: { width: first.width, height: first.height }
        });

        redrawAllStrokes();
    };

    const BOUNDING_BOX_HANDLE_COLOR = '#2a7fff';
    const SVG_NS = 'http://www.w3.org/2000/svg';

    const createSvgElement = (tag, attrs = {}) => {
        const el = document.createElementNS(SVG_NS, tag);

        Object.entries(attrs).forEach(([key, value]) => {
            if (value === null || value === undefined) return;
            el.setAttribute(key, String(value));
        });
        return el;
    };

    const toSvgRotationTransform = (stroke) => {
        if (!stroke || !stroke.length) return null;
        const first = stroke[0];
        const angle = first.rotation || 0;
        if (!angle) return null;
        const center = getStrokeRotationCenter(stroke);
        if (!center) return null;
        const cx = center.x;
        const cy = center.y;
        const deg = angle * (180 / Math.PI);
        return `rotate(${deg} ${cx} ${cy})`;
    };

    const getStrokePenPath = (stroke) => {
        if (!Array.isArray(stroke) || stroke.length === 0) return '';
        return stroke
            .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
            .join(' ');
    };

    const setStrokeMeta = (el, strokeIndex) => {
        if (!el || strokeIndex === undefined || strokeIndex === null) return;
        el.setAttribute('data-stroke-index', String(strokeIndex));
    };

    const appendStrokeToSvg = (svgLayer, stroke, strokeIndex = null) => {
        if (!svgLayer || !Array.isArray(stroke) || stroke.length === 0) return;

        const first = stroke[0];
        const transform = toSvgRotationTransform(stroke);
        const strokeColor = first.color || drawStyle.value.color;
        const strokeWidth = first.thickness || getScaledDrawingThickness() || 2;
        const strokeOpacity = normalizeOpacity(first.opacity);
        const strokeDash = normalizeDash(first.dash);
        const dashArray = strokeDash === 'dashed' ? '8 6' : (strokeDash === 'dotted' ? '2 6' : null);
        const shouldFill = Boolean(first.fill);

        if (first.type === 'image' && first.imageData) {
            const image = createSvgElement('image', {
                x: first.x,
                y: first.y,
                width: first.width,
                height: first.height,
                href: first.imageData,
                preserveAspectRatio: 'none'
            });
            setStrokeMeta(image, strokeIndex);
            if (transform) image.setAttribute('transform', transform);
            svgLayer.appendChild(image);
            return;
        }

        if (first.type === 'highlight-rect') {
            const group = createSvgElement('g', {
                fill: strokeColor,
                'fill-opacity': Math.min(strokeOpacity, 0.6)
            });
            const rects = first.rects || [{ x: first.x, y: first.y, width: first.width, height: first.height }];
            rects.forEach(rect => {
                const childRect = createSvgElement('rect', {
                    x: rect.x,
                    y: rect.y,
                    width: rect.width,
                    height: rect.height
                });
                setStrokeMeta(childRect, strokeIndex);
                group.appendChild(childRect);
            });
            if (transform) group.setAttribute('transform', transform);
            svgLayer.appendChild(group);
            return;
        }

        if (first.type === 'line') {
            const line = createSvgElement('line', {
                x1: first.startX,
                y1: first.startY,
                x2: first.endX,
                y2: first.endY,
                stroke: strokeColor,
                'stroke-opacity': strokeOpacity,
                'stroke-width': strokeWidth,
                'stroke-linecap': 'round',
                'stroke-linejoin': 'round',
                fill: 'none'
            });
            if (dashArray) line.setAttribute('stroke-dasharray', dashArray);
            setStrokeMeta(line, strokeIndex);
            if (transform) line.setAttribute('transform', transform);
            svgLayer.appendChild(line);
            return;
        }

        if (first.type === 'rectangle') {
            const x = Math.min(first.startX, first.endX);
            const y = Math.min(first.startY, first.endY);
            const width = Math.abs(first.endX - first.startX);
            const height = Math.abs(first.endY - first.startY);
            const rect = createSvgElement('rect', {
                x,
                y,
                width,
                height,
                stroke: strokeColor,
                'stroke-opacity': strokeOpacity,
                'stroke-width': strokeWidth,
                fill: shouldFill ? strokeColor : 'none',
                'fill-opacity': shouldFill ? strokeOpacity : 1
            });
            if (dashArray) rect.setAttribute('stroke-dasharray', dashArray);
            setStrokeMeta(rect, strokeIndex);
            if (transform) rect.setAttribute('transform', transform);
            svgLayer.appendChild(rect);
            return;
        }

        if (first.type === 'circle') {
            let shape = null;
            if (first.radiusX !== undefined || first.radiusY !== undefined) {
                shape = createSvgElement('ellipse', {
                    cx: first.startX,
                    cy: first.startY,
                    rx: first.radiusX !== undefined ? first.radiusX : Math.abs(first.endX - first.startX),
                    ry: first.radiusY !== undefined ? first.radiusY : Math.abs(first.endY - first.startY),
                    stroke: strokeColor,
                    'stroke-opacity': strokeOpacity,
                    'stroke-width': strokeWidth,
                    fill: shouldFill ? strokeColor : 'none',
                    'fill-opacity': shouldFill ? strokeOpacity : 1
                });
            } else {
                const radius = Math.sqrt(Math.pow(first.endX - first.startX, 2) + Math.pow(first.endY - first.startY, 2));
                shape = createSvgElement('circle', {
                    cx: first.startX,
                    cy: first.startY,
                    r: radius,
                    stroke: strokeColor,
                    'stroke-opacity': strokeOpacity,
                    'stroke-width': strokeWidth,
                    fill: shouldFill ? strokeColor : 'none',
                    'fill-opacity': shouldFill ? strokeOpacity : 1
                });
            }
            if (dashArray) shape.setAttribute('stroke-dasharray', dashArray);
            setStrokeMeta(shape, strokeIndex);
            if (transform) shape.setAttribute('transform', transform);
            svgLayer.appendChild(shape);
            return;
        }

        if (first.type === 'text') {
            const textBox = getTextBoxSize(stroke);
            if (!textBox) return;
            const content = getTextStrokeContent(first);
            const html = content.html || convertPlainTextToHtml(content.text || '');
            const isSimpleMode = getStoredTextEditorMode(first) === 'simple';

            if (isSimpleMode) {
                const baseFontSize = Math.max(8, Number(first.baseFontSize) || Number(first.fontSize) || 16);
                const renderFontSize = Math.max(8, Number(first.fontSize) || baseFontSize);
                const svgText = createSvgElement('text', {
                    x: first.x + 2,
                    y: first.y + 2,
                    fill: first.color || DEFAULT_TEXT_COLOR,
                    'font-family': 'Arial, sans-serif',
                    'font-size': renderFontSize,
                    'dominant-baseline': 'hanging',
                    'text-rendering': 'geometricPrecision'
                });
                setStrokeMeta(svgText, strokeIndex);
                if (transform) svgText.setAttribute('transform', transform);
                svgText.textContent = String(content.text || '').replace(/\r?\n+/g, ' ').replace(/\s{2,}/g, ' ').trim();
                svgLayer.appendChild(svgText);
                return;
            }

            const foreignObject = createSvgElement('foreignObject', {
                x: first.x,
                y: first.y,
                width: textBox.width,
                height: textBox.height
            });
            setStrokeMeta(foreignObject, strokeIndex);
            if (transform) foreignObject.setAttribute('transform', transform);
            const fontSize = Number(first.fontSize) || Number(first.baseFontSize);
            const container = document.createElement('div');
            container.classList.add('ql-container', 'ql-snow');
            container.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
            container.style.fontSize = `${fontSize}px`;

            const wrapper = document.createElement('div');
            wrapper.classList.add('ql-editor');
            wrapper.style.wordBreak = isSimpleMode ? 'normal' : 'break-word';
            wrapper.style.whiteSpace = isSimpleMode ? 'nowrap' : 'pre-wrap';
            wrapper.style.fontFamily = 'Arial, sans-serif';
            wrapper.style.color = first.color || DEFAULT_TEXT_COLOR;

            if (isSimpleMode) {
                wrapper.style.lineHeight = '1.25';
                wrapper.style.paddingRight = '2px';
                wrapper.textContent = String(content.text || '').replace(/\r?\n+/g, ' ').replace(/\s{2,}/g, ' ').trim();
            } else {
                wrapper.innerHTML = html;
                wrapper.style.padding = '12px 15px';
                wrapper.style.lineHeight = '1.42';
            }

            container.appendChild(wrapper);
            foreignObject.appendChild(container);
            svgLayer.appendChild(foreignObject);
            const fittedHeight = Math.max(24, Math.ceil(wrapper.scrollHeight || 0));
            foreignObject.setAttribute('height', String(fittedHeight));
            foreignObject.style.height = `${fittedHeight}px`;

            if (Number.isFinite(fittedHeight) && fittedHeight > 0) {
                first.height = fittedHeight;
            }
            return;
        }

        const pathData = getStrokePenPath(stroke);
        if (!pathData) return;
        const path = createSvgElement('path', {
            d: pathData,
            stroke: strokeColor,
            'stroke-opacity': strokeOpacity,
            'stroke-width': strokeWidth,
            'stroke-linecap': 'round',
            'stroke-linejoin': 'round',
            fill: 'none'
        });
        if (dashArray) path.setAttribute('stroke-dasharray', dashArray);
        setStrokeMeta(path, strokeIndex);
        if (transform) path.setAttribute('transform', transform);
        svgLayer.appendChild(path);
    };

    const drawSelectionBoundingBox = () => {
        const page = activePage?.value;
        const svgLayer = page?.annotationSvg || null;
        if (!svgLayer) return;

        const existingOverlay = svgLayer.querySelector('.annotation-selection-overlay');

        if (existingOverlay) existingOverlay.remove();

        if (!selectedStroke.value || selectedStroke.value.pageId !== page.id) return;

        const strokeIndex = selectedStroke.value.strokeIndex;
        if (strokeIndex === undefined) return;

        const strokes = page.strokes || [];
        const multi = Array.isArray(selectedStrokes.value) && selectedStrokes.value.filter(s => s.pageIndex === page.index).length > 1;
        const stroke = strokes[strokeIndex];
        if ((!stroke || stroke.length === 0) && !multi) return;

        let minX, minY, maxX, maxY;
        const padding = SELECTION_PADDING;

        if (multi) {
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
            if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) return;
            
            minX -= padding;
            minY -= padding;
            maxX += padding;
            maxY += padding;
        } else {
            const b = getStrokeBounds(stroke, 0);
            if (!b) return;
            minX = b.minX - padding;
            minY = b.minY - padding;
            maxX = b.maxX + padding;
            maxY = b.maxY + padding;
        }

        const overlayGroup = createSvgElement('g', {
            class: 'annotation-selection-overlay',
            'pointer-events': 'none'
        });

        const rotatedSelection = (!multi && stroke?.[0]) ? getRotatedSelectionGeometry(stroke, padding) : null;

        if (rotatedSelection?.corners?.length === 4) {
            const points = rotatedSelection.corners.map(point => `${point.x},${point.y}`).join(' ');
            overlayGroup.appendChild(createSvgElement('polygon', {
                points,
                fill: 'none',
                stroke: BOUNDING_BOX_HANDLE_COLOR,
                'stroke-width': 2
            }));
        } else {
            overlayGroup.appendChild(createSvgElement('rect', {
                x: minX,
                y: minY,
                width: maxX - minX,
                height: maxY - minY,
                fill: 'none',
                stroke: BOUNDING_BOX_HANDLE_COLOR,
                'stroke-width': 2
            }));
        }

        if (!multi && stroke?.[0]) {
            const first = stroke[0];
            const canResize = first.type !== 'highlight-rect';
            if (!canResize) {
                svgLayer.appendChild(overlayGroup);
                return;
            }
            const handleSize = 8;
            const handles = rotatedSelection?.handles
                ? [
                    { ...rotatedSelection.handles.nw, handle: 'nw' },
                    { ...rotatedSelection.handles.ne, handle: 'ne' },
                    { ...rotatedSelection.handles.sw, handle: 'sw' },
                    { ...rotatedSelection.handles.se, handle: 'se' },
                    { ...rotatedSelection.handles.n, handle: 'n' },
                    { ...rotatedSelection.handles.s, handle: 's' },
                    { ...rotatedSelection.handles.w, handle: 'w' },
                    { ...rotatedSelection.handles.e, handle: 'e' }
                ]
                : [
                    { x: minX, y: minY, handle: 'nw' },
                    { x: maxX, y: minY, handle: 'ne' },
                    { x: minX, y: maxY, handle: 'sw' },
                    { x: maxX, y: maxY, handle: 'se' },
                    { x: (minX + maxX) / 2, y: minY, handle: 'n' },
                    { x: (minX + maxX) / 2, y: maxY, handle: 's' },
                    { x: minX, y: (minY + maxY) / 2, handle: 'w' },
                    { x: maxX, y: (minY + maxY) / 2, handle: 'e' }
                ];
            const rotationAvailable = first.type !== 'highlight-rect';
            handles.forEach(h => {
                overlayGroup.appendChild(createSvgElement('rect', {
                    x: h.x - handleSize / 2,
                    y: h.y - handleSize / 2,
                    width: handleSize,
                    height: handleSize,
                    fill: '#ffffff',
                    stroke: BOUNDING_BOX_HANDLE_COLOR,
                    'stroke-width': 2
                }));
            });

            if (rotationAvailable) {
                const rotateHandle = getRotateHandlePosition({ rotatedSelection, bounds: { minX, minY, maxX, maxY }, offset: 24 });
                if (rotateHandle) {
                    overlayGroup.appendChild(createSvgElement('line', {
                        x1: rotateHandle.anchorX,
                        y1: rotateHandle.anchorY,
                        x2: rotateHandle.x,
                        y2: rotateHandle.y,
                        stroke: BOUNDING_BOX_HANDLE_COLOR,
                        'stroke-width': 2
                    }));
                    overlayGroup.appendChild(createSvgElement('circle', {
                        cx: rotateHandle.x,
                        cy: rotateHandle.y,
                        r: handleSize / 2,
                        fill: '#ffffff',
                        stroke: BOUNDING_BOX_HANDLE_COLOR,
                        'stroke-width': 2
                    }));
                }
            }
        }

        svgLayer.appendChild(overlayGroup);
    };

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
                let minX, minY, maxX, maxY;
                const toClientPoint = (point) => ({
                    x: cRect.left + point.x * scaleXToClient,
                    y: cRect.top + point.y * scaleYToClient
                });

                const bbox = getStrokeBounds(stroke, SELECTION_PADDING);
                if (bbox) {
                    minX = bbox.minX;
                    minY = bbox.minY;
                    maxX = bbox.maxX;
                    maxY = bbox.maxY;
                }

                if (minX !== undefined) {
                    const clientMinX = cRect.left + minX * scaleXToClient;
                    const clientMaxX = cRect.left + maxX * scaleXToClient;
                    const clientMinY = cRect.top + minY * scaleYToClient;
                    const clientMaxY = cRect.top + maxY * scaleYToClient;

                    const offset = 10;
                    const menuWidth = rect.width;
                    const menuHeight = rect.height;

                    const rotatedSelection = getRotatedSelectionGeometry(stroke, SELECTION_PADDING);
                    let desiredLeft;
                    let desiredTop;

                    if (rotatedSelection?.corners?.length === 4) {
                        const points = [...rotatedSelection.corners];
                        if (rotatedSelection.handles?.e) points.push(rotatedSelection.handles.e);
                        if (rotatedSelection.handles?.se) points.push(rotatedSelection.handles.se);
                        const rotateHandle = getRotateHandlePosition({ rotatedSelection, offset: 24 });
                        if (rotateHandle) points.push({ x: rotateHandle.x, y: rotateHandle.y });

                        const clientPoints = points.map(toClientPoint);
                        const rightAnchor = clientPoints.reduce((best, point) => (
                            !best || (point.x + point.y * 0.2) > (best.x + best.y * 0.2) ? point : best
                        ), null);
                        const leftAnchor = clientPoints.reduce((best, point) => (
                            !best || (point.x - point.y * 0.2) < (best.x - best.y * 0.2) ? point : best
                        ), null);

                        desiredLeft = (rightAnchor?.x ?? clientMaxX) + offset;
                        desiredTop = (rightAnchor?.y ?? clientMaxY) - (menuHeight / 2);

                        if (desiredLeft + menuWidth > viewportWidth - margin) {
                            desiredLeft = (leftAnchor?.x ?? clientMinX) - offset - menuWidth;
                        }

                        if (desiredTop + menuHeight > viewportHeight - margin) {
                            desiredTop = viewportHeight - margin - menuHeight;
                        }
                        if (desiredTop < margin) {
                            desiredTop = margin;
                        }
                    } else {
                        let desiredRight = clientMaxX + offset;
                        desiredTop = clientMaxY + offset;
                        desiredLeft = desiredRight - menuWidth;

                        if (desiredRight > viewportWidth - margin) {
                            desiredRight = clientMinX - offset;
                            desiredLeft = desiredRight - menuWidth;
                        }

                        if (desiredTop + menuHeight > viewportHeight - margin) {
                            desiredTop = clientMinY - offset - menuHeight;
                        }
                    }

                    desiredLeft = Math.min(Math.max(margin, desiredLeft), viewportWidth - margin - menuWidth);
                    desiredTop = Math.min(Math.max(margin, desiredTop), viewportHeight - margin - menuHeight);

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

    watch(
        () => !isDragging.value && !isResizing.value && !isRotating.value && (selectedStroke.value || selectedStrokes.value.length > 0) && isSelectModeActive.value,
        (isSelected) => {
            showStrokeMenu.value = isSelected;

            if (isSelected) {
                drawSelectionBoundingBox();
                clampStrokeMenuPosition();
            }
        },
    )

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
            addToHistory({
                id: strokeId,
                type: 'erase',
                page: activePage.value,
                strokes: strokesToRemove
            });
            redrawAllStrokes();
        }
    };

    const redrawAllStrokes = (targetPage) => {
        const page = (targetPage && typeof targetPage === 'object') ? targetPage : activePage.value;
        const canvas = page?.drawingCanvas || null;
        const drawingContext = page?.drawingContext || null;
        const svgLayer = page?.annotationSvg || null;
        if (!canvas || !drawingContext || !svgLayer) return;

        drawingContext.clearRect(0, 0, canvas.width, canvas.height);

        svgLayer.setAttribute('viewBox', `0 0 ${canvas.width} ${canvas.height}`);
        svgLayer.setAttribute('width', `${canvas.width}`);
        svgLayer.setAttribute('height', `${canvas.height}`);
        svgLayer.replaceChildren();

        const strokes = page.strokes || [];
        const selectedIndex = (selectedStroke.value && selectedStroke.value.pageId === page.id)
            ? selectedStroke.value.strokeIndex
            : -1;

        strokes.forEach((stroke, index) => {
            if (index === selectedIndex) return;
            appendStrokeToSvg(svgLayer, stroke, index);
        });

        if (selectedIndex >= 0 && strokes[selectedIndex]) {
            appendStrokeToSvg(svgLayer, strokes[selectedIndex], selectedIndex);
            drawSelectionBoundingBox();
        }
    };

    const captureSelection = async () => {
        if (!selectionStart.value || !selectionEnd.value) return;
        
        const canvasIndex = selectionStart.value.canvasIndex;
        const pdfCanvas = activePage.value.canvas;
        const drawCanvas = activePage.value.drawingCanvas;
        const annotationSvg = activePage.value.annotationSvg;
        
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
        // Draw persistent SVG annotations
        if (annotationSvg) {
            const svgClone = annotationSvg.cloneNode(true);
            const selectionOverlay = svgClone.querySelector('.annotation-selection-overlay');
            if (selectionOverlay) {
                selectionOverlay.remove();
            }
            svgClone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
            const serializer = new XMLSerializer();
            const svgText = serializer.serializeToString(svgClone);
            const svgBlob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
            const svgUrl = URL.createObjectURL(svgBlob);
            try {
                await new Promise((resolve) => {
                    const svgImage = new Image();
                    svgImage.onload = () => {
                        tempCtx.drawImage(svgImage, 0, 0, pdfCanvas.width, pdfCanvas.height);
                        resolve();
                    };
                    svgImage.onerror = () => resolve();
                    svgImage.src = svgUrl;
                });
            } finally {
                URL.revokeObjectURL(svgUrl);
            }
        }
        // Draw temporary freehand canvas preview layer
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
          const annotationSvg = activePage.value.annotationSvg;
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

                if (annotationSvg) {
                    annotationSvg.setAttribute('viewBox', `0 0 ${canvasWidth * pixelRatio} ${canvasHeight * pixelRatio}`);
                    annotationSvg.setAttribute('width', `${canvasWidth * pixelRatio}`);
                    annotationSvg.setAttribute('height', `${canvasHeight * pixelRatio}`);
                }

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

    return {
        colorPalette,
        isSelectModeActive,
        isTextSelectionMode,
        isTextHighlightMode,
        isDrawing,
        isEraser,
        drawMode,
        drawStyle,
        isTextInputMode,
        textEditorHtml,
        textEditorPosition,
        textEditorSimpleMode,
        isCaptureSelectionMode,
        isPenHovering,
        isStrokeHovering,
        isDragging,
        selectedStroke,
        strokeMenu,
        showStrokeMenu,
        strokeMenuPosition,
        resizeCursor,
        handToolActive,
        isHandToolPanning,
        startDrawing,
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
        redrawAllStrokes,
        drawImageCanvas,
        deleteSelectedStroke,
        strokeStyles,
        activeStrokeStyle,
        updateStrokeStyle,
        showStrokeStyleMenu,
        handleStrokeStyleButtonClick,
        clampStrokeMenuPosition,
        highlightTextSelection,
        copySelectedStroke,
        insertCopiedStroke,
        retrieveClipboardData,
        isSelectedStrokeType,
        copiedStrokes,
        selectStrokes,
        retrieveClipboardData,
    };
}