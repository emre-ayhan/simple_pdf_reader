import { ref } from "vue";

export function usePagination(pdfCanvases, pdfReader, isFileLoaded, filename, scrollToPageCanvaCallback) {
    const pagesContainer = ref(null);
    const pageCount = ref(0);
    const pageNum = ref(1);
    const renderedPages = ref(new Set());
    const intersectionObserver = ref(null);
    const lazyLoadObserver = ref(null);
    
    const savePageToLocalStorage = () => {
        localStorage.setItem(filename.value, pageNum.value);
    }

    const getPageFromLocalStorage = () => {
        const page = localStorage.getItem(filename.value);
        return page ? Number(page) : 1;
    }
    
    const scrollToPage = (page) => {
        if (!isFileLoaded.value) return;

        if (page >= 1 && page <= pageCount.value) {
            const pageIndex = page - 1;
            const canvas = pdfCanvases.value[pageIndex];
            if (canvas) {
                canvas.scrollIntoView({ block: 'start' });
                pageNum.value = page;
                savePageToLocalStorage(filename.value, page);
            }
        }
    };

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
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const pageNumber = parseInt(entry.target.getAttribute('data-page'));
                    if (pageNumber && typeof scrollToPageCanvaCallback === 'function') {
                        scrollToPageCanvaCallback(pageNumber);
                    }
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
                if (pageNumber && pageNumber !== pageNum.value) {
                    pageNum.value = pageNumber;
                    savePageToLocalStorage();
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

    return {
        pagesContainer,
        renderedPages,
        pageNum,
        pageCount,
        scrollToPage,
        savePageToLocalStorage,
        getPageFromLocalStorage,
        setupIntersectionObserver,
        setupLazyLoadObserver,
        intersectionObserver,
        lazyLoadObserver
    }
}