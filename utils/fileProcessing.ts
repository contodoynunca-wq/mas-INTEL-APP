
declare const pdfjsLib: any;

export const fileToBase64 = (file: File): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = error => reject(error);
    reader.readAsDataURL(file);
});

export const base64ToBlob = (base64: string, mimeType: string): Blob => {
    // Check if base64 string contains metadata prefix and strip it
    const cleanBase64 = base64.includes(',') ? base64.split(',')[1] : base64;
    
    const byteCharacters = atob(cleanBase64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: mimeType });
};

export async function cropImageBase64(base64: string, bbox: [number, number, number, number], paddingPercent: number = 0.05): Promise<{ croppedBase64: string, normRect: { xmin: number, ymin: number, xmax: number, ymax: number } }> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const [ymin, xmin, ymax, xmax] = bbox;
            
            // Add padding in normalized space
            const width = xmax - xmin;
            const height = ymax - ymin;
            const padX = width * paddingPercent;
            const padY = height * paddingPercent;
            
            const normMinX = Math.max(0, xmin - padX);
            const normMaxX = Math.min(1000, xmax + padX);
            const normMinY = Math.max(0, ymin - padY);
            const normMaxY = Math.min(1000, ymax + padY);
            
            // Convert to pixel coordinates
            const pxMinX = (normMinX / 1000) * img.width;
            const pxMaxX = (normMaxX / 1000) * img.width;
            const pxMinY = (normMinY / 1000) * img.height;
            const pxMaxY = (normMaxY / 1000) * img.height;
            
            const cropW = pxMaxX - pxMinX;
            const cropH = pxMaxY - pxMinY;
            
            const canvas = document.createElement('canvas');
            canvas.width = cropW;
            canvas.height = cropH;
            const ctx = canvas.getContext('2d');
            if (!ctx) return reject(new Error("Could not get canvas context"));
            
            ctx.drawImage(img, pxMinX, pxMinY, cropW, cropH, 0, 0, cropW, cropH);
            
            resolve({
                croppedBase64: canvas.toDataURL('image/jpeg', 0.9).split(',')[1],
                normRect: { xmin: normMinX, ymin: normMinY, xmax: normMaxX, ymax: normMaxY }
            });
        };
        img.onerror = reject;
        img.src = `data:image/jpeg;base64,${base64}`;
    });
}

export async function reduceImageResolution(base64: string, quality: number, maxDimension: number = 2048): Promise<string> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            let width = img.width;
            let height = img.height;

            if (width > maxDimension || height > maxDimension) {
                if (width > height) {
                    height = Math.round((height * maxDimension) / width);
                    width = maxDimension;
                } else {
                    width = Math.round((width * maxDimension) / height);
                    height = maxDimension;
                }
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) return reject(new Error("Could not get canvas context"));
            
            ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', quality).split(',')[1]);
        };
        img.onerror = reject;
        img.src = `data:image/jpeg;base64,${base64}`;
    });
}

export const pdfToImageBase64 = (file: File): Promise<string[]> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async function() {
        const typedarray = new Uint8Array(this.result as ArrayBuffer);
        try {
            if (typeof pdfjsLib === 'undefined') {
                 // pdfjsLib is loaded from a script tag in index.html
                return reject(new Error("pdf.js library is not loaded."));
            }
            pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.11.338/pdf.worker.min.js`;

            const pdf = await pdfjsLib.getDocument(typedarray).promise;
            const pagePromises: Promise<string>[] = [];
            for (let i = 1; i <= pdf.numPages; i++) {
                pagePromises.push(pdf.getPage(i).then(async (page: any) => {
                    // V58 Optimization: Reduced scale from 1.5 to 1.25 to reduce payload size for multi-page AI analysis
                    const viewport = page.getViewport({ scale: 1.25 });
                    const canvas = document.createElement('canvas');
                    canvas.height = viewport.height;
                    canvas.width = viewport.width;
                    const context = canvas.getContext('2d');
                    if (!context) throw new Error("Could not create canvas context");
                    await page.render({ canvasContext: context, viewport: viewport }).promise;
                    // Return base64 string without the data URL prefix
                    return canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
                }));
            }
            resolve(await Promise.all(pagePromises));
        } catch (error) { reject(error); }
    };
    reader.readAsArrayBuffer(file);
});

export const renderPdfPageAsBlob = (file: File, pageNumber: number): Promise<Blob> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async function() {
        const typedarray = new Uint8Array(this.result as ArrayBuffer);
        try {
            if (typeof pdfjsLib === 'undefined') {
                return reject(new Error("pdf.js library is not loaded."));
            }
            pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.11.338/pdf.worker.min.js`;

            const pdf = await pdfjsLib.getDocument(typedarray).promise;
            
            if (pageNumber > pdf.numPages || pageNumber < 1) {
                return reject(new Error(`Page ${pageNumber} not found in PDF.`));
            }

            const page = await pdf.getPage(pageNumber);
            const viewport = page.getViewport({ scale: 2.0 }); // Higher scale for quality single-page snaps
            const canvas = document.createElement('canvas');
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            const context = canvas.getContext('2d');
            
            if (!context) throw new Error("Could not create canvas context");
            
            await page.render({ canvasContext: context, viewport: viewport }).promise;
            
            canvas.toBlob((blob) => {
                if (blob) resolve(blob);
                else reject(new Error("Canvas to Blob conversion failed"));
            }, 'image/jpeg', 0.85);

        } catch (error) { reject(error); }
    };
    reader.readAsArrayBuffer(file);
});
