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
    const enableTouchDrawing = ref(false);


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



    const startDrawing = (e) => {
        if (!isDrawing.value && !isEraser.value && !isSelectionMode.value && !isTextMode.value) return;
        
        // Track active pointer type
        activePointerType.value = e.pointerType;
        if (e.pointerType === 'pen') {
            isPenHovering.value = true;
        }

        // Allow touch only when enableTouchDrawing is true
        if (e.pointerType === 'touch' && !enableTouchDrawing.value) return;

        // Generate a new stroke ID
        currentStrokeId.value = uuid();
        
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
        if ((!isDrawing.value && !isEraser.value && !isSelectionMode.value && !isTextMode.value) || !isMouseDown.value) return;
        
        // Text mode doesn't need draw event handling
        if (isTextMode.value) return;
        
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
        if (!isDrawing.value && !isEraser.value && !isSelectionMode.value && !isTextMode.value) return;
        
        // Text mode is handled by confirmText function
        if (isTextMode.value) return;
        
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
        drawImageCanvas
    }
}