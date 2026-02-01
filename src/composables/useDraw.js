import { ref, nextTick, computed, watch } from 'vue';
import { uuid } from './useUuid.js';
import { useStore } from './useStore.js';
import { enableTouchDrawing } from './useAppPreferences.js';

const copiedStroke = ref(null);

export function useDraw(pagesContainer, pdfCanvases, renderedPages, strokesPerPage, drawingCanvases, drawingContexts, strokeChangeCallback) {
    const { get: storeGet, set: storeSet } = useStore();
    
    // Image cache to prevent reloading on every redraw
    const imageCache = new Map();
    
    // Drawing variables
    const isSelectModeActive = ref(true);
    const isTextSelectionMode = ref(false);
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

    const initialStrokeStyles = ref([{
        color: 'blue',
        thickness: 2
    }, {
        color: 'red',
        thickness: 2
    }, {
        color: 'green',
        thickness: 2
    }, {
        color: 'orange',
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
        drawColor.value = style.color;
        drawThickness.value = style.thickness;
        initialStrokeIndex.value = index;
        storeSet('initialStrokeIndex', index);
    }


    // Text mode variables
    const isTextInputMode = ref(false);
    const textInput = ref('');
    const textInputField = ref(null);
    const textPosition = ref(null);
    const textCanvasIndex = ref(-1);
    const fontSize = ref(16);
    const textboxPosition = ref(null); // Screen position for the textbox

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
        const canvas = drawingCanvases.value[selectionStart.value.canvasIndex];
        const ctx = drawingContexts.value[selectionStart.value.canvasIndex];
        if (canvas && ctx) {
            // Scale coordinates to canvas size
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;
            
            redrawAllStrokes(selectionStart.value.canvasIndex);
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
            const pageIndex = selectedStroke.value.pageIndex;
            const group = selectedStrokes.value
                .filter(sel => sel.pageIndex === pageIndex)
                .map(sel => JSON.parse(JSON.stringify(sel.stroke)));
            copiedStroke.value = {
                strokes: group,
                inserted: 0
            };
        } else {
            copiedStroke.value = {
                stroke: JSON.parse(JSON.stringify(selectedStroke.value.stroke)),
                inserted: 0
            };
        }
    };

    const insertFromClipboard = async () => {
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
                            copiedStroke.value = {
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
                            insertCopiedStroke(-1); 
                        };
                        img.src = dataUrl;
                    };
                    reader.readAsDataURL(blob);
                    return;
                }
            }
        } catch (err) {
            console.error('Failed to insert from clipboard:', err);
        }
    }

    // Insert Copied Stroke
    const insertCopiedStroke = (pageIndex) => {
        if (!copiedStroke.value) return;

        let targetPageIndex = typeof pageIndex === 'number' ? pageIndex : -1;
        
        // If passed as event or invalid, try to find the visible page
        if (targetPageIndex === -1) {
            targetPageIndex = 0; // Default to first page
            if (drawingCanvases.value && drawingCanvases.value.length > 0) {
                const viewportCenterY = window.innerHeight / 2;
                let minDistance = Infinity;
                
                drawingCanvases.value.forEach((canvas, index) => {
                    if (!canvas) return;
                    const rect = canvas.getBoundingClientRect();
                    // Check if canvas is essentially visible
                    if (rect.bottom > 0 && rect.top < window.innerHeight) {
                        const canvasCenterY = rect.top + rect.height / 2;
                        const distance = Math.abs(viewportCenterY - canvasCenterY);
                        if (distance < minDistance) {
                            minDistance = distance;
                            targetPageIndex = index;
                        }
                    }
                });
            }
        }

        // Determine the visible center in canvas coordinates for placement
        const getVisibleCenterOnCanvas = (canvasIdx) => {
            const canvas = drawingCanvases.value[canvasIdx];
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

        const { cx: visibleCX, cy: visibleCY } = getVisibleCenterOnCanvas(targetPageIndex);

        const pageNumber = targetPageIndex + 1;
        if (!strokesPerPage.value[pageNumber]) {
            strokesPerPage.value[pageNumber] = [];
        }
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

                strokesPerPage.value[pageNumber].push(newStroke);
                strokeChangeCallback({ id: newId, type: 'add', page: pageNumber, stroke: newStroke });
                const strokeIndex = strokesPerPage.value[pageNumber].length - 1;
                newSelections.push({ pageIndex: targetPageIndex, strokeIndex, stroke: newStroke });
            });

            selectedStrokes.value = newSelections;
            const last = newSelections[newSelections.length - 1];
            selectedStroke.value = last ? { ...last, originalStroke: JSON.parse(JSON.stringify(last.stroke)) } : null;
            showStrokeMenu.value = true;
            redrawAllStrokes(targetPageIndex);
            if (selectedStroke.value) {
                drawSelectionBoundingBox(targetPageIndex, selectedStroke.value.strokeIndex);
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

        strokesPerPage.value[pageNumber].push(newStroke);
        strokeChangeCallback({
            id: newId,
            type: 'add',
            page: pageNumber,
            stroke: newStroke
        });

        const strokeIndex = strokesPerPage.value[pageNumber].length - 1;

        selectedStroke.value = {
            pageIndex: targetPageIndex,
            strokeIndex,
            stroke: newStroke,
            originalStroke: JSON.parse(JSON.stringify(newStroke))
        };

        showStrokeMenu.value = true;

        redrawAllStrokes(targetPageIndex);
        drawSelectionBoundingBox(targetPageIndex, strokeIndex);
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
        // Find which canvas the event occurred on
        const target = e.target;
        for (let i = 0; i < drawingCanvases.value.length; i++) {
            if (drawingCanvases.value[i] === target) {
                return i;
            }
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
                 const ctx = drawingContexts.value[0];
            if (!ctx) return false;
            ctx.font = `${first.fontSize}px Arial`;
            const metrics = ctx.measureText(first.text);
            const textWidth = metrics.width;
            const textHeight = first.fontSize;
            
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

    const findStrokeAtPoint = (x, y, canvasIndex) => {
        const pageNumber = canvasIndex + 1;
        const strokes = strokesPerPage.value[pageNumber] || [];
        
        // Search in reverse order to prioritize top strokes
        for (let i = strokes.length - 1; i >= 0; i--) {
            if (isPointNearStroke(x, y, strokes[i])) {
                return { pageIndex: canvasIndex, strokeIndex: i, stroke: strokes[i] };
            }
        }
        showStrokeMenu.value = false;
        selectedStroke.value = null;
        redrawAllStrokes(canvasIndex);
        return null;
    };

    const isAnyStrokeAtPoint = (x, y, canvasIndex) => {
        const pageNumber = canvasIndex + 1;
        const strokes = strokesPerPage.value[pageNumber] || [];

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
            const ctx = drawingContexts.value[0];
            if (!ctx) return null;
            ctx.font = `${first.fontSize}px Arial`;
            const metrics = ctx.measureText(first.text);
            const angle = first.rotation || 0;
            const cx = first.x + metrics.width / 2;
            const cy = first.y + first.fontSize / 2;
            const corners = [
                { x: first.x, y: first.y },
                { x: first.x + metrics.width, y: first.y },
                { x: first.x + metrics.width, y: first.y + first.fontSize },
                { x: first.x, y: first.y + first.fontSize }
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
        } else {
            // Pen strokes: rotate points if needed and compute AABB
            const angle = first.rotation || 0;
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            let cx = 0, cy = 0;
            if (angle) {
                // compute center from unrotated bounds
                let uMinX = Infinity, uMinY = Infinity, uMaxX = -Infinity, uMaxY = -Infinity;
                for (let p of stroke) { uMinX = Math.min(uMinX, p.x); uMinY = Math.min(uMinY, p.y); uMaxX = Math.max(uMaxX, p.x); uMaxY = Math.max(uMaxY, p.y); }
                cx = (uMinX + uMaxX) / 2; cy = (uMinY + uMaxY) / 2;
                const cosA = Math.cos(angle), sinA = Math.sin(angle);
                for (let p of stroke) {
                    const dx = p.x - cx, dy = p.y - cy;
                    const rx = cx + dx * cosA - dy * sinA;
                    const ry = cy + dx * sinA + dy * cosA;
                    minX = Math.min(minX, rx);
                    minY = Math.min(minY, ry);
                    maxX = Math.max(maxX, rx);
                    maxY = Math.max(maxY, ry);
                }
            } else {
                for (let p of stroke) {
                    minX = Math.min(minX, p.x);
                    minY = Math.min(minY, p.y);
                    maxX = Math.max(maxX, p.x);
                    maxY = Math.max(maxY, p.y);
                }
            }
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
            const ctx = drawingContexts.value[0];
            if (!ctx) return null;
            ctx.font = `${first.fontSize}px Arial`;
            const metrics = ctx.measureText(first.text);
            return { minX: first.x - pad, minY: first.y - pad, maxX: first.x + metrics.width + pad, maxY: first.y + first.fontSize + pad };
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
        const handles = [];
        const angle = stroke && stroke[0] && stroke[0].type !== 'highlight-rect' ? (stroke[0].rotation || 0) : 0;
        if (angle) {
            const bLocal = getUnrotatedBounds(stroke, SELECTION_PADDING);
            if (!bLocal) return null;
            const cx = (bLocal.minX + bLocal.maxX) / 2;
            const cy = (bLocal.minY + bLocal.maxY) / 2;
            const cosA = Math.cos(angle), sinA = Math.sin(angle);
            const localPoints = [
                { x: bLocal.minX, y: bLocal.minY, handle: 'nw' },
                { x: bLocal.maxX, y: bLocal.minY, handle: 'ne' },
                { x: bLocal.minX, y: bLocal.maxY, handle: 'sw' },
                { x: bLocal.maxX, y: bLocal.maxY, handle: 'se' },
                { x: (bLocal.minX + bLocal.maxX) / 2, y: bLocal.minY, handle: 'n' },
                { x: (bLocal.minX + bLocal.maxX) / 2, y: bLocal.maxY, handle: 's' },
                { x: bLocal.minX, y: (bLocal.minY + bLocal.maxY) / 2, handle: 'w' },
                { x: bLocal.maxX, y: (bLocal.minY + bLocal.maxY) / 2, handle: 'e' }
            ];
            localPoints.forEach(p => {
                const dx = p.x - cx, dy = p.y - cy;
                const gx = cx + dx * cosA - dy * sinA;
                const gy = cy + dx * sinA + dy * cosA;
                handles.push({ x: gx, y: gy, handle: p.handle });
            });
        } else {
            handles.push(
                { x: bounds.minX, y: bounds.minY, handle: 'nw' },
                { x: bounds.maxX, y: bounds.minY, handle: 'ne' },
                { x: bounds.minX, y: bounds.maxY, handle: 'sw' },
                { x: bounds.maxX, y: bounds.maxY, handle: 'se' },
                { x: (bounds.minX + bounds.maxX) / 2, y: bounds.minY, handle: 'n' },
                { x: (bounds.minX + bounds.maxX) / 2, y: bounds.maxY, handle: 's' },
                { x: bounds.minX, y: (bounds.minY + bounds.maxY) / 2, handle: 'w' },
                { x: bounds.maxX, y: (bounds.minY + bounds.maxY) / 2, handle: 'e' }
            );
        }
        
        for (let h of handles) {
            if (Math.abs(x - h.x) <= threshold && Math.abs(y - h.y) <= threshold) {
                return h.handle;
            }
        }

        return null;
    };

    const selectStrokeInSelectionBox = () => {
        if (!selectionStart.value || !selectionEnd.value) return;

        const canvasIndex = selectionStart.value.canvasIndex;
        const pageNumber = canvasIndex + 1;
        const strokes = strokesPerPage.value[pageNumber] || [];

        // Convert selection box from screen (CSS) coords to canvas coords
        const canvas = drawingCanvases.value[canvasIndex];
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
                    pageIndex: canvasIndex,
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
                pageIndex: canvasIndex,
                strokeIndex: topmostIndex,
                stroke,
                originalStroke: JSON.parse(JSON.stringify(stroke))
            };
            showStrokeMenu.value = true;
            redrawAllStrokes(canvasIndex);
            drawSelectionBoundingBox(canvasIndex, topmostIndex);
        } else {
            showStrokeMenu.value = false;
            selectedStroke.value = null;
            redrawAllStrokes(canvasIndex);
        }
    };

    const startDrawing = (e) => {
        if (handToolActive.value) {
            const scrollEl = getScrollContainer();
            if (!scrollEl) return;

            const canvasIndex = getCanvasIndexFromEvent(e);
            const canvas = drawingCanvases.value?.[canvasIndex] || null;

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
                const canvasIndex = getCanvasIndexFromEvent(e);
                if (canvasIndex === -1) return;
                
                const canvas = drawingCanvases.value[canvasIndex];
                const pt = getCanvasPointFromEvent(canvas, e);
                if (!pt) return;
                const { x, y } = pt;
                
                // Check if clicking on a resize handle of already selected stroke
                // Disable resizing when multiple selection is active
                if (selectedStrokes.value.length <= 1 && selectedStroke.value && selectedStroke.value.pageIndex === canvasIndex) {
                        const handlePadding = 5;
                            const bounds = getStrokeBounds(selectedStroke.value.stroke, SELECTION_PADDING);
                            let handle = getResizeHandle(x, y, bounds, selectedStroke.value.stroke);
                            // Treat top-right corner as rotation handle for all strokes (single selection), except highlight-rect
                            if (handle === 'ne') {
                                const multiActive = Array.isArray(selectedStrokes.value) && selectedStrokes.value.filter(s => s.pageIndex === canvasIndex).length > 1;
                                const type = selectedStroke.value.stroke[0]?.type;
                                if (!multiActive && type !== 'highlight-rect') handle = 'rotate';
                            }
                    
                    if (handle) {
                        const firstSel = selectedStroke.value.stroke[0];
                        if ((handle === 'rotate' || handle === 'ne') && firstSel.type !== 'highlight-rect') {
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
                
                const found = findStrokeAtPoint(x, y, canvasIndex);
    
                if (found) {
                    const ctrl = !!e.ctrlKey;

                    const newSelection = {
                        pageIndex: canvasIndex,
                        strokeIndex: found.strokeIndex,
                        stroke: found.stroke,
                        originalStroke: JSON.parse(JSON.stringify(found.stroke))
                    };

                    if (ctrl) {
                        // Toggle multi-selection
                        const idx = selectedStrokes.value.findIndex(s => s.pageIndex === canvasIndex && s.strokeIndex === found.strokeIndex);
                        if (idx === -1) {
                            selectedStrokes.value.push({ pageIndex: canvasIndex, strokeIndex: found.strokeIndex, stroke: found.stroke });
                        } else {
                            selectedStrokes.value.splice(idx, 1);
                        }

                        selectedStroke.value = newSelection; // latest selection

                        // Redraw highlight on latest
                        redrawAllStrokes(canvasIndex);
                        drawSelectionBoundingBox(canvasIndex, found.strokeIndex);
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
                        selectedStrokes.value = [{ pageIndex: canvasIndex, strokeIndex: found.strokeIndex, stroke: found.stroke }];
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
                    redrawAllStrokes(canvasIndex);
                    drawSelectionBoundingBox(canvasIndex, found.strokeIndex);

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
            if (textInput.value) {
                confirmText();
                return;
            }

            const canvasIndex = getCanvasIndexFromEvent(e);

            if (canvasIndex === -1) return;
            
            const canvas = drawingCanvases.value[canvasIndex];
            const pt = getCanvasPointFromEvent(canvas, e);
            if (!pt) return;
            const { x, y, clientX, clientY } = pt;
            
            textPosition.value = { x, y };
            textCanvasIndex.value = canvasIndex;
            textInput.value = '';
            
            // Set textbox position in screen coordinates (relative to viewport)
            // Offset by half the estimated textbox height to center vertically
            textboxPosition.value = {
                x: clientX,
                y: clientY - (fontSize.value / 2) - 10
            };

            stopEvent(e);
            
            // Focus will be handled by the template's text input
            nextTick(() => {
                if (textInputField.value) {
                    textInputField.value.focus();
                    textInputField.value.select();
                }
            });

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
        
        const canvas = drawingCanvases.value[currentCanvasIndex];
        const drawingContext = drawingContexts.value[currentCanvasIndex];
        
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
        
        const pageIndex = currentCanvasIndex + 1;
        if (!strokesPerPage.value[pageIndex]) {
            strokesPerPage.value[pageIndex] = [];
        }
        
        if (shouldErase) {
            eraseAtPoint(lastX, lastY, currentCanvasIndex);
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

        // Text mode doesn't need draw event handling
        if (isTextInputMode.value) return;

        if (isSelectModeActive.value && (isStrokeHovering.value || selectedStroke.value)) {
            // Handle rotation
            if (isRotating.value && selectedStroke.value && (resizeHandle.value === 'rotate' || resizeHandle.value === 'ne')) {
                if (e.pointerId !== activePointerId.value) return;
                const canvas = drawingCanvases.value[currentCanvasIndex];
                const pt = getCanvasPointFromEvent(canvas, e);
                if (!pt) return;
                const currentX = pt.x;
                const currentY = pt.y;
                const pageNumber = currentCanvasIndex + 1;
                const strokes = strokesPerPage.value[pageNumber];
                const stroke = strokes[selectedStroke.value.strokeIndex];
                const first = stroke[0];
                const origFirst = selectedStroke.value.originalStroke[0];
                const center = rotateStartCenter.value || { x: (first.x + (first.x + first.width)) / 2, y: (first.y + (first.y + first.height)) / 2 };
                const currentAngle = Math.atan2(currentY - center.y, currentX - center.x);
                const delta = currentAngle - rotateStartAngle.value;
                first.rotation = (origFirst.rotation || 0) + delta;
                redrawAllStrokes(currentCanvasIndex);
                drawSelectionBoundingBox(currentCanvasIndex, selectedStroke.value.strokeIndex);
                showStrokeMenu.value = false;
                stopEvent(e);
                return;
            }

            // Handle resizing
            if (isResizing.value && selectedStroke.value && resizeHandle.value) {
                if (e.pointerId !== activePointerId.value) return;
                
                const canvas = drawingCanvases.value[currentCanvasIndex];
                const pt = getCanvasPointFromEvent(canvas, e);
                if (!pt) return;
                const currentX = pt.x;
                const currentY = pt.y;
                
                let dx = currentX - dragStartPos.value.x;
                let dy = currentY - dragStartPos.value.y;
                
                const pageNumber = currentCanvasIndex + 1;
                const strokes = strokesPerPage.value[pageNumber];
                const stroke = strokes[selectedStroke.value.strokeIndex];
                
                if (stroke && resizeStartBounds.value) {
                    showStrokeMenu.value = false;
                    const first = stroke[0];
                    const startBounds = resizeStartBounds.value.padded;
                    const startRawBounds = resizeStartBounds.value.raw;
                    const boundsPadding = resizeStartBounds.value.padding ?? 0;
                    if (!startBounds || !startRawBounds) return;
                    
                    // Transform dx/dy into local coordinate space if rotated
                    const angle = first.rotation || 0;
                    if (angle !== 0) {
                        const cosA = Math.cos(-angle);
                        const sinA = Math.sin(-angle);
                        const localDx = dx * cosA - dy * sinA;
                        const localDy = dx * sinA + dy * cosA;
                        dx = localDx;
                        dy = localDy;
                    }
                    
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
                    
                    if (origFirst.type === 'image') {
                        first.x = newRawMinX;
                        first.y = newRawMinY;
                        first.width = newRawMaxX - newRawMinX;
                        first.height = newRawMaxY - newRawMinY;
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
                    } else if (origFirst.type === 'text') {
                        first.x = newRawMinX;
                        first.y = newRawMinY;
                        first.fontSize = Math.max(8, Math.round(origFirst.fontSize * Math.min(scaleXFactor, scaleYFactor)));
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
                    redrawAllStrokes(currentCanvasIndex);
                    drawSelectionBoundingBox(currentCanvasIndex, selectedStroke.value.strokeIndex);
                    showStrokeMenu.value = false;
                }
                
                stopEvent(e);
                return;
            }
            
            // Handle active dragging
            if (isDragging.value && selectedStroke.value) {
                // Only continue with the same pointer that started
                if (e.pointerId !== activePointerId.value) return;
                
                const canvas = drawingCanvases.value[currentCanvasIndex];
                const pt = getCanvasPointFromEvent(canvas, e);
                if (!pt) return;
                const currentX = pt.x;
                const currentY = pt.y;
                
                const dx = currentX - lastX;
                const dy = currentY - lastY;
                
                const pageNumber = currentCanvasIndex + 1;
                const strokes = strokesPerPage.value[pageNumber];

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
                redrawAllStrokes(currentCanvasIndex);
                drawSelectionBoundingBox(currentCanvasIndex, selectedStroke.value.strokeIndex);
                
                lastX = currentX;
                lastY = currentY;

                stopEvent(e);
            }
            // Check if we should start dragging
            else if (isMouseDown.value && selectedStroke.value) {
                if (e.pointerId !== activePointerId.value) return;
                
                const canvas = drawingCanvases.value[currentCanvasIndex];
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
        
        const canvas = drawingCanvases.value[currentCanvasIndex];
        const drawingContext = drawingContexts.value[currentCanvasIndex];
        
        if (!canvas || !drawingContext) return;
        
        const pt = getCanvasPointFromEvent(canvas, e);
        if (!pt) return;
        const currentX = pt.x;
        const currentY = pt.y;
        
        if (shouldErase) {
            eraseAtPoint(currentX, currentY, currentCanvasIndex);
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
        
        // Text mode is handled by confirmText function
        if (isTextInputMode.value) return;

        if (isSelectModeActive.value && (isStrokeHovering.value || isDragging.value || isResizing.value || isRotating.value) && isMouseDown.value && selectedStroke.value) {
            // Only stop if it's the same pointer
            if (e && e.pointerId !== activePointerId.value) return;
            
            const canvas = drawingCanvases.value[currentCanvasIndex];
            if (canvas && e && e.pointerId !== undefined) {
                try {
                    canvas.releasePointerCapture(e.pointerId);
                } catch (err) {
                    // Ignore if capture was already released
                }
            }
            
            const pageNumber = currentCanvasIndex + 1;
            const stroke = strokesPerPage.value[pageNumber][selectedStroke.value.strokeIndex];
            
            // Save to history if resized, dragged, or rotated
            if (isResizing.value || isDragging.value || isRotating.value) {
                const canvas = drawingCanvases.value[currentCanvasIndex];
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
                            const s = strokesPerPage.value[pageNumber][sel.strokeIndex];
                            if (!s) return;
                            strokeChangeCallback({
                                id: s[0].id,
                                type: 'move',
                                page: pageNumber,
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
                            page: pageNumber,
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
                redrawAllStrokes(currentCanvasIndex);
                // Redraw highlight to show final position
                if (selectedStroke.value) {
                    if (Array.isArray(selectedStrokes.value) && selectedStrokes.value.length > 1) {
                        // Update originals for all selections on this canvas
                        selectedStrokes.value.forEach(sel => {
                            if (sel.pageIndex !== currentCanvasIndex) return;
                            const s = strokesPerPage.value[currentCanvasIndex + 1][sel.strokeIndex];
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
                    drawSelectionBoundingBox(currentCanvasIndex, selectedStroke.value.strokeIndex);
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
        const canvas = drawingCanvases.value[currentCanvasIndex];
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
        
        const pageIndex = currentCanvasIndex + 1;
        
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
                strokesPerPage.value[pageIndex].push(newStroke);
            } else {
                const ctx = drawingContexts.value[currentCanvasIndex];
                if (ctx) ctx.putImageData(canvasSnapshot, 0, 0);
            }
            canvasSnapshot = null;
        } else if (isDrawing.value && currentStroke.value.length > 1) {
            newStroke = [...currentStroke.value];
            strokesPerPage.value[pageIndex].push(newStroke);
            currentStroke.value = [];
        } else {
            // Discard single point pen strokes or empty shapes
            currentStroke.value = [];
        }

        if (newStroke) {
            strokeChangeCallback({
                id: currentStrokeId.value,
                type: 'add',
                page: pageIndex,
                stroke: newStroke
            });

            currentStrokeId.value = null;
        }
        
        const drawingContext = drawingContexts.value[currentCanvasIndex];
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
                const canvasIndex = getCanvasIndexFromEvent(e);
                if (canvasIndex !== -1) {
                    const canvas = drawingCanvases.value[canvasIndex];
                    const pt = getCanvasPointFromEvent(canvas, e);
                    
                    if (pt) {
                        const { x, y } = pt;
    
                        // 1. Check stroke hover
                        newStrokeHovering = isAnyStrokeAtPoint(x, y, canvasIndex);
    
                        // 2. Check bounding box & resize handle hover (only if selected stroke is on this page)
                        if (selectedStroke.value && selectedStroke.value.pageIndex === canvasIndex) {
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
                // Map NE to rotate for single-selected strokes (except highlight-rect)
                if (newResizeHandle === 'ne' && selectedStroke.value) {
                    const multiActive = Array.isArray(selectedStrokes.value) && selectedStrokes.value.filter(s => s.pageIndex === getCanvasIndexFromEvent(e)).length > 1;
                    const type = selectedStroke.value.stroke[0]?.type;
                    if (!multiActive && type !== 'highlight-rect') newResizeHandle = 'rotate';
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

    const confirmText = () => {
        if (!textInput.value.trim() || textPosition.value === null || textCanvasIndex.value === -1) {
            cancelText();
            return;
        }

        // Calculate scale factor from canvas to screen to ensure text size matches
        let scale = 1;
        const canvas = drawingCanvases.value[textCanvasIndex.value];
        if (canvas) {
            const rect = canvas.getBoundingClientRect();
            // Use height ratio to determine font scaling
            if (rect.height > 0) {
                scale = canvas.height / rect.height;
            }
        }
        
        const pageIndex = textCanvasIndex.value + 1;
        if (!strokesPerPage.value[pageIndex]) {
            strokesPerPage.value[pageIndex] = [];
        }

        const id = uuid();
        
        const textStroke = [{
            id,
            x: textPosition.value.x,
            y: textPosition.value.y - 4,
            color: drawColor.value,
            thickness: drawThickness.value,
            type: 'text',
            text: textInput.value,
            fontSize: fontSize.value * scale
        }];
        
        strokesPerPage.value[pageIndex].push(textStroke);
        
        strokeChangeCallback({
            id,
            type: 'add',
            page: pageIndex,
            stroke: textStroke
        });
        
        redrawAllStrokes(textCanvasIndex.value);
        
        // Reset text mode
        textInput.value = '';
        textPosition.value = null;
        textCanvasIndex.value = -1;
        textboxPosition.value = null;
    };

    const cancelText = () => {
        textInput.value = '';
        textPosition.value = null;
        textCanvasIndex.value = -1;
        textboxPosition.value = null;
    };

    const resetToolState = () => {
        cancelText();
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
    };

    const changeStrokeColor = (newColor) => {
        if (!selectedStroke.value) return;
        const pageIndex = selectedStroke.value.pageIndex;
        const pageNumber = pageIndex + 1;
        const strokes = strokesPerPage.value[pageNumber];

        const isMulti = Array.isArray(selectedStrokes.value) && selectedStrokes.value.length > 1;
        if (isMulti) {
            // Apply color to all selected strokes on the same page
            selectedStrokes.value.forEach(sel => {
                if (sel.pageIndex !== pageIndex) return;
                const s = strokes[sel.strokeIndex];
                if (!s) return;
                const originalStroke = JSON.parse(JSON.stringify(s));
                for (let point of s) {
                    point.color = newColor;
                }
                strokeChangeCallback({
                    id: s[0].id,
                    type: 'color-change',
                    page: pageNumber,
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
                    page: pageNumber,
                    strokeIndex: selectedStroke.value.strokeIndex,
                    stroke: JSON.parse(JSON.stringify(stroke)),
                    previousStroke: originalStroke
                });
            }
        }

        // Redraw and bbox reflect multi or single
        redrawAllStrokes(pageIndex);
        drawSelectionBoundingBox(pageIndex, selectedStroke.value.strokeIndex);
    };

    const changeStrokeThickness = (newThickness) => {
        if (!selectedStroke.value) return;
        const pageIndex = selectedStroke.value.pageIndex;
        const pageNumber = pageIndex + 1;
        const strokes = strokesPerPage.value[pageNumber];
        const thicknessVal = parseInt(newThickness, 10);

        const isMulti = Array.isArray(selectedStrokes.value) && selectedStrokes.value.length > 1;
        if (isMulti) {
            selectedStrokes.value.forEach(sel => {
                if (sel.pageIndex !== pageIndex) return;
                const s = strokes[sel.strokeIndex];
                if (!s) return;
                const originalStroke = JSON.parse(JSON.stringify(s));
                for (let point of s) {
                    point.thickness = thicknessVal;
                }
                strokeChangeCallback({
                    id: s[0].id,
                    type: 'thickness-change',
                    page: pageNumber,
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
                    page: pageNumber,
                    strokeIndex: selectedStroke.value.strokeIndex,
                    stroke: JSON.parse(JSON.stringify(stroke)),
                    previousStroke: originalStroke
                });
            }
        }

        redrawAllStrokes(pageIndex);
        drawSelectionBoundingBox(pageIndex, selectedStroke.value.strokeIndex);
    };

    const changeStrokeText = (newText) => {
        if (!selectedStroke.value) return;
        const pageIndex = selectedStroke.value.pageIndex;
        const pageNumber = pageIndex + 1;
        const strokes = strokesPerPage.value[pageNumber];

        const isMulti = Array.isArray(selectedStrokes.value) && selectedStrokes.value.length > 1;
        if (isMulti) {
            selectedStrokes.value.forEach(sel => {
                if (sel.pageIndex !== pageIndex) return;
                const s = strokes[sel.strokeIndex];
                if (!s || s[0].type !== 'text') return;
                const originalStroke = JSON.parse(JSON.stringify(s));
                s[0].text = newText;
                strokeChangeCallback({
                    id: s[0].id,
                    type: 'text-change',
                    page: pageNumber,
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
                strokeChangeCallback({
                    id: stroke[0].id,
                    type: 'text-change',
                    page: pageNumber,
                    strokeIndex: selectedStroke.value.strokeIndex,
                    stroke: JSON.parse(JSON.stringify(stroke)),
                    previousStroke: originalStroke
                });
            }
        }

        redrawAllStrokes(pageIndex);
        drawSelectionBoundingBox(pageIndex, selectedStroke.value.strokeIndex);
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
                const pageNumber = pageIdx + 1;
                const strokes = strokesPerPage.value[pageNumber];
                const sorted = [...indices].sort((a, b) => b - a);
                const removals = sorted.map(index => ({ index, data: strokes[index] }));
                // Splice descending to avoid reindexing issues
                sorted.forEach(index => { strokes.splice(index, 1); });
                strokeChangeCallback({
                    id: removals[0]?.data?.[0]?.id,
                    type: 'erase',
                    page: pageNumber,
                    strokes: removals
                });
                redrawAllStrokes(pageIdx);
            });

            selectedStrokes.value = [];
            selectedStroke.value = null;
            showStrokeMenu.value = false;
            return;
        }

        // Single deletion
        const pageNumber = selectedStroke.value.pageIndex + 1;
        const strokes = strokesPerPage.value[pageNumber];
        const stroke = strokes[selectedStroke.value.strokeIndex];
        if (stroke) {
            strokes.splice(selectedStroke.value.strokeIndex, 1);
            strokeChangeCallback({
                id: stroke[0].id,
                type: 'erase',
                page: pageNumber,
                strokes: [{ index: selectedStroke.value.strokeIndex, data: stroke }]
            });
            redrawAllStrokes(selectedStroke.value.pageIndex);
        }
        selectedStroke.value = null;
        showStrokeMenu.value = false;
    };

    const createHighlightRectangle = (pageIndex, rectsOrX, y, width, height) => {
        const pageNumber = pageIndex + 1;
        if (!strokesPerPage.value[pageNumber]) {
            strokesPerPage.value[pageNumber] = [];
        }
        
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
        
        strokesPerPage.value[pageNumber].push(highlightStroke);
        
        strokeChangeCallback({
            id,
            type: 'add',
            page: pageNumber,
            stroke: highlightStroke
        });
        
        redrawAllStrokes(pageIndex);
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
            for (let i = 0; i < drawingCanvases.value.length; i++) {
                const canvas = drawingCanvases.value[i];
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
                    
                    if (!rectsByPage.has(i)) {
                        rectsByPage.set(i, []);
                    }
                    rectsByPage.get(i).push({ x, y, width, height });
                    break;
                }
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
            
            createHighlightRectangle(pageIndex, merged);
        });

        // Clear the text selection
        window.getSelection()?.removeAllRanges();
    };

    const handleStrokeMenu = (e) => {
        if (!isStrokeHovering.value) return;
        
        const canvasIndex = getCanvasIndexFromEvent(e);
        if (canvasIndex === -1) return;
        
        const canvas = drawingCanvases.value[canvasIndex];
        const pt = getCanvasPointFromEvent(canvas, e);
        if (!pt) return;
        const { x, y, clientX, clientY } = pt;
        
        const found = findStrokeAtPoint(x, y, canvasIndex);

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
            redrawAllStrokes(canvasIndex);
            drawSelectionBoundingBox(canvasIndex, found.strokeIndex);
        }
        
        stopEvent(e);
    };

    const boundingBoxColors = {
        default: '#0000ff',
        rotate: '#ff0000'
    };

    const drawSelectionBoundingBox = (canvasIndex, strokeIndex) => {
        const canvas = drawingCanvases.value[canvasIndex];
        const ctx = drawingContexts.value[canvasIndex];
        if (!canvas || !ctx) return;
        
        const pageNumber = canvasIndex + 1;
        const strokes = strokesPerPage.value[pageNumber] || [];
        const multi = Array.isArray(selectedStrokes.value) && selectedStrokes.value.filter(s => s.pageIndex === canvasIndex).length > 1;
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
                if (sel.pageIndex !== canvasIndex) return;
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
            const angle = first.rotation || 0;
            const rotationAllowed = first.type !== 'highlight-rect';
            if (rotationAllowed && angle) {
                // Oriented selection box: compute unrotated bounds and draw in rotated space
                const bLocal = getUnrotatedBounds(stroke, SELECTION_PADDING);
                if (!bLocal) { ctx.restore(); return; }
                const cx = (bLocal.minX + bLocal.maxX) / 2;
                const cy = (bLocal.minY + bLocal.maxY) / 2;
                const w = (bLocal.maxX - bLocal.minX);
                const h = (bLocal.maxY - bLocal.minY);
                ctx.translate(cx, cy);
                ctx.rotate(angle);
                if (shouldDrawBorder) {
                    ctx.strokeRect(bLocal.minX - cx, bLocal.minY - cy, w, h);
                }
                // Single selection: draw rotated handles
                if (!multi) {
                    ctx.setLineDash([]);
                    const handleSize = 8;
                    const handlesLocal = [
                        { x: bLocal.minX - cx, y: bLocal.minY - cy, handle: 'nw' },
                        { x: bLocal.maxX - cx, y: bLocal.minY - cy, handle: 'ne' },
                        { x: bLocal.minX - cx, y: bLocal.maxY - cy, handle: 'sw' },
                        { x: bLocal.maxX - cx, y: bLocal.maxY - cy, handle: 'se' },
                        { x: (bLocal.minX + bLocal.maxX) / 2 - cx, y: bLocal.minY - cy, handle: 'n' },
                        { x: (bLocal.minX + bLocal.maxX) / 2 - cx, y: bLocal.maxY - cy, handle: 's' },
                        { x: bLocal.minX - cx, y: (bLocal.minY + bLocal.maxY) / 2 - cy, handle: 'w' },
                        { x: bLocal.maxX - cx, y: (bLocal.minY + bLocal.maxY) / 2 - cy, handle: 'e' }
                    ];
                    handlesLocal.forEach(h => {
                        if (h.handle === 'ne') {
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
            } else {
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
                    // Rotation availability: single selection and not highlight-rect
                    let rotationAvailable = first.type !== 'highlight-rect';
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
        }
        
        ctx.restore();
    };

    const handleTextboxBlur = () => {
        // Small delay to allow clicking Add button if present
        setTimeout(() => {
            if (textboxPosition.value !== null) {
                confirmText();
            }
        }, 150);
    };

    const clearDrawing = () => {
        strokeChangeCallback({
            type: 'clear',
            previousState: JSON.parse(JSON.stringify(strokesPerPage.value))
        });

        // Clear all drawings on all pages
        for (let i = 0; i < drawingCanvases.value.length; i++) {
            const canvas = drawingCanvases.value[i];
            const ctx = drawingContexts.value[i];
            if (canvas && ctx) {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
            }
        }
        strokesPerPage.value = {};
        currentStroke.value = [];
    };

    const eraseAtPoint = (x, y, canvasIndex) => {
        const eraserRadius = 10;
        const pageNumber = canvasIndex + 1;
        const strokes = strokesPerPage.value[pageNumber] || [];
        
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
            strokesPerPage.value[pageNumber] = keptStrokes;
            strokeChangeCallback({
                id: strokeId,
                type: 'erase',
                page: pageNumber,
                strokes: strokesToRemove
            });
            redrawAllStrokes(canvasIndex);
        }
    };

    const redrawAllStrokes = (pageIndex) => {
        const canvas = drawingCanvases.value[pageIndex];
        const drawingContext = drawingContexts.value[pageIndex];
        if (!canvas || !drawingContext) return;
        
        const pageNumber = pageIndex + 1;
        const strokes = strokesPerPage.value[pageNumber] || [];
        
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
            const selectedIndex = (selectedStroke.value && selectedStroke.value.pageIndex === pageIndex)
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
                    drawingContext.font = `${first.fontSize}px Arial`;
                    drawingContext.fillStyle = first.color;
                    drawingContext.textBaseline = 'top';
                    if (angle) {
                        const b = getStrokeBounds(stroke, 0);
                        const cx = (b.minX + b.maxX) / 2;
                        const cy = (b.minY + b.maxY) / 2;
                        drawingContext.fillText(first.text, first.x - cx, first.y - cy);
                    } else {
                        drawingContext.fillText(first.text, first.x, first.y);
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
                drawSelectionBoundingBox(pageIndex, selectedIndex);
            }
        });
    };

    const captureSelection = () => {
        if (!selectionStart.value || !selectionEnd.value) return;
        
        const canvasIndex = selectionStart.value.canvasIndex;
        const pdfCanvas = pdfCanvases.value[canvasIndex];
        const drawCanvas = drawingCanvases.value[canvasIndex];
        
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
            copiedStroke.value = {
                inserted: 0,
                stroke: [{
                    type: 'image',
                    x: x,
                    y: y,
                    width: selectedWidth,
                    height: selectedHeight,
                    imageData: dataUrl
                }]
            };

            // Redraw to clear the selection rectangle
            redrawAllStrokes(canvasIndex);
            isSelectModeActive.value = true;
        } catch (error) {
            console.error('Error capturing selection:', error);
        }
    };

     const drawImageCanvas = async (src) => {
        strokesPerPage.value = { 1: strokesPerPage.value[1] || [] };
        await nextTick();
        const canvas = pdfCanvases.value[0];
        const drawCanvas = drawingCanvases.value[0];
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
                canvas.style.width = `${canvasWidth}px`;
                canvas.style.height = `${canvasHeight}px`;

                drawCanvas.width = canvasWidth * pixelRatio;
                drawCanvas.height = canvasHeight * pixelRatio;
                drawCanvas.style.width = `${canvasWidth}px`;
                drawCanvas.style.height = `${canvasHeight}px`;

                const ctx = canvas.getContext('2d', { willReadFrequently: true });
                ctx.clearRect(0, 0, canvasWidth * pixelRatio, canvasHeight * pixelRatio);
                ctx.drawImage(img, 0, 0, canvasWidth * pixelRatio, canvasHeight * pixelRatio);

                drawingContexts.value[0] = drawCanvas.getContext('2d', { willReadFrequently: true });
                redrawAllStrokes(0);
                renderedPages.value.add(1);
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
            const canvasIdx = selectedStroke.value.pageIndex;
            const canvas = drawingCanvases.value[canvasIdx];
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
                    const ctx = drawingContexts.value[canvasIdx];
                    if (ctx) {
                        ctx.font = `${first.fontSize}px Arial`;
                        const metrics = ctx.measureText(first.text || '');
                        minX = first.x; minY = first.y;
                        maxX = first.x + metrics.width; maxY = first.y + first.fontSize;
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
        pdfCanvases,
        strokesPerPage,
        currentStroke,
        drawingCanvases,
        drawingContexts,
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
        textInput,
        textInputField,
        textPosition,
        textCanvasIndex,
        fontSize,
        textboxPosition,
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
        confirmText,
        cancelText,
        resetToolState,
        handleTextboxBlur,
        clearDrawing,
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
        copySelectedStroke,
        insertCopiedStroke,
        insertFromClipboard,
        isSelectedStrokeType
    };
}