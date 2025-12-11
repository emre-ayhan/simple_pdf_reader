export function usePagination(isFileLoaded, pdfCanvases, pageCount, pageNum, filename) {
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

    return {
        scrollToPage,
        savePageToLocalStorage,
        getPageFromLocalStorage
    }
}