<script setup>
import { ref, computed, nextTick, onMounted, onUnmounted, markRaw } from "vue";
import { GlobalWorkerOptions, getDocument } from "pdfjs-dist";
import { PDFDocument, rgb } from "pdf-lib";

const pdfCanvases = ref([]);
const fileInput = ref(null);
const filename = ref("PDF Reader");
const pageNum = ref(localStorage.getItem(filename.value) ? Number(localStorage.getItem(filename.value)) : 1);
const pageCount = ref(0);
const scale = 2;
const lockView = ref(false);
const width = ref(100);
const zoomMode = ref('fit-width'); // 'fit-width' or 'fit-height'
const isFileLoaded = ref(false);
const pagesContainer = ref(null);
const pdfReader = ref(null);
let intersectionObserver = null;
let lazyLoadObserver = null;
const renderedPages = ref(new Set());

// History management
const history = ref([]);
const historyStep = ref(-1);
const savedHistoryStep = ref(-1);

const addToHistory = (action) => {
    if (historyStep.value < history.value.length - 1) {
        history.value = history.value.slice(0, historyStep.value + 1);
    }
    history.value.push(markRaw(action));
    historyStep.value++;
};

const undo = () => {
    if (historyStep.value < 0) return;
    
    const action = history.value[historyStep.value];
    console.log('Undo action:', action.type);
    
    if (action.type === 'add') {
        const strokes = strokesPerPage[action.page];
        if (strokes) {
            const index = strokes.indexOf(action.stroke);
            if (index > -1) {
                strokes.splice(index, 1);
            } else {
                console.warn('Stroke not found for undo');
            }
        }
        redrawAllStrokes(action.page - 1);
    } else if (action.type === 'erase') {
        const strokes = strokesPerPage[action.page];
        if (strokes) {
            const toRestore = [...action.strokes].sort((a, b) => a.index - b.index);
            toRestore.forEach(item => {
                strokes.splice(item.index, 0, item.data);
            });
        }
        redrawAllStrokes(action.page - 1);
    } else if (action.type === 'clear') {
        strokesPerPage = JSON.parse(JSON.stringify(action.previousState));
        for (let i = 0; i < drawingCanvases.value.length; i++) {
            redrawAllStrokes(i);
        }
    }
    
    historyStep.value--;
};

const redo = () => {
    if (historyStep.value >= history.value.length - 1) return;
    
    historyStep.value++;
    const action = history.value[historyStep.value];
    
    if (action.type === 'add') {
        if (!strokesPerPage[action.page]) strokesPerPage[action.page] = [];
        strokesPerPage[action.page].push(action.stroke);
        redrawAllStrokes(action.page - 1);
    } else if (action.type === 'erase') {
        const strokes = strokesPerPage[action.page];
        if (strokes) {
            action.strokes.forEach(item => {
                const index = strokes.indexOf(item.data);
                if (index > -1) {
                    strokes.splice(index, 1);
                }
            });
        }
        redrawAllStrokes(action.page - 1);
    } else if (action.type === 'clear') {
        strokesPerPage = {};
        for (let i = 0; i < drawingCanvases.value.length; i++) {
            const canvas = drawingCanvases.value[i];
            const ctx = drawingContexts[i];
            if (canvas && ctx) {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
            }
        }
    }
};

const hasUnsavedChanges = computed(() => {
    return historyStep.value !== savedHistoryStep.value;
});

const colors = [
    ['black', 'dimgray', 'gray', 'darkgray', 'silver', 'white'],
    ['magenta', 'red', 'orangered', 'orange', 'gold', 'yellow'],
    ['green', 'darkgreen', 'lime', 'teal', 'cyan', 'navy'],
    ['blue', 'darkblue', 'royalblue', 'purple', 'magenta', 'pink'],
    ['brown', 'sienna', 'olive', 'maroon', 'coral', 'salmon']
];

// Drawing variables
const isDrawing = ref(false);
const isEraser = ref(false);
const drawMode = ref('pen'); // 'pen', 'line', 'rectangle', 'circle'
const drawColor = ref('blue');
const drawThickness = ref(2);
const drawingCanvases = ref([]);

let drawingContexts = [];
let lastX = 0;
let lastY = 0;
let strokesPerPage = {}; // Store strokes per page
let currentStroke = [];
let startX = 0;
let startY = 0;
let canvasSnapshot = null;
let currentCanvasIndex = -1;

const isMouseDown = ref(false);
const activePointerId = ref(null);
const activePointerType = ref(null);
const isPenHovering = ref(false);

// Custom cursor
const cursorStyle = computed(() => {
    if (!isDrawing.value && !isEraser.value) {
        return 'default';
    }

    if (!isEraser.value && drawMode.value != 'pen') {
        return 'crosshair';
    }

    var svg = isDrawing.value && drawMode.value === 'pen' ? `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="${drawColor.value}" class="bi bi-pencil-fill" viewBox="0 0 16 16">
            <path d="M12.854.146a.5.5 0 0 0-.707 0L10.5 1.793 14.207 5.5l1.647-1.646a.5.5 0 0 0 0-.708zm.646 6.061L9.793 2.5 3.293 9H3.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.207zm-7.468 7.468A.5.5 0 0 1 6 13.5V13h-.5a.5.5 0 0 1-.5-.5V12h-.5a.5.5 0 0 1-.5-.5V11h-.5a.5.5 0 0 1-.5-.5V10h-.5a.5.5 0 0 1-.175-.032l-.179.178a.5.5 0 0 0-.11.168l-2 5a.5.5 0 0 0 .65.65l5-2a.5.5 0 0 0 .168-.11z"/>
        </svg>` : `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-eraser-fill" viewBox="0 0 16 16">
        <path d="M8.086 2.207a2 2 0 0 1 2.828 0l3.879 3.879a2 2 0 0 1 0 2.828l-5.5 5.5A2 2 0 0 1 7.879 15H5.12a2 2 0 0 1-1.414-.586l-2.5-2.5a2 2 0 0 1 0-2.828zm.66 11.34L3.453 8.254 1.914 9.793a1 1 0 0 0 0 1.414l2.5 2.5a1 1 0 0 0 .707.293H7.88a1 1 0 0 0 .707-.293z"/>
        </svg>`;
    const encoded = encodeURIComponent(svg);
    return `url('data:image/svg+xml;utf8,${encoded}') 8 8, auto`;
});

var pdfDoc = null;

GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@5.4.449/build/pdf.worker.min.mjs';

const scrollToPageCanvas = async (pageNumber) => {
    if (!pdfDoc || renderedPages.value.has(pageNumber)) return;
    
    const page = await pdfDoc.getPage(pageNumber);
    const viewport = page.getViewport({ scale });
    
    // Get canvas elements
    const canvas = pdfCanvases.value[pageNumber - 1];
    const drawCanvas = drawingCanvases.value[pageNumber - 1];
    
    if (!canvas || !drawCanvas) return;
    
    const ctx = canvas.getContext("2d");
    
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    drawCanvas.height = viewport.height;
    drawCanvas.width = viewport.width;
    
    // Initialize drawing context
    drawingContexts[pageNumber - 1] = drawCanvas.getContext('2d');
    
    const renderContext = {
        canvasContext: ctx,
        viewport,
    };
    
    await page.render(renderContext).promise;
    renderedPages.value.add(pageNumber);
};

const renderAllPages = async () => {
    if (!pdfDoc) return;
    
    const numPages = pdfDoc.numPages;
    pageCount.value = numPages;
    
    // Initialize strokes for each page
    for (let i = 1; i <= numPages; i++) {
        if (!strokesPerPage[i]) {
            strokesPerPage[i] = [];
        }
    }
    
    // Don't render any pages here - let lazy loading handle it
};

// Scroll to specific page
const scrollToPage = (page) => {
    if (!isFileLoaded.value) return;

    if (page >= 1 && page <= pageCount.value) {
        const pageIndex = page - 1;
        const canvas = pdfCanvases.value[pageIndex];
        if (canvas) {
            canvas.scrollIntoView({ block: 'start' });
            pageNum.value = page;
            localStorage.setItem(filename.value, page);
        }
    }
};

const toggleZoomMode = () => {
    if (!isFileLoaded.value) return;
    const currentPage = pageNum.value;
    const canvas = pdfCanvases.value[currentPage - 1];

    if (zoomMode.value === 'fit-width') {
        zoomMode.value = 'fit-height';
        const margin = scale * 56; // Account for navbar and padding
        width.value = ((pdfReader.value.clientHeight - margin) * 100) / canvas.height;
    } else {
        zoomMode.value = 'fit-width';
        width.value = 100; // Full width
    }
    
    // Restore scroll position to current page after DOM updates
    nextTick(() => {
        scrollToPage(currentPage);
    });
};

// Drawing functions
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

const startDrawing = (e) => {
    if (!isDrawing.value && !isEraser.value) return;
    
    // Track active pointer type
    activePointerType.value = e.pointerType;
    if (e.pointerType === 'pen') {
        isPenHovering.value = true;
    }

    // Only allow pen/stylus and mouse input, not touch
    if (e.pointerType === 'touch') return;
    
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
    const drawingContext = drawingContexts[currentCanvasIndex];
    
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
    if (!strokesPerPage[pageIndex]) {
        strokesPerPage[pageIndex] = [];
    }
    
    if (shouldErase) {
        eraseAtPoint(lastX, lastY, currentCanvasIndex);
    } else if (drawMode.value === 'pen') {
        currentStroke = [{
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
    if ((!isDrawing.value && !isEraser.value) || !isMouseDown.value) return;
    
    // Only continue with the same pointer that started
    if (e.pointerId !== activePointerId.value) return;
    
    // Block touch
    if (e.pointerType === 'touch') return;
    
    // Check if pen secondary button is pressed for erasing
    const isPenSecondaryButton = e.pointerType === 'pen' && (e.buttons === 2 || e.buttons === 32 || e.button === 5);
    const shouldErase = isEraser.value || isPenSecondaryButton;
    
    e.preventDefault();
    e.stopPropagation();
    
    if (currentCanvasIndex === -1) return;
    
    const canvas = drawingCanvases.value[currentCanvasIndex];
    const drawingContext = drawingContexts[currentCanvasIndex];
    
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
        currentStroke.push({
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
        
        if (drawMode.value === 'line') {
            drawingContext.beginPath();
            drawingContext.moveTo(startX, startY);
            drawingContext.lineTo(currentX, currentY);
            drawingContext.stroke();
        } else if (drawMode.value === 'rectangle') {
            drawingContext.strokeRect(startX, startY, currentX - startX, currentY - startY);
        } else if (drawMode.value === 'circle') {
            const radius = Math.sqrt(Math.pow(currentX - startX, 2) + Math.pow(currentY - startY, 2));
            drawingContext.beginPath();
            drawingContext.arc(startX, startY, radius, 0, 2 * Math.PI);
            drawingContext.stroke();
        }
    }
    
    lastX = currentX;
    lastY = currentY;
};

const stopDrawing = (e) => {
    if (!isDrawing.value && !isEraser.value) return;
    
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
            type: drawMode.value,
            startX,
            startY,
            endX: lastX,
            endY: lastY,
            color: drawColor.value,
            thickness: drawThickness.value
        };
        newStroke = [shape];
        strokesPerPage[pageIndex].push(newStroke);
        canvasSnapshot = null;
    } else if (isDrawing.value && currentStroke.length > 0) {
        newStroke = [...currentStroke];
        strokesPerPage[pageIndex].push(newStroke);
        currentStroke = [];
    }

    if (newStroke) {
        addToHistory({
            type: 'add',
            page: pageIndex,
            stroke: newStroke
        });
    }
    
    const drawingContext = drawingContexts[currentCanvasIndex];
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

const clearDrawing = () => {
    addToHistory({
        type: 'clear',
        previousState: JSON.parse(JSON.stringify(strokesPerPage))
    });

    // Clear all drawings on all pages
    for (let i = 0; i < drawingCanvases.value.length; i++) {
        const canvas = drawingCanvases.value[i];
        const ctx = drawingContexts[i];
        if (canvas && ctx) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
    }
    strokesPerPage = {};
    currentStroke = [];
};

const redrawAllStrokes = (pageIndex) => {
    const canvas = drawingCanvases.value[pageIndex];
    const drawingContext = drawingContexts[pageIndex];
    if (!canvas || !drawingContext) return;
    
    const pageNumber = pageIndex + 1;
    const strokes = strokesPerPage[pageNumber] || [];
    
    drawingContext.clearRect(0, 0, canvas.width, canvas.height);
    
    strokes.forEach(stroke => {
        if (stroke.length === 0) return;
        
        const first = stroke[0];
        
        // Check if it's a shape
        if (first.type === 'line' || first.type === 'rectangle' || first.type === 'circle') {
            drawingContext.strokeStyle = first.color;
            drawingContext.lineWidth = first.thickness;
            drawingContext.lineCap = 'round';
            drawingContext.lineJoin = 'round';
            
            if (first.type === 'line') {
                drawingContext.beginPath();
                drawingContext.moveTo(first.startX, first.startY);
                drawingContext.lineTo(first.endX, first.endY);
                drawingContext.stroke();
            } else if (first.type === 'rectangle') {
                drawingContext.strokeRect(first.startX, first.startY, first.endX - first.startX, first.endY - first.startY);
            } else if (first.type === 'circle') {
                const radius = Math.sqrt(Math.pow(first.endX - first.startX, 2) + Math.pow(first.endY - first.startY, 2));
                drawingContext.beginPath();
                drawingContext.arc(first.startX, first.startY, radius, 0, 2 * Math.PI);
                drawingContext.stroke();
            }
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

const eraseAtPoint = (x, y, canvasIndex) => {
    const eraserRadius = 10;
    const pageNumber = canvasIndex + 1;
    const strokes = strokesPerPage[pageNumber] || [];
    
    const strokesToRemove = [];
    const keptStrokes = [];
    
    strokes.forEach((stroke, index) => {
        let shouldRemove = false;
        for (let point of stroke) {
            const distance = Math.sqrt(Math.pow(point.x - x, 2) + Math.pow(point.y - y, 2));
            if (distance < eraserRadius) {
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
        strokesPerPage[pageNumber] = keptStrokes;
        addToHistory({
            type: 'erase',
            page: pageNumber,
            strokes: strokesToRemove
        });
        redrawAllStrokes(canvasIndex);
    }
};

const loadPdfDocument = () => {
    const file = fileInput.value.files[0];

    if (file) {
        filename.value = file.name;
        const url = URL.createObjectURL(file);
        getDocument(url).promise.then((pdfDoc_) => {
            pdfDoc = pdfDoc_;
            pageCount.value = pdfDoc.numPages;
            pageNum.value = localStorage.getItem(filename.value) ? Number(localStorage.getItem(filename.value)) : 1;
            isFileLoaded.value = true;
            
            // Reset history
            history.value = [];
            historyStep.value = -1;
            savedHistoryStep.value = -1;
            strokesPerPage = {};
            
            // Wait for next tick to ensure refs are populated
            nextTick(() => {
                renderAllPages().then(() => {
                    // Setup observers after pages structure is ready
                    setupIntersectionObserver();
                    setupLazyLoadObserver();
                    // Scroll to saved page
                    const savedPage = localStorage.getItem(filename.value);
                    if (savedPage) {
                        scrollToPage(Number(savedPage));
                    }
                });
            });
        });
    }
};

const setupLazyLoadObserver = () => {
    // Clean up existing observer
    if (lazyLoadObserver) {
        lazyLoadObserver.disconnect();
    }
    
    const options = {
        root: pdfReader.value,
        rootMargin: '200px', // Start loading 200px before entering viewport
        threshold: 0.01
    };
    
    lazyLoadObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const pageNumber = parseInt(entry.target.getAttribute('data-page'));
                if (pageNumber) {
                    scrollToPageCanvas(pageNumber);
                }
            }
        });
    }, options);
    
    // Observe all page containers
    if (pagesContainer.value) {
        const pageContainers = pagesContainer.value.querySelectorAll('.page-container');
        pageContainers.forEach(container => {
            lazyLoadObserver.observe(container);
        });
    }
};

const setupIntersectionObserver = () => {
    // Clean up existing observer
    if (intersectionObserver) {
        intersectionObserver.disconnect();
    }
    
    const options = {
        root: pdfReader.value,
        rootMargin: '-45% 0px -45% 0px', // Trigger when middle of viewport
        threshold: 0
    };
    
    intersectionObserver = new IntersectionObserver((entries) => {
        // Find the most visible page
        let maxRatio = 0;
        let mostVisiblePage = null;
        
        entries.forEach(entry => {
            if (entry.isIntersecting && entry.intersectionRatio > maxRatio) {
                maxRatio = entry.intersectionRatio;
                mostVisiblePage = entry.target;
            }
        });
        
        if (mostVisiblePage) {
            const pageNumber = parseInt(mostVisiblePage.getAttribute('data-page'));
            if (pageNumber && pageNumber !== pageNum.value) {
                pageNum.value = pageNumber;
                localStorage.setItem(filename.value, pageNumber);
            }
        }
    }, options);
    
    // Observe all page containers
    if (pagesContainer.value) {
        const pageContainers = pagesContainer.value.querySelectorAll('.page-container');
        pageContainers.forEach(container => {
            intersectionObserver.observe(container);
        });
    }
};

const saveFile = async () => {
    if (!pdfDoc || !fileInput.value.files[0]) return;

    try {
        // Read the original PDF file
        const file = fileInput.value.files[0];
        const arrayBuffer = await file.arrayBuffer();
        const pdfLibDoc = await PDFDocument.load(arrayBuffer);

        // Process each page with annotations
        for (let pageNum = 1; pageNum <= pageCount.value; pageNum++) {
            const strokes = strokesPerPage[pageNum];
            if (!strokes || strokes.length === 0) continue;

            const page = pdfLibDoc.getPage(pageNum - 1);
            const { width, height } = page.getSize();

            // Get the canvas dimensions for scaling
            const canvas = pdfCanvases.value[pageNum - 1];
            if (!canvas) continue;

            const scaleX = width / canvas.width;
            const scaleY = height / canvas.height;

            // Draw each stroke on the PDF
            strokes.forEach(stroke => {
                if (stroke.length === 0) return;

                const first = stroke[0];

                // Convert color string to RGB
                const colorMap = {
                    'black': [0, 0, 0], 'dimgray': [0.41, 0.41, 0.41], 'gray': [0.5, 0.5, 0.5],
                    'darkgray': [0.66, 0.66, 0.66], 'silver': [0.75, 0.75, 0.75], 'white': [1, 1, 1],
                    'magenta': [1, 0, 1], 'red': [1, 0, 0], 'orangered': [1, 0.27, 0],
                    'orange': [1, 0.65, 0], 'gold': [1, 0.84, 0], 'yellow': [1, 1, 0],
                    'green': [0, 0.5, 0], 'darkgreen': [0, 0.39, 0], 'lime': [0, 1, 0],
                    'teal': [0, 0.5, 0.5], 'cyan': [0, 1, 1], 'navy': [0, 0, 0.5],
                    'blue': [0, 0, 1], 'darkblue': [0, 0, 0.55], 'royalblue': [0.25, 0.41, 0.88],
                    'purple': [0.5, 0, 0.5], 'pink': [1, 0.75, 0.8],
                    'brown': [0.65, 0.16, 0.16], 'sienna': [0.63, 0.32, 0.18],
                    'olive': [0.5, 0.5, 0], 'maroon': [0.5, 0, 0], 'coral': [1, 0.5, 0.31],
                    'salmon': [0.98, 0.5, 0.45]
                };

                const getColor = (colorName) => {
                    const rgbArray = colorMap[colorName] || [0, 0, 0];
                    return rgb(rgbArray[0], rgbArray[1], rgbArray[2]);
                };

                const color = getColor(first.color);
                const thickness = (first.thickness || 2) * scaleX;

                // Handle shapes
                if (first.type === 'line') {
                    const startX = first.startX * scaleX;
                    const startY = height - (first.startY * scaleY);
                    const endX = first.endX * scaleX;
                    const endY = height - (first.endY * scaleY);

                    page.drawLine({
                        start: { x: startX, y: startY },
                        end: { x: endX, y: endY },
                        thickness: thickness,
                        color: color,
                        opacity: 1
                    });
                } else if (first.type === 'rectangle') {
                    const x = first.startX * scaleX;
                    const y = height - (first.startY * scaleY);
                    const w = (first.endX - first.startX) * scaleX;
                    const h = (first.endY - first.startY) * scaleY;

                    page.drawRectangle({
                        x: x,
                        y: y - h,
                        width: w,
                        height: h,
                        borderColor: color,
                        borderWidth: thickness,
                        opacity: 0
                    });
                } else if (first.type === 'circle') {
                    const centerX = first.startX * scaleX;
                    const centerY = height - (first.startY * scaleY);
                    const radius = Math.sqrt(
                        Math.pow((first.endX - first.startX) * scaleX, 2) +
                        Math.pow((first.endY - first.startY) * scaleY, 2)
                    );

                    page.drawCircle({
                        x: centerX,
                        y: centerY,
                        size: radius,
                        borderColor: color,
                        borderWidth: thickness,
                        opacity: 0
                    });
                } else if (first.type === 'pen') {
                    // Draw pen strokes as connected lines
                    for (let i = 0; i < stroke.length - 1; i++) {
                        const point1 = stroke[i];
                        const point2 = stroke[i + 1];

                        const x1 = point1.x * scaleX;
                        const y1 = height - (point1.y * scaleY);
                        const x2 = point2.x * scaleX;
                        const y2 = height - (point2.y * scaleY);

                        page.drawLine({
                            start: { x: x1, y: y1 },
                            end: { x: x2, y: y2 },
                            thickness: (point1.thickness || 2) * scaleX,
                            color: getColor(point1.color),
                            opacity: 1
                        });
                    }
                }
            });
        }

        // Save the modified PDF
        const pdfBytes = await pdfLibDoc.save();
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        
        // Try to use File System Access API if available (Chrome/Edge)
        if ('showSaveFilePicker' in window) {
            try {
                const handle = await window.showSaveFilePicker({
                    suggestedName: filename.value,
                    types: [{
                        description: 'PDF Files',
                        accept: { 'application/pdf': ['.pdf'] }
                    }]
                });
                const writable = await handle.createWritable();
                await writable.write(pdfBytes);
                await writable.close();
                console.log('PDF saved successfully with annotations to:', handle.name);
                savedHistoryStep.value = historyStep.value;
                return;
            } catch (err) {
                if (err.name === 'AbortError') {
                    console.log('Save cancelled by user');
                    return;
                }
                console.warn('File System Access API failed, falling back to download:', err);
            }
        }
        
        // Fallback: use download method
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename.value;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        console.log('PDF downloaded with annotations');
        savedHistoryStep.value = historyStep.value;
    } catch (error) {
        console.error('Error saving PDF:', error);
        alert('Failed to save PDF. Please try again.');
    }
};

onMounted(() => {
    scrollToPage(pageNum.value);
});

onUnmounted(() => {
    if (intersectionObserver) {
        intersectionObserver.disconnect();
    }
    if (lazyLoadObserver) {
        lazyLoadObserver.disconnect();
    }
});
</script>
<template>
    <div class="container-fluid bg-dark" @contextmenu.prevent>
        <nav class="navbar navbar-expand navbar-dark bg-dark fixed-top">
            <div class="container">
                <!-- Filename -->
                <a class="navbar-brand" href="#" @click.prevent>{{ filename }}</a>

                <!-- Toolbar -->
                <ul class="navbar-nav mx-auto">
                    <!-- Drawing -->
                     <li class="nav-item">
                        <a class="nav-link" href="#" @click.prevent="(isDrawing = false, isEraser = false)" :class="{ disabled: !isFileLoaded, active: !isDrawing && !isEraser && isFileLoaded }" title="Clear All Drawing">
                            <i class="bi bi-mouse2-fill"></i>
                        </a>
                    </li>
                    <li class="nav-item btn-group">
                        <a class="nav-link" href="#" @click.prevent="isFileLoaded && (isDrawing = !isDrawing, isEraser = false, drawMode = 'pen')" :class="{ disabled: !isFileLoaded }" :style="{ color: isDrawing && drawMode === 'pen' ? drawColor : '' }">
                            <i class="bi bi-pencil-fill"></i>
                        </a>
                        <a class="nav-link dropdown-toggle dropdown-toggle-split" href="#" role="button" data-bs-toggle="dropdown" data-bs-auto-close="outside" aria-expanded="false" :class="{ disabled: !isFileLoaded }"></a>
                        <div class="dropdown-menu dropdown-menu-dark p-3">
                            <div class="mb-3">
                                <label class="form-label">Color</label>
                                <template v-for="(colorGroup, groupIndex) in colors">
                                    <div class="d-flex gap-2 mb-2">
                                        <div v-for="(color, colorIndex) in colorGroup" :key="`color-${groupIndex}-${colorIndex}`">
                                            <input type="radio" class="btn-check" name="colors" :id="`color-${groupIndex}-${colorIndex}`" autocomplete="off" v-model="drawColor" :value="color" />
                                            <label class="btn border rounded-circle p-3" :for="`color-${groupIndex}-${colorIndex}`" :title="color" :style="{ backgroundColor: color }" ></label>
                                        </div>
                                    </div>
                                </template>
                                <div class="mb-2">
                                    <svg width="100%" height="40" viewBox="0 0 200 40" preserveAspectRatio="none">
                                        <path 
                                            d="M 0,20 Q 25,5 50,20 T 100,20 T 150,20 T 200,20" 
                                            fill="none" 
                                            :stroke="drawColor" 
                                            :stroke-width="drawThickness" 
                                            stroke-linecap="round"
                                        />
                                    </svg>
                                </div>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">Thickness</label>
                                <div class="d-flex align-items-center">
                                    <input type="range" class="form-range" min="1" max="10" v-model="drawThickness" />
                                    <input type="text" class="form-control-plaintext" min="1" max="10" v-model="drawThickness" readonly />
                                </div>
                            </div>
                            <button class="btn btn-sm btn-danger w-100" @click="clearDrawing()">Clear All Drawing</button>
                        </div>
                    </li>
                    <li class="nav-item">
                        <a class="nav-link" href="#" @click.prevent="isFileLoaded && (isEraser = !isEraser, isDrawing = false)" :class="{ active: isEraser, disabled: !isFileLoaded }">
                            <i class="bi bi-eraser-fill"></i>
                        </a>
                    </li>
                    <li class="nav-item">
                        <a class="nav-link" href="#" @click.prevent="isFileLoaded && (isDrawing = true, isEraser = false, drawMode = 'line')" :class="{ active: drawMode === 'line', disabled: !isFileLoaded }" title="Line">
                            <i class="bi bi-slash-lg"></i>
                        </a>
                    </li>
                    <li class="nav-item">
                        <a class="nav-link" href="#" @click.prevent="isFileLoaded && (isDrawing = true, isEraser = false, drawMode = 'rectangle')" :class="{ active: drawMode === 'rectangle', disabled: !isFileLoaded }" title="Rectangle">
                            <i class="bi bi-square"></i>
                        </a>
                    </li>
                    <li class="nav-item">
                        <a class="nav-link" href="#" @click.prevent="isFileLoaded && (isDrawing = true, isEraser = false, drawMode = 'circle')" :class="{ active: drawMode === 'circle', disabled: !isFileLoaded }" title="Circle">
                            <i class="bi bi-circle"></i>
                        </a>
                    </li>
                    <li class="nav-item vr bg-white mx-2"></li>
                    <!-- Undo/Redo -->
                    <li class="nav-item">
                        <a class="nav-link" href="#" @click.prevent="undo()" :class="{ disabled: !isFileLoaded || historyStep < 0 }" title="Undo">
                            <i class="bi bi-arrow-counterclockwise"></i>
                        </a>
                    </li>
                    <li class="nav-item">
                        <a class="nav-link" href="#" @click.prevent="redo()" :class="{ disabled: !isFileLoaded || historyStep >= history.length - 1 }" title="Redo">
                            <i class="bi bi-arrow-clockwise"></i>
                        </a>
                    </li>
                    <li class="nav-item vr bg-white mx-2"></li>
                    <!-- Pagination -->
                    <li class="nav-item">
                        <a href="#" class="nav-link" @click.prevent="scrollToPage(1)" :class="{ disabled: !isFileLoaded || pageNum <= 1 }">
                            <i class="bi bi-chevron-double-left"></i>
                        </a>
                    </li>
                    <li class="nav-item">
                        <a href="#" class="nav-link" @click.prevent="scrollToPage(pageNum - 1)" :class="{ disabled: !isFileLoaded || pageNum <= 1 }">
                            <i class="bi bi-chevron-left"></i>
                        </a>
                    </li>
                    <li class="nav-item">
                        <input type="text" class="form-control-plaintext" :value="pageNum" @input="scrollToPage($event.target.value)" :disabled="!isFileLoaded" />
                    </li>
                    <li class="nav-item">
                        <a href="#" class="nav-link" @click.prevent="scrollToPage(pageNum + 1)" :class="{ disabled: !isFileLoaded || pageNum >= pageCount }">
                            <i class="bi bi-chevron-right"></i>
                        </a>
                    </li>
                    <li class="nav-item">
                        <a href="#" class="nav-link" @click.prevent="scrollToPage(pageCount)" :class="{ disabled: !isFileLoaded || pageNum >= pageCount }">
                            <i class="bi bi-chevron-double-right"></i>
                        </a>
                    </li>
                    <li class="nav-item vr bg-white mx-2"></li>
                    <!-- Zoom -->
                    <li class="nav-item">
                        <a href="#" class="nav-link" @click.prevent="isFileLoaded && (width = Math.max(width - 10, 25))" :class="{ disabled: !isFileLoaded || lockView }">
                            <i class="bi bi-zoom-out"></i>
                        </a>
                    </li>
                    <li class="nav-item">
                        <input type="text" class="form-control-plaintext" v-model="width" :disabled="!isFileLoaded || lockView">
                    </li>
                    <li class="nav-item">
                        <a href="#" class="nav-link" @click.prevent="isFileLoaded && (width = Math.min(width + 10, 100))" :class="{ disabled: !isFileLoaded || lockView }">
                            <i class="bi bi-zoom-in"></i>
                        </a>
                    </li>
                    <li class="nav-item">
                        <a href="#" class="nav-link" @click.prevent="toggleZoomMode()" :class="{ disabled: !isFileLoaded || lockView }" :title="zoomMode === 'fit-width' ? 'Fit Height' : 'Fit Width'">
                            <i :class="`bi ${zoomMode === 'fit-width' ? 'bi-arrows-vertical' : 'bi-arrows-expand'}`"></i>
                        </a>
                    </li>
                </ul>

                <!-- Menu -->
                <ul class="navbar-nav">
                    <li class="nav-item" :title="lockView ? 'Unlock View' : 'Lock View'">
                        <a href="#" class="nav-link" @click.prevent="isFileLoaded && (lockView = !lockView)" :class="{ disabled: !isFileLoaded }">
                            <i class="bi" :class="lockView ? 'bi-lock-fill' : 'bi-lock'"></i>
                        </a>
                    </li>
                    <li class="nav-item" title="Save File">
                        <a href="#" class="nav-link" @click.prevent="saveFile" :class="{ disabled: !isFileLoaded || !hasUnsavedChanges }">
                            <i class="bi bi-floppy-fill"></i>
                        </a>
                    </li>
                    <li class="nav-item" :title="isFileLoaded ? 'Open Another PDF' : 'Open PDF'">
                        <a href="#" class="nav-link" @click.prevent="fileInput.click()">
                            <i class="bi bi-file-earmark-pdf-fill"></i>
                        </a>
                    </li>
                </ul>
            </div>
        </nav>
        <div class="pdf-reader" ref="pdfReader" :class="{ 'overflow-hidden': lockView }">
            <div class="pages-container" ref="pagesContainer" :style="{ width: `${width}%` }">
                <div v-for="page in pageCount" :key="page" class="page-container" :data-page="page">
                    <div class="canvas-container" :class="{ 'canvas-loading': !renderedPages.has(page) }">
                        <canvas class="pdf-canvas" :ref="el => { if (el) pdfCanvases[page - 1] = el }"></canvas>
                        <canvas 
                            :ref="el => { if (el) drawingCanvases[page - 1] = el }"
                            class="drawing-canvas"
                            @pointerdown="startDrawing"
                            @pointermove="onPointerMove"
                            @pointerup="stopDrawing"
                            @pointerleave="onPointerLeave"
                            @pointercancel="stopDrawing"
                            :style="{ 
                                cursor: cursorStyle,
                                pointerEvents: 'auto',
                                touchAction: lockView || isPenHovering ? 'none' : 'pan-y pan-x'
                            }"
                        ></canvas>
                    </div>
                </div>
            </div>
        </div>
        <input ref="fileInput" type="file"  accept="application/pdf" class="d-none" @change="loadPdfDocument" />
    </div>
</template>
<style>
body, #app, .container-fluid {
    margin: 0;
    padding: 0;
    overflow: hidden;
}

.pdf-reader {
    margin-top: 56px;
    width: 100%;
    height: calc(100vh - 56px);
    background-color: var(--bs-secondary);
    overflow: auto;
    display: flex;
    justify-content: center;
    touch-action: pan-y pan-x;
}

.pdf-reader.overflow-hidden {
    touch-action: none;
}

.pages-container {
    display: flex;
    flex-direction: column;
    gap: 20px;
    padding: 20px 0;
}

.page-container {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    width: 100%;
}

.page-number {
    color: var(--bs-light);
    font-size: 14px;
    font-weight: 500;
    background-color: rgba(0, 0, 0, 0.5);
    padding: 5px 15px;
    border-radius: 20px;
}

.form-control-plaintext {
    width: 50px !important;
    text-align: center;
    color: var(--bs-light) !important;
    border: none;
    background-color: transparent;
}

.form-control-plaintext:disabled {
    color: var(--bs-secondary) !important;
}

.canvas-container {
    position: relative;
    display: inline-block;
    touch-action: pan-y pan-x;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    background-color: white;
    width: 100%;
}

.canvas-container.canvas-loading {
    min-height: 800px;
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
}

.canvas-container.canvas-loading::after {
    content: 'Loading...';
    color: #999;
    font-size: 16px;
    position: absolute;
}

.pdf-canvas {
    width: 100%;
    height: auto;
    display: block;
}

.drawing-canvas {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: auto;
}
</style>