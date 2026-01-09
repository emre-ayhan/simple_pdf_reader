import { ref, nextTick } from 'vue';
import { uuid } from './useUuid.js';

export function useDraw(pagesContainer, pdfCanvases, renderedPages, strokesPerPage, drawingCanvases, drawingContexts, strokeChangeCallback, captureSelectionCallback) {
    // Drawing variables
    const isDrawing = ref(false);
    const isEraser = ref(false);
    const drawMode = ref('pen'); // 'pen', 'line', 'rectangle', 'circle', 'text'
    const drawColor = ref('blue');
    const drawThickness = ref(2);
    const currentStrokeId = ref(null);
    const currentStroke = ref([]); // Current stroke being drawn
    const enableTouchDrawing = ref(localStorage.getItem('enableTouchDrawing') === 'true');


    const colors = [
        ['black', 'dimgray', 'gray', 'darkgray', 'silver', 'white'],
        ['magenta', 'red', 'orangered', 'orange', 'gold', 'yellow'],
        ['green', 'darkgreen', 'lime', 'teal', 'cyan', 'navy'],
        ['blue', 'darkblue', 'royalblue', 'purple', 'magenta', 'pink'],
        ['brown', 'sienna', 'olive', 'maroon', 'coral', 'salmon']
    ];

    // Text mode variables
    const isTextMode = ref(false);
    const textInput = ref('');
    const textInputField = ref(null);
    const textPosition = ref(null);
    const textCanvasIndex = ref(-1);
    const fontSize = ref(16);
    const textboxPosition = ref(null); // Screen position for the textbox

    // Selection and Whiteboard
    const isSelectionMode = ref(false);
    const selectionStart = ref(null);
    const selectionEnd = ref(null);
    const isSelecting = ref(false);

    // Stroke selection and dragging
    const isDragMode = ref(false);
    const selectedStroke = ref(null); // { pageIndex, strokeIndex, stroke }
    const isDragging = ref(false);
    const dragOffset = ref({ x: 0, y: 0 });
    const dragStartPos = ref(null);
    const showStrokeMenu = ref(false);
    const strokeMenuPosition = ref({ x: 0, y: 0 });
    const isResizing = ref(false);
    const resizeHandle = ref(null); // 'nw', 'ne', 'sw', 'se', 'n', 's', 'e', 'w'
    const resizeStartBounds = ref(null);
    const resizeCursor = ref(null);

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

    const drawShape = (ctx, type, startX, startY, endX, endY) => {
        if (type === 'line') {
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.lineTo(endX, endY);
            ctx.stroke();
        } else if (type === 'rectangle') {
            ctx.strokeRect(startX, startY, endX - startX, endY - startY);
        } else if (type === 'circle') {
            const radius = Math.sqrt(Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2));
            ctx.beginPath();
            ctx.arc(startX, startY, radius, 0, 2 * Math.PI);
            ctx.stroke();
        }
    };

    const isPointNearStroke = (x, y, stroke, threshold = 10) => {
        if (!stroke || stroke.length === 0) return false;
        
        const first = stroke[0];
        
        // Check text strokes
        if (first.type === 'text') {
            const ctx = drawingContexts.value[0];
            if (!ctx) return false;
            ctx.font = `${first.fontSize}px Arial`;
            const metrics = ctx.measureText(first.text);
            const textWidth = metrics.width;
            const textHeight = first.fontSize;
            
            return x >= first.x - threshold && 
                   x <= first.x + textWidth + threshold && 
                   y >= first.y - threshold && 
                   y <= first.y + textHeight + threshold;
        }
        
        // Check shape strokes
        if (first.type === 'line') {
            const dx = first.endX - first.startX;
            const dy = first.endY - first.startY;
            const length = Math.sqrt(dx * dx + dy * dy);
            if (length === 0) return false;
            
            const t = Math.max(0, Math.min(1, ((x - first.startX) * dx + (y - first.startY) * dy) / (length * length)));
            const projX = first.startX + t * dx;
            const projY = first.startY + t * dy;
            const distance = Math.sqrt((x - projX) ** 2 + (y - projY) ** 2);
            return distance < threshold;
        }
        
        if (first.type === 'rectangle') {
            const minX = Math.min(first.startX, first.endX);
            const maxX = Math.max(first.startX, first.endX);
            const minY = Math.min(first.startY, first.endY);
            const maxY = Math.max(first.startY, first.endY);
            
            return x >= minX - threshold && x <= maxX + threshold && 
                   y >= minY - threshold && y <= maxY + threshold &&
                   (x <= minX + threshold || x >= maxX - threshold || 
                    y <= minY + threshold || y >= maxY - threshold);
        }
        
        if (first.type === 'circle') {
            const radius = Math.sqrt((first.endX - first.startX) ** 2 + (first.endY - first.startY) ** 2);
            const distance = Math.sqrt((x - first.startX) ** 2 + (y - first.startY) ** 2);
            return Math.abs(distance - radius) < threshold;
        }
        
        // Check pen strokes
        for (let point of stroke) {
            const distance = Math.sqrt((point.x - x) ** 2 + (point.y - y) ** 2);
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
            } else {
                selectedStroke.value = null;
                redrawAllStrokes(canvasIndex);
            }
        }
        
        return null;
    };

    const getStrokeBounds = (stroke, padding = 5) => {
        if (!stroke || stroke.length === 0) return null;
        
        const first = stroke[0];
        const pad = Math.max(0, padding);
        
        if (first.type === 'text') {
            const ctx = drawingContexts.value[0];
            if (!ctx) return null;
            ctx.font = `${first.fontSize}px Arial`;
            const metrics = ctx.measureText(first.text);
            return {
                minX: first.x - pad,
                minY: first.y - pad,
                maxX: first.x + metrics.width + pad,
                maxY: first.y + first.fontSize + pad
            };
        } else if (first.type === 'line' || first.type === 'rectangle' || first.type === 'circle') {
            if (first.type === 'circle') {
                const radius = Math.sqrt((first.endX - first.startX) ** 2 + (first.endY - first.startY) ** 2);
                return {
                    minX: first.startX - radius - pad,
                    minY: first.startY - radius - pad,
                    maxX: first.startX + radius + pad,
                    maxY: first.startY + radius + pad
                };
            }
            return {
                minX: Math.min(first.startX, first.endX) - pad,
                minY: Math.min(first.startY, first.endY) - pad,
                maxX: Math.max(first.startX, first.endX) + pad,
                maxY: Math.max(first.startY, first.endY) + pad
            };
        } else {
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            for (let point of stroke) {
                minX = Math.min(minX, point.x);
                minY = Math.min(minY, point.y);
                maxX = Math.max(maxX, point.x);
                maxY = Math.max(maxY, point.y);
            }
            return {
                minX: minX - pad,
                minY: minY - pad,
                maxX: maxX + pad,
                maxY: maxY + pad
            };
        }
    };

    const getResizeHandle = (x, y, bounds) => {
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



    const startDrawing = (e) => {
        if (!isDrawing.value && !isEraser.value && !isSelectionMode.value && !isTextMode.value && !isDragMode.value) return;
        
        // Track active pointer type
        activePointerType.value = e.pointerType;
        if (e.pointerType === 'pen') {
            isPenHovering.value = true;
        }

        // Allow touch only when enableTouchDrawing is true
        if (e.pointerType === 'touch' && !enableTouchDrawing.value) return;

        // Generate a new stroke ID
        currentStrokeId.value = uuid();
        
        // Handle drag mode
        if (isDragMode.value) {
            const canvasIndex = getCanvasIndexFromEvent(e);
            if (canvasIndex === -1) return;
            
            const canvas = drawingCanvases.value[canvasIndex];
            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;
            
            const x = (e.clientX - rect.left) * scaleX;
            const y = (e.clientY - rect.top) * scaleY;
            
            // Check if clicking on a resize handle of already selected stroke
            if (selectedStroke.value && selectedStroke.value.pageIndex === canvasIndex) {
                const handlePadding = 5;
                const bounds = getStrokeBounds(selectedStroke.value.stroke, handlePadding);
                const handle = getResizeHandle(x, y, bounds);
                
                if (handle) {
                    // Start resizing
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
                    
                    e.preventDefault();
                    e.stopPropagation();
                    return;
                }
            }
            
            const found = findStrokeAtPoint(x, y, canvasIndex);
            if (found) {
                selectedStroke.value = {
                    ...found,
                    originalStroke: JSON.parse(JSON.stringify(found.stroke)) // Deep clone original
                };
                
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
                
                // Redraw with highlight
                redrawAllStrokes(canvasIndex);
                drawSelectionHighlight(canvasIndex, found.strokeIndex);
            }
            
            e.preventDefault();
            e.stopPropagation();
            return;
        }
        
        // Handle text mode
        if (isTextMode.value) {
            const canvasIndex = getCanvasIndexFromEvent(e);
            if (canvasIndex === -1) return;
            
            const canvas = drawingCanvases.value[canvasIndex];
            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;
            
            const x = (e.clientX - rect.left) * scaleX;
            const y = (e.clientY - rect.top) * scaleY;
            
            textPosition.value = { x, y };
            textCanvasIndex.value = canvasIndex;
            textInput.value = '';
            
            // Set textbox position in screen coordinates (relative to viewport)
            // Offset by half the estimated textbox height to center vertically
            textboxPosition.value = {
                x: e.clientX,
                y: e.clientY - (fontSize.value / 2) - 10
            };
            
            e.preventDefault();
            e.stopPropagation();
            
            // Focus will be handled by the template's text input
            nextTick(() => {
                if (textInputField.value) {
                    textInputField.value.focus();
                    textInputField.value.select();
                }
            });
            return;
        }
        
        // Handle selection mode
        if (isSelectionMode.value) {
            const rect = e.target.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            selectionStart.value = { x, y, canvasIndex: getCanvasIndexFromEvent(e) };
            selectionEnd.value = { x, y };
            isSelecting.value = true;
            isMouseDown.value = true;
            e.preventDefault();
            e.stopPropagation();
            return;
        }
        
        // Check if pen secondary button (barrel button/eraser) is pressed
        // buttons: 1 = primary, 2 = secondary, 32 = eraser button
        const isPenSecondaryButton = e.pointerType === 'pen' && (e.buttons === 2 || e.buttons === 32 || e.button === 5);
        const shouldErase = isEraser.value || isPenSecondaryButton;
        
        // Prevent default to avoid interference with touch/pen
        e.preventDefault();
        e.stopPropagation();
        
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
        
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        
        // Support pointer, touch, and mouse events
        const clientX = e.clientX !== undefined ? e.clientX : (e.touches?.[0]?.clientX || 0);
        const clientY = e.clientY !== undefined ? e.clientY : (e.touches?.[0]?.clientY || 0);
        
        lastX = (clientX - rect.left) * scaleX;
        lastY = (clientY - rect.top) * scaleY;
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
            canvasSnapshot = drawingContext.getImageData(0, 0, canvas.width, canvas.height, { willReadFrequently: true } );
        }
    };

    const draw = (e) => {
        if ((!isDrawing.value && !isEraser.value && !isSelectionMode.value && !isTextMode.value && !isDragMode.value) || !isMouseDown.value) return;
        
        // Text mode doesn't need draw event handling
        if (isTextMode.value) return;
        
        // Handle drag mode - return early to prevent any drawing
        if (isDragMode.value) {
            // Handle resizing
            if (isResizing.value && selectedStroke.value && resizeHandle.value) {
                if (e.pointerId !== activePointerId.value) return;
                
                const canvas = drawingCanvases.value[currentCanvasIndex];
                const rect = canvas.getBoundingClientRect();
                const scaleX = canvas.width / rect.width;
                const scaleY = canvas.height / rect.height;
                
                const currentX = (e.clientX - rect.left) * scaleX;
                const currentY = (e.clientY - rect.top) * scaleY;
                
                const dx = currentX - dragStartPos.value.x;
                const dy = currentY - dragStartPos.value.y;
                
                const pageNumber = currentCanvasIndex + 1;
                const strokes = strokesPerPage.value[pageNumber];
                const stroke = strokes[selectedStroke.value.strokeIndex];
                
                if (stroke && resizeStartBounds.value) {
                    const first = stroke[0];
                    const startBounds = resizeStartBounds.value.padded;
                    const startRawBounds = resizeStartBounds.value.raw;
                    const boundsPadding = resizeStartBounds.value.padding ?? 0;
                    if (!startBounds || !startRawBounds) return;
                    
                    // Calculate new bounds based on resize handle
                    let newMinX = startBounds.minX;
                    let newMinY = startBounds.minY;
                    let newMaxX = startBounds.maxX;
                    let newMaxY = startBounds.maxY;
                    
                    const handle = resizeHandle.value;
                    if (handle.includes('n')) newMinY += dy;
                    if (handle.includes('s')) newMaxY += dy;
                    if (handle.includes('w')) newMinX += dx;
                    if (handle.includes('e')) newMaxX += dx;
                    
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
                    
                    if (origFirst.type === 'text') {
                        first.x = newRawMinX;
                        first.y = newRawMinY;
                        first.fontSize = Math.max(8, Math.round(origFirst.fontSize * Math.min(scaleXFactor, scaleYFactor)));
                    } else if (origFirst.type === 'line' || origFirst.type === 'rectangle' || origFirst.type === 'circle') {
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
                    drawSelectionHighlight(currentCanvasIndex, selectedStroke.value.strokeIndex);
                }
                
                e.preventDefault();
                e.stopPropagation();
                resizeCursor.value = mapHandleToCursor(resizeHandle.value);
                return;
            }
            
            // Handle active dragging
            if (isDragging.value && selectedStroke.value) {
                // Only continue with the same pointer that started
                if (e.pointerId !== activePointerId.value) return;
                
                const canvas = drawingCanvases.value[currentCanvasIndex];
                const rect = canvas.getBoundingClientRect();
                const scaleX = canvas.width / rect.width;
                const scaleY = canvas.height / rect.height;
                
                const currentX = (e.clientX - rect.left) * scaleX;
                const currentY = (e.clientY - rect.top) * scaleY;
                
                const dx = currentX - lastX;
                const dy = currentY - lastY;
                
                // Move the stroke
                const pageNumber = currentCanvasIndex + 1;
                const strokes = strokesPerPage.value[pageNumber];
                const stroke = strokes[selectedStroke.value.strokeIndex];
                
                if (stroke) {
                    const first = stroke[0];
                    
                    // Update stroke positions based on type
                    if (first.type === 'text') {
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
                        // Pen stroke - move all points
                        for (let point of stroke) {
                            point.x += dx;
                            point.y += dy;
                        }
                    }
                    
                    // Redraw to show the drag preview
                    redrawAllStrokes(currentCanvasIndex);
                    drawSelectionHighlight(currentCanvasIndex, selectedStroke.value.strokeIndex);
                }
                
                lastX = currentX;
                lastY = currentY;
                
                e.preventDefault();
                e.stopPropagation();
            }
            // Check if we should start dragging
            else if (isMouseDown.value && selectedStroke.value) {
                if (e.pointerId !== activePointerId.value) return;
                
                const canvas = drawingCanvases.value[currentCanvasIndex];
                const rect = canvas.getBoundingClientRect();
                const scaleX = canvas.width / rect.width;
                const scaleY = canvas.height / rect.height;
                
                const currentX = (e.clientX - rect.left) * scaleX;
                const currentY = (e.clientY - rect.top) * scaleY;
                
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
            
            // Always return when in drag mode to prevent any drawing
            return;
        }
        
        // Handle selection rectangle
        if (isSelectionMode.value && isSelecting.value) {
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
                ctx.strokeStyle = '#ff0000';
                ctx.lineWidth = 1;
                ctx.setLineDash([5, 5]);
                
                const startX = selectionStart.value.x * scaleX;
                const startY = selectionStart.value.y * scaleY;
                const width = (x - selectionStart.value.x) * scaleX;
                const height = (y - selectionStart.value.y) * scaleY;
                
                ctx.strokeRect(startX, startY, width, height);
                ctx.setLineDash([]);
            }
            e.preventDefault();
            e.stopPropagation();
            return;
        }
        
        // Only continue with the same pointer that started
        if (e.pointerId !== activePointerId.value) return;
        
        // Block touch unless touch drawing is enabled
        if (e.pointerType === 'touch' && !enableTouchDrawing.value) return;
        
        // Check if pen secondary button is pressed for erasing
        const isPenSecondaryButton = e.pointerType === 'pen' && (e.buttons === 2 || e.buttons === 32 || e.button === 5);
        const shouldErase = isEraser.value || isPenSecondaryButton;
        
        e.preventDefault();
        e.stopPropagation();
        
        if (currentCanvasIndex === -1) return;
        
        const canvas = drawingCanvases.value[currentCanvasIndex];
        const drawingContext = drawingContexts.value[currentCanvasIndex];
        
        if (!canvas || !drawingContext) return;
        
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        
        const clientX = e.clientX !== undefined ? e.clientX : (e.touches?.[0]?.clientX || 0);
        const clientY = e.clientY !== undefined ? e.clientY : (e.touches?.[0]?.clientY || 0);
        
        const currentX = (clientX - rect.left) * scaleX;
        const currentY = (clientY - rect.top) * scaleY;
        
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
        if (!isDrawing.value && !isEraser.value && !isSelectionMode.value && !isTextMode.value && !isDragMode.value) return;
        
        // Text mode is handled by confirmText function
        if (isTextMode.value) return;
        
        // Handle drag/resize mode completion
        if (isDragMode.value && isMouseDown.value && selectedStroke.value) {
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
            
            // Save to history if resized or dragged
            if (isResizing.value || isDragging.value) {
                const canvas = drawingCanvases.value[currentCanvasIndex];
                const rect = canvas.getBoundingClientRect();
                const scaleX = canvas.width / rect.width;
                const scaleY = canvas.height / rect.height;
                
                const currentX = (e.clientX - rect.left) * scaleX;
                const currentY = (e.clientY - rect.top) * scaleY;
                
                const hasMoved = Math.abs(currentX - dragStartPos.value.x) > 1 || 
                                Math.abs(currentY - dragStartPos.value.y) > 1;
                
                if (hasMoved) {
                    // Save to history with previous state
                    strokeChangeCallback({
                        id: stroke[0].id,
                        type: isResizing.value ? 'resize' : 'move',
                        page: pageNumber,
                        strokeIndex: selectedStroke.value.strokeIndex,
                        stroke: JSON.parse(JSON.stringify(stroke)),
                        previousStroke: selectedStroke.value.originalStroke
                    });
                }
            }
            
            // Redraw without highlight after drag/resize
            if (isDragging.value || isResizing.value) {
                redrawAllStrokes(currentCanvasIndex);
                // Redraw highlight to show final position
                if (selectedStroke.value) {
                    drawSelectionHighlight(currentCanvasIndex, selectedStroke.value.strokeIndex);
                }
            }
            
            isDragging.value = false;
            isResizing.value = false;
            resizeHandle.value = null;
            resizeStartBounds.value = null;
            resizeCursor.value = null;
            isMouseDown.value = false;
            activePointerId.value = null;
            activePointerType.value = null;
            dragStartPos.value = null;
            
            e.preventDefault();
            e.stopPropagation();
            currentCanvasIndex = -1;
            return;
        }
        
        // Handle selection complete
        if (isSelectionMode.value && isSelecting.value && selectionStart.value && selectionEnd.value) {
            captureSelection();
            isSelecting.value = false;
            selectionStart.value = null;
            selectionEnd.value = null;
            isSelectionMode.value = false;
            e.preventDefault();
            e.stopPropagation();
            isMouseDown.value = false;
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
        resizeCursor.value = null;
        
        const pageIndex = currentCanvasIndex + 1;
        
        let newStroke = null;
        if (isDrawing.value && drawMode.value !== 'pen' && canvasSnapshot) {
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
            canvasSnapshot = null;
        } else if (isDrawing.value && currentStroke.value.length > 0) {
            newStroke = [...currentStroke.value];
            strokesPerPage.value[pageIndex].push(newStroke);
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

        // Update cursor when hovering handles in drag mode even before mousedown
        if (isDragMode.value && selectedStroke.value && !isMouseDown.value) {
            const canvasIndex = getCanvasIndexFromEvent(e);
            if (canvasIndex !== -1) {
                const canvas = drawingCanvases.value[canvasIndex];
                const rect = canvas.getBoundingClientRect();
                const scaleX = canvas.width / rect.width;
                const scaleY = canvas.height / rect.height;
                const x = (e.clientX - rect.left) * scaleX;
                const y = (e.clientY - rect.top) * scaleY;
                const bounds = getStrokeBounds(selectedStroke.value.stroke, 5);
                const handle = getResizeHandle(x, y, bounds);
                resizeCursor.value = mapHandleToCursor(handle);
            }
        }

        draw(e);
    };

    const onPointerLeave = (e) => {
        if (e.pointerType === 'pen') {
            isPenHovering.value = false;
        }
        stopDrawing(e);
    };

    const confirmText = () => {
        if (!textInput.value.trim() || textPosition.value === null || textCanvasIndex.value === -1) {
            cancelText();
            return;
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
            fontSize: fontSize.value
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
        isTextMode.value = false;
        isDrawing.value = false;
        isEraser.value = false;
        isSelectionMode.value = false;
        isDragMode.value = false;
        selectedStroke.value = null;
        isDragging.value = false;
        isResizing.value = false;
        resizeHandle.value = null;
        showStrokeMenu.value = false;
    };

    const changeStrokeColor = (newColor) => {
        if (!selectedStroke.value) return;
        
        const pageNumber = selectedStroke.value.pageIndex + 1;
        const strokes = strokesPerPage.value[pageNumber];
        const stroke = strokes[selectedStroke.value.strokeIndex];
        
        if (stroke) {
            const originalStroke = JSON.parse(JSON.stringify(stroke));
            
            // Change color for all points in the stroke
            for (let point of stroke) {
                point.color = newColor;
            }
            
            // Save to history
            strokeChangeCallback({
                id: stroke[0].id,
                type: 'color-change',
                page: pageNumber,
                strokeIndex: selectedStroke.value.strokeIndex,
                stroke: JSON.parse(JSON.stringify(stroke)),
                previousStroke: originalStroke
            });
            
            // Redraw
            redrawAllStrokes(selectedStroke.value.pageIndex);
            drawSelectionHighlight(selectedStroke.value.pageIndex, selectedStroke.value.strokeIndex);
        }
        
        showStrokeMenu.value = false;
    };

    const deleteSelectedStroke = () => {
        if (!selectedStroke.value) return;
        
        const pageNumber = selectedStroke.value.pageIndex + 1;
        const strokes = strokesPerPage.value[pageNumber];
        const stroke = strokes[selectedStroke.value.strokeIndex];
        
        if (stroke) {
            // Remove the stroke
            strokes.splice(selectedStroke.value.strokeIndex, 1);
            
            // Save to history
            strokeChangeCallback({
                id: stroke[0].id,
                type: 'erase',
                page: pageNumber,
                strokes: [{ index: selectedStroke.value.strokeIndex, data: stroke }]
            });
            
            // Redraw
            redrawAllStrokes(selectedStroke.value.pageIndex);
        }
        
        selectedStroke.value = null;
        showStrokeMenu.value = false;
    };

    const handleContextMenu = (e) => {
        if (!isDragMode.value) return;
        
        const canvasIndex = getCanvasIndexFromEvent(e);
        if (canvasIndex === -1) return;
        
        const canvas = drawingCanvases.value[canvasIndex];
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        
        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;
        
        const found = findStrokeAtPoint(x, y, canvasIndex);
        if (found) {
            selectedStroke.value = {
                ...found,
                originalStroke: JSON.parse(JSON.stringify(found.stroke))
            };
            
            // Show context menu
            showStrokeMenu.value = true;
            strokeMenuPosition.value = {
                x: e.clientX,
                y: e.clientY
            };
            
            currentCanvasIndex = canvasIndex;
            
            // Redraw with highlight
            redrawAllStrokes(canvasIndex);
            drawSelectionHighlight(canvasIndex, found.strokeIndex);
        }
        
        e.preventDefault();
        e.stopPropagation();
    };

    const mapHandleToCursor = (handle) => {
        if (!handle) return null;
        if (handle === 'n' || handle === 's') return 'ns-resize';
        if (handle === 'e' || handle === 'w') return 'ew-resize';
        if (handle === 'ne' || handle === 'sw') return 'nesw-resize';
        if (handle === 'nw' || handle === 'se') return 'nwse-resize';
        return null;
    };

    const drawSelectionHighlight = (canvasIndex, strokeIndex) => {
        const canvas = drawingCanvases.value[canvasIndex];
        const ctx = drawingContexts.value[canvasIndex];
        if (!canvas || !ctx) return;
        
        const pageNumber = canvasIndex + 1;
        const strokes = strokesPerPage.value[pageNumber] || [];
        const stroke = strokes[strokeIndex];
        
        if (!stroke || stroke.length === 0) return;
        
        const first = stroke[0];
        
        ctx.save();
        ctx.strokeStyle = '#0066ff';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        
        let minX, minY, maxX, maxY, padding = 5;
        
        if (first.type === 'text') {
            ctx.font = `${first.fontSize}px Arial`;
            const metrics = ctx.measureText(first.text);
            minX = first.x - padding;
            minY = first.y - padding;
            maxX = first.x + metrics.width + padding;
            maxY = first.y + first.fontSize + padding;
            ctx.strokeRect(minX, minY, maxX - minX, maxY - minY);
        } else if (first.type === 'line' || first.type === 'rectangle' || first.type === 'circle') {
            minX = Math.min(first.startX, first.endX);
            maxX = Math.max(first.startX, first.endX);
            minY = Math.min(first.startY, first.endY);
            maxY = Math.max(first.startY, first.endY);
            
            if (first.type === 'circle') {
                const radius = Math.sqrt((first.endX - first.startX) ** 2 + (first.endY - first.startY) ** 2);
                ctx.beginPath();
                ctx.arc(first.startX, first.startY, radius + padding, 0, 2 * Math.PI);
                ctx.stroke();
                minX = first.startX - radius - padding;
                maxX = first.startX + radius + padding;
                minY = first.startY - radius - padding;
                maxY = first.startY + radius + padding;
            } else {
                ctx.strokeRect(minX - padding, minY - padding, maxX - minX + padding * 2, maxY - minY + padding * 2);
            }
        } else {
            // Pen stroke - draw bounding box
            minX = Infinity;
            minY = Infinity;
            maxX = -Infinity;
            maxY = -Infinity;
            for (let point of stroke) {
                minX = Math.min(minX, point.x);
                minY = Math.min(minY, point.y);
                maxX = Math.max(maxX, point.x);
                maxY = Math.max(maxY, point.y);
            }
            ctx.strokeRect(minX - padding, minY - padding, maxX - minX + padding * 2, maxY - minY + padding * 2);
        }
        
        // Draw resize handles
        ctx.setLineDash([]);
        ctx.fillStyle = '#0066ff';
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
        
        handles.forEach(h => {
            ctx.fillRect(h.x - handleSize / 2, h.y - handleSize / 2, handleSize, handleSize);
        });
        
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
        
        strokes.forEach(stroke => {
            if (stroke.length === 0) return;
            
            const first = stroke[0];
            
            // Check if it's text
            if (first.type === 'text') {
                drawingContext.font = `${first.fontSize}px Arial`;
                drawingContext.fillStyle = first.color;
                drawingContext.textBaseline = 'top';
                drawingContext.fillText(first.text, first.x, first.y);
                return;
            }
            
            // Check if it's a shape
            if (first.type === 'line' || first.type === 'rectangle' || first.type === 'circle') {
                drawingContext.strokeStyle = first.color;
                drawingContext.lineWidth = first.thickness;
                drawingContext.lineCap = 'round';
                drawingContext.lineJoin = 'round';
                drawShape(drawingContext, first.type, first.startX, first.startY, first.endX, first.endY)
            } else {
                // It's a pen stroke
                drawingContext.beginPath();
                drawingContext.moveTo(stroke[0].x, stroke[0].y);
                
                for (let i = 1; i < stroke.length; i++) {
                    drawingContext.lineTo(stroke[i].x, stroke[i].y);
                }
                
                drawingContext.strokeStyle = stroke[0].color;
                drawingContext.lineWidth = stroke[0].thickness;
                drawingContext.lineCap = 'round';
                drawingContext.lineJoin = 'round';
                drawingContext.stroke();
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
        const tempCtx = tempCanvas.getContext('2d');
        
        // Draw PDF canvas
        tempCtx.drawImage(pdfCanvas, 0, 0);
        // Draw annotations canvas
        tempCtx.drawImage(drawCanvas, 0, 0);
        
        // Extract selected region
        const selectedCanvas = document.createElement('canvas');
        selectedCanvas.width = selectedWidth;
        selectedCanvas.height = selectedHeight;
        const selectedCtx = selectedCanvas.getContext('2d');
        selectedCtx.drawImage(tempCanvas, x, y, selectedWidth, selectedHeight, 0, 0, selectedWidth, selectedHeight);
        
        // Clear existing strokes and contexts
        captureSelectionCallback(canvasIndex, selectedCanvas);
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

                canvas.width = canvasWidth;
                canvas.height = canvasHeight;
                canvas.style.width = '100%';
                canvas.style.height = 'auto';

                drawCanvas.width = canvasWidth;
                drawCanvas.height = canvasHeight;
                drawCanvas.style.width = '100%';
                drawCanvas.style.height = '100%';

                const ctx = canvas.getContext('2d');
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0, canvasWidth, canvasHeight);

                drawingContexts.value[0] = drawCanvas.getContext('2d');
                redrawAllStrokes(0);
                renderedPages.value.add(1);
            };
            img.src = src;
        }
    }

    return {
        pdfCanvases,
        strokesPerPage,
        currentStroke,
        drawingCanvases,
        drawingContexts,
        isDrawing,
        isEraser,
        drawMode,
        drawColor,
        enableTouchDrawing,
        drawThickness,
        colors,
        isTextMode,
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
        isDragMode,
        selectedStroke,
        isDragging,
            isResizing,
        showStrokeMenu,
        strokeMenuPosition,
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
        deleteSelectedStroke,
        handleContextMenu,
        resizeCursor
    }
}