import { ref, nextTick, computed, watch } from "vue";
import { PDFDocument, rgb } from "pdf-lib";
import { Electron } from "./useElectron";
import { GlobalWorkerOptions, getDocument } from "pdfjs-dist";
import { uuid } from "./useUuid";
import { showModal } from "./useModal";

GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@5.4.449/build/pdf.worker.min.mjs';

export function useFile(emit, loadFileCallback, renderImageFileCallback, lazyLoadCallback, fileSavedCallback, showWhiteboardCallback) {
    const fileId = uuid();

    var pdfDoc = null;

    // Observers
    const intersectionObserver = ref(null);
    const lazyLoadObserver = ref(null);

    // General State Variables
    const fileInput = ref(null);
    const filename = ref(null);
    const filepath = ref(null);
    const pagesContainer = ref(null);
    const renderedPages = ref(new Set());
    const pdfReader = ref(null);
    const pdfCanvases = ref([]); // Reference to PDF canvases for selection capture
    const isFileLoaded = ref(false);
    const originalPdfData = ref(null);

    // Deleted Pages Set
    const deletedPages = ref(new Set());

    // Drawing State Variables
    const strokesPerPage = ref({}); // Store strokes per page
    const drawingCanvases = ref([]); // Array of drawing canvas elements
    const drawingContexts = ref([]); // Array of drawing contexts
    
    // when opening images as a single page
    const imagePage = ref(null);

    // Zoom State Variables
    const zoomPercentage = ref(100); // 25 to 100
    const zoomMode = ref('fit-width'); // 'fit-width' or 'fit-height'

    // Whiteboard State Variables
    const showWhiteboard = ref(false);

    // Saved State Variables
    const fileRecentlySaved = ref(false);
    let savedPdfDoc = null;
    let savedPageCount = 0;
    let savedPageIndex = 0;
    let savedStrokesPerPage = {};
    let savedWidth = 100; // Save page width before entering whiteboard

    // Pagination State Variables
    const pageCount = ref(0);
    const pageIndex = ref(0);
    const pageNum = ref(1);
    const activePages = computed(() => {
        return Array.from({ length: pageCount.value }, (_, i) => i + 1).filter(p => !deletedPages.value.has(p));
    });

    watch(pageIndex, (newIndex) => {
        pageNum.value = newIndex + 1;
        savePageIndexToLocalStorage(filename.value, newIndex);
        scrollToPage();
    });

    const isFirstPage = computed(() => {
        return pageNum.value <= 1;
    });

    const isLastPage = computed(() => {
        return pageNum.value >= (pageCount.value - deletedPages.value.size);
    });

    const resetPdfDoc = () => {
        pdfDoc = null;
    }

    const hasSavedPdfDoc = () => {
        return savedPdfDoc !== null;
    }

    const setupLazyLoadObserver = () => {
        // Clean up existing observer
        if (lazyLoadObserver.value) {
            lazyLoadObserver.value.disconnect();
        }
        
        const options = {
            root: pdfReader.value,
            rootMargin: '200px', // Start loading 200px before entering viewport
            threshold: 0.01
        };
        
        lazyLoadObserver.value = new IntersectionObserver((entries) => {
            entries.forEach(async entry => {
                if (entry.isIntersecting) {
                    const pageNumber = parseInt(entry.target.getAttribute('data-page'));
                    
                    if (!pdfDoc || renderedPages.value.has(pageNumber)) return;
    
                    const page = await pdfDoc.getPage(pageNumber);
                    const viewport = page.getViewport({ scale: 2 });
                    
                    // Get canvas elements
                    const canvas = pdfCanvases.value[pageNumber - 1];
                    const drawCanvas = drawingCanvases.value[pageNumber - 1];
                    
                    if (!canvas || !drawCanvas) return;
                    // Reset inline styles that might have been set in whiteboard mode
                    canvas.style.width = '';
                    canvas.style.height = '';
                    drawCanvas.style.width = '';
                    drawCanvas.style.height = '';
                    
                    const ctx = canvas.getContext("2d");
                    
                    canvas.height = viewport.height;
                    canvas.width = viewport.width;
                    drawCanvas.height = viewport.height;
                    drawCanvas.width = viewport.width;
                    
                    // Initialize drawing context
                    drawingContexts.value[pageNumber - 1] = drawCanvas.getContext('2d');
                    
                    const renderContext = {
                        canvasContext: ctx,
                        viewport,
                    };
                    
                    await page.render(renderContext).promise;
                    renderedPages.value.add(pageNumber);
                    // Repaint saved annotations after PDF render
                    lazyLoadCallback(pageNumber - 1);
                }
            });
        }, options);
        
        // Observe all page containers
        if (pagesContainer.value) {
            const pageContainers = pagesContainer.value.querySelectorAll('.page-container');
            pageContainers.forEach(container => {
                lazyLoadObserver.value.observe(container);
            });
        }
    };

    const setupIntersectionObserver = () => {
        // Clean up existing observer
        if (intersectionObserver.value) {
            intersectionObserver.value.disconnect();
        }
        
        const options = {
            root: pdfReader.value,
            rootMargin: '-45% 0px -45% 0px', // Trigger when middle of viewport
            threshold: 0
        };
        
        intersectionObserver.value = new IntersectionObserver((entries) => {
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
                const page = activePages.value[pageIndex.value];
                if (pageNumber && pageNumber !== page) {
                    pageIndex.value = activePages.value.indexOf(pageNumber);
                    savePageIndexToLocalStorage();
                }
            }
        }, options);
        
        // Observe all page containers
        if (pagesContainer.value) {
            const pageContainers = pagesContainer.value.querySelectorAll('.page-container');
            pageContainers.forEach(container => {
                intersectionObserver.value.observe(container);
            });
        }
    };

    const savePageIndexToLocalStorage = () => {
        localStorage.setItem(filename.value, pageIndex.value);
    }

    const getPageIndexFromLocalStorage = () => {
        const index = localStorage.getItem(filename.value);
        pageIndex.value = index ? Number(index) : 0;
    }

    const getOriginalPageNum = (page) => {
        const deletedArray = Array.from(deletedPages.value).sort((a, b) => a - b);
        deletedArray.forEach(deletedPage => {
            if (deletedPage <= page) {
                page++;
            }
        });
        return page;
    }
    
    const scrollToPage = () => {
        const page = activePages.value[pageIndex.value];
        if (!isFileLoaded.value || deletedPages.value.has(page)) return;

        if (page >= 1 && page <= pageCount.value) {
            const canvasIndex = page - 1;
            const canvas = pdfCanvases.value[canvasIndex];
            if (!canvas) return;
            canvas.scrollIntoView({ block: 'start' });
        }
    };

    // File Loaded Event Emitter
    const emitFileLoadedEvent = (type, page_count) => {
        isFileLoaded.value = true;
        pageCount.value = page_count || 1;
        getPageIndexFromLocalStorage();

        emit('file-loaded', {
            id: fileId,
            filename: filename.value,
            path: filepath.value,
            type,
        });
    };

    const clearSavedState = () => {
        savedPdfDoc = null;
        savedPageCount = 0;
        savedPageIndex = 0;
        savedStrokesPerPage = {};
        savedWidth = 100;
    };

    const updateSavedState = () => {
        savedPdfDoc = pdfDoc;
        savedPageCount = pageCount.value;
        savedPageIndex = pageIndex.value;
        savedStrokesPerPage = JSON.parse(JSON.stringify(strokesPerPage.value));
        savedWidth = zoomPercentage.value;
    };

    const restoreSavedState = () => {
        if (savedPdfDoc) {
            pdfDoc = savedPdfDoc;
            pageCount.value = savedPageCount;
            pageIndex.value = savedPageIndex;
        } else if (imagePage.value) {
            pdfDoc = null;
            pageCount.value = 1;
            pageIndex.value = 0;
        }

        strokesPerPage.value = JSON.parse(JSON.stringify(savedStrokesPerPage));
        zoomPercentage.value = savedWidth; // Restore zoom width
    };

    const renderAllPages = async () => {
        if (showWhiteboard.value) {
            // Whiteboard mode: render single page with background image
            pageCount.value = 1;
            strokesPerPage.value = { 1: strokesPerPage.value[1] || [] };
            await nextTick();
            showWhiteboardCallback();
            return;
        }

        if (imagePage.value) {
            pageCount.value = 1;
            await renderImageFileCallback(imagePage.value);
            return;
        }
        
        if (!pdfDoc) return;
        
        const numPages = pdfDoc.numPages;
        pageCount.value = numPages;
        
        // Initialize strokes for each page
        for (let i = 1; i <= numPages; i++) {
            if (!strokesPerPage.value[i]) {
                strokesPerPage.value[i] = [];
            }
        }

        // Don't render any pages here - let lazy loading handle it
    };

    const loadImageFile = (file) => {
        if (!file) return;

        filename.value = file.name || 'image';
        filepath.value = file.path || null;
        const reader = new FileReader();
        reader.onload = () => {
            loadFileCallback();
            renderedPages.value.clear();
            drawingContexts.value = [];
            showWhiteboard.value = false;
            clearSavedState();
            
            imagePage.value = reader.result;
            strokesPerPage.value = { 1: [] };
            
            emitFileLoadedEvent('image');

            nextTick(() => {
                renderAllPages();
            });
        };
        reader.readAsDataURL(file);
    };

    const renderAllPagesAndSetupObservers = () => {
        // Wait for next tick to ensure refs are populated
        nextTick(() => {
            renderAllPages().then(() => {
                // Setup observers after pages structure is ready
                if (imagePage.value) return;
                setupIntersectionObserver();
                setupLazyLoadObserver();
                scrollToPage();
            });
        });
    };

    const getDocumentCallback = (pdfDoc_) => {
        loadFileCallback();
        strokesPerPage.value = {};
        renderedPages.value.clear();
        drawingContexts.value = [];
        showWhiteboard.value = false;
        clearSavedState();
        pdfDoc = pdfDoc_;
        imagePage.value = null;
        emitFileLoadedEvent('pdf', pdfDoc.numPages);
        renderAllPagesAndSetupObservers();
    }

    const loadPdfFile = (file) => {
        if (file) {
            filename.value = file.name;
            filepath.value = file.path || null;
            const url = URL.createObjectURL(file);
            getDocument(url).promise.then(getDocumentCallback).catch(async error => {
                console.error('Error loading PDF:', error);
                await showModal('Error loading PDF: ' + error.message);
            });
        }
    };

    const loadFile = async (event) => {
        const file = event?.target?.files?.[0] || event;
        
        if (!file) {
            await showModal('Unsupported file type. Please select a PDF or image.');
            return
        };

        if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
            loadPdfFile(file);
        } else if (file.type.startsWith('image/') || file.name.toLowerCase().match(/\.(png|jpe?g|gif|webp|bmp|svg)$/)) {
            loadImageFile(file);
        } else {
            await showModal('Unsupported file type. Please select a PDF or image.');
        }
    };

    const processFileOpenResult =  async (result) => {
        if (!result) return;

        filepath.value = result.filepath;
        
        // Handle PDF files
        if (result.type === 'pdf' && result.encoding === 'base64') {
            filename.value = result.filename || 'document.pdf';
            
            // Convert base64 to Uint8Array
            const binaryString = atob(result.content);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            
            // Store a copy of the original PDF data for saving (avoid detached ArrayBuffer issue)
            originalPdfData.value = new Uint8Array(bytes);
            
            // Load PDF from binary data
            getDocument({ data: bytes }).promise.then(getDocumentCallback).catch(async error => {
                console.error('Error loading PDF:', error);
                await showModal('Error loading PDF: ' + error.message);
            });
        }
        // Handle image files
        else if (result.type === 'image' && result.encoding === 'base64') {
            filename.value = result.filename || 'image';
            const dataUrl = `data:${result.mimeType};base64,${result.content}`;

            loadFileCallback();
            renderedPages.value.clear();
            drawingContexts.value = [];
            showWhiteboard.value = false;
            clearSavedState();
            
            imagePage.value = dataUrl;
            strokesPerPage.value = { 1: [] };
            emitFileLoadedEvent('image');

            nextTick(() => {
                renderAllPages();
            });
        }
        else {
            await showModal('Unsupported file type. Please select a PDF or image.');
        }
    };

    const handleFileOpen = async () => {
        if (Electron.value) {
            const result = await Electron.value.openFile();
            processFileOpenResult(result);
            return;
        }

        if (fileInput.value) {
            fileInput.value.click();
        }
    };

    let saveFileTimeout = null;

    const handleSaveFile = async () => {
        if (!pdfDoc || !isFileLoaded.value) return;

        try {
            // Get the original PDF data
            let arrayBuffer;

            if (originalPdfData.value) {
                // Electron mode - use stored data (convert Uint8Array to ArrayBuffer)
                arrayBuffer = originalPdfData.value.buffer.slice(originalPdfData.value.byteOffset, originalPdfData.value.byteOffset + originalPdfData.value.byteLength);
            } else if (fileInput.value?.files[0]) {
                // Browser mode - read from file input
                const file = fileInput.value.files[0];
                arrayBuffer = await file.arrayBuffer();
            } else {
                console.error('No PDF data available');
                return;
            }
            
            const pdfLibDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });

            // Process each page with annotations
            for (let pageNo = 1; pageNo <= pageCount.value; pageNo++) {
                const strokes = strokesPerPage.value[pageNo];
                if (!strokes || strokes.length === 0) continue;

                const page = pdfLibDoc.getPage(pageNo - 1);
                const { width, height } = page.getSize();

                // Get the canvas dimensions for scaling
                const canvas = pdfCanvases.value[pageNo - 1];
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

                    // Handle text
                    if (first.type === 'text') {
                        const x = first.x * scaleX;
                        const y = height - (first.y * scaleY);
                        const textSize = (first.fontSize || 16) * scaleX;
                        
                        page.drawText(first.text, {
                            x: x,
                            y: y - textSize,
                            size: textSize,
                            color: color
                        });
                    }
                    // Handle shapes
                    else if (first.type === 'line') {
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

            // Remove any pages that were deleted by the user before saving
            if (deletedPages.value && deletedPages.value.size > 0) {
                try {
                    // Convert deleted page numbers to zero-based indexes and sort descending
                    const indices = Array.from(deletedPages.value)
                        .map(p => p - 1)
                        .filter(i => Number.isInteger(i) && i >= 0)
                        .sort((a, b) => b - a);

                    // Remove pages from the PDF document in descending order
                    indices.forEach(idx => {
                        try {
                            if (typeof pdfLibDoc.removePage === 'function') {
                                pdfLibDoc.removePage(idx);
                            }
                        } catch (err) {
                            console.error('Failed to remove page index', idx, err);
                        }
                    });
                } catch (err) {
                    console.error('Error removing deleted pages before save:', err);
                }
            }

            // Save the modified PDF
            const pdfBytes = await pdfLibDoc.save();
            
            // If running in Electron and we have the original filepath, overwrite it
            if (Electron.value && filepath.value) {
                try {
                    // Convert Uint8Array to base64 in chunks to avoid call stack overflow
                    const uint8Array = new Uint8Array(pdfBytes);
                    let base64Content = '';
                    const chunkSize = 8192; // Process 8KB at a time
                    
                    for (let i = 0; i < uint8Array.length; i += chunkSize) {
                        const chunk = uint8Array.subarray(i, Math.min(i + chunkSize, uint8Array.length));
                        base64Content += String.fromCharCode.apply(null, Array.from(chunk));
                    }
                    base64Content = btoa(base64Content);
                    
                    const result = await Electron.value.saveFile(filepath.value, base64Content, 'base64');
                    
                    if (result.success) {
                        console.log('PDF saved successfully to:', result.filepath);
                        fileSavedCallback();
                        fileRecentlySaved.value = true;
                        clearTimeout(saveFileTimeout);
                        saveFileTimeout = setTimeout(() => {
                            fileRecentlySaved.value = false;
                        }, 2000);
                        return;
                    } else {
                        console.error('Electron save failed:', result.error);
                        console.error('Error code:', result.errorCode);
                        await showModal(`Failed to save PDF: ${result.error}\nError code: ${result.errorCode || 'unknown'}\nFalling back to download.`);
                        // Don't throw - fall through to download method
                    }
                } catch (err) {
                    console.error('Error saving with Electron:', err);
                    console.error('Error details:', {
                        message: err.message,
                        stack: err.stack,
                        filepath: filepath.value
                    });
                    await showModal(`Failed to save PDF with Electron: ${err.message}\nFalling back to download.`);
                    // Don't throw - fall through to download method
                }
            }
        
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
                    fileSavedCallback();
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
            fileSavedCallback();
        } catch (error) {
            console.error('Error saving PDF:', error);
            console.error('Error details:', {
                message: error.message,
                stack: error.stack,
                hasElectron: !!Electron.value,
                hasFilepath: !!filepath.value,
                hasPdfData: !!originalPdfData.value
            });
            await showModal('Failed to save PDF: ' + error.message);
        }
    };

    const deletePage = async (index, callback) => {
        const page = activePages.value[index];
        if (!pdfDoc || !page) return;
        
        await showModal(`Are you sure you want to delete page ${page}?`, () => {
            deletedPages.value.add(page);
    
            if (typeof callback !== 'function') return;
            callback({ type: 'delete-page', page });
        });
    };

    return {
        fileId,
        pagesContainer,
        pdfCanvases,
        strokesPerPage,
        drawingCanvases,
        drawingContexts,
        renderedPages,
        pdfReader,
        isFileLoaded,
        originalPdfData,
        fileInput,
        filename,
        filepath,
        imagePage,
        pageCount,
        pageNum,
        pageIndex,
        activePages,
        isFirstPage,
        isLastPage,
        zoomPercentage,
        showWhiteboard,
        zoomMode,
        fileRecentlySaved,
        resetPdfDoc,
        hasSavedPdfDoc,
        emitFileLoadedEvent,
        clearSavedState,
        updateSavedState,
        restoreSavedState,
        renderAllPages,
        loadImageFile,
        loadPdfFile,
        loadFile,
        renderAllPagesAndSetupObservers,
        getDocumentCallback,
        processFileOpenResult,
        handleFileOpen,
        handleSaveFile,
        intersectionObserver,
        lazyLoadObserver,
        setupIntersectionObserver,
        setupLazyLoadObserver,
        scrollToPage,
        savePageIndexToLocalStorage,
        deletedPages,
        deletePage,
    }
}