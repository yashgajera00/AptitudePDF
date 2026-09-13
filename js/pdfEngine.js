/**
 * PDF Engine for Image Storing & Merging Application
 * Powers conversion of single/multiple images into formatted multi-page PDF documents.
 */

class PDFEngine {
  constructor() {
    this.currentDoc = null;
    this.currentBlobUrl = null;
    this.currentPageIndex = 0;
    this.currentImages = [];
    this.currentOptions = {
      orientation: 'auto',
      format: 'auto',
      margin: 0,
      layout: '1-per-page',
      pdfTitle: 'Document',
      addPageNumbers: false,
      addTitleHeader: false
    };
  }

  /**
   * Generates a jsPDF instance from a list of images.
   * Auto-sizes pages to match each image's natural aspect ratio with 0 white space.
   * @param {Array} images - Array of image objects or dataUrls
   * @param {Object} options - Custom settings
   * @returns {jsPDF} Generated jsPDF instance
   */
  async generatePDF(images, options = {}) {
    if (!images || images.length === 0) {
      throw new Error('No images provided for PDF generation');
    }

    const { jsPDF } = window.jspdf;
    this.currentImages = images;
    this.currentOptions = { ...this.currentOptions, ...options };

    const margin = Number(this.currentOptions.margin) || 0;
    const layout = this.currentOptions.layout;
    const isZeroWhitespace = (layout === '1-per-page' && margin === 0 && !this.currentOptions.addTitleHeader && !this.currentOptions.addPageNumbers);

    let doc = null;

    if (isZeroWhitespace) {
      // Pre-load all images so we know their exact natural dimensions and aspect ratios
      const loadedImages = await Promise.all(images.map(img => {
        const dataUrl = img.dataUrl || img;
        return this._loadImage(dataUrl);
      }));

      const maxDimension = 1200; // Optimal PDF point bounds for high clarity and standard zoom

      for (let i = 0; i < loadedImages.length; i++) {
        const item = loadedImages[i];
        let pW = item.width;
        let pH = item.height;

        if (pW > maxDimension || pH > maxDimension) {
          const scale = maxDimension / Math.max(pW, pH);
          pW = Math.round(pW * scale * 100) / 100;
          pH = Math.round(pH * scale * 100) / 100;
        }

        const isLandscape = pW >= pH;

        if (i === 0) {
          doc = new jsPDF({
            orientation: isLandscape ? 'l' : 'p',
            unit: 'pt',
            format: [pW, pH],
            compress: true
          });
        } else {
          doc.addPage([pW, pH], isLandscape ? 'l' : 'p');
        }

        const actualW = doc.internal.pageSize.getWidth();
        const actualH = doc.internal.pageSize.getHeight();
        this._drawImageFullPage(doc, item, actualW, actualH);
      }
    } else {
      // Standard fixed format layout (with custom margins or headers)
      const orientation = this.currentOptions.orientation === 'auto' ? 'p' : (this.currentOptions.orientation || 'p');
      const format = this.currentOptions.format || 'a4';
      doc = new jsPDF({
        orientation: orientation,
        unit: 'mm',
        format: format,
        compress: true
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const usableWidth = pageWidth - (margin * 2);
      const usableHeight = pageHeight - (margin * 2) - (this.currentOptions.addTitleHeader ? 15 : 0) - (this.currentOptions.addPageNumbers ? 10 : 0);

      if (layout === '1-per-page') {
        for (let i = 0; i < images.length; i++) {
          if (i > 0) doc.addPage();
          const img = images[i];
          const dataUrl = img.dataUrl || img;
          const topY = margin + (this.currentOptions.addTitleHeader ? 12 : 0);
          await this._drawImageCentered(doc, dataUrl, margin, topY, usableWidth, usableHeight);
        }
      } else if (layout === '2-per-page') {
        const itemsPerPage = 2;
        const totalPages = Math.ceil(images.length / itemsPerPage);
        const slotHeight = usableHeight / 2 - 4;

        for (let p = 0; p < totalPages; p++) {
          if (p > 0) doc.addPage();

          if (this.currentOptions.addTitleHeader) {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(12);
            doc.setTextColor(50, 50, 80);
            doc.text(this.currentOptions.pdfTitle, margin, margin + 5);
            doc.setDrawColor(220, 225, 235);
            doc.line(margin, margin + 8, pageWidth - margin, margin + 8);
          }

          const startIdx = p * itemsPerPage;
          const topY1 = margin + (this.currentOptions.addTitleHeader ? 12 : 0);
          const topY2 = topY1 + slotHeight + 8;

          if (images[startIdx]) {
            await this._drawImageCentered(doc, images[startIdx].dataUrl || images[startIdx], margin, topY1, usableWidth, slotHeight);
          }
          if (images[startIdx + 1]) {
            await this._drawImageCentered(doc, images[startIdx + 1].dataUrl || images[startIdx + 1], margin, topY2, usableWidth, slotHeight);
          }

          if (this.currentOptions.addPageNumbers) {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            doc.setTextColor(140, 150, 165);
            doc.text(`Page ${p + 1} of ${totalPages}`, pageWidth / 2, pageHeight - margin + 3, { align: 'center' });
          }
        }
      }
    }

    this.currentDoc = doc;
    if (this.currentBlobUrl) {
      URL.revokeObjectURL(this.currentBlobUrl);
    }
    const pdfBlob = doc.output('blob');
    this.currentBlobUrl = URL.createObjectURL(pdfBlob);
    return doc;
  }

  _loadImage(dataUrl) {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const w = img.naturalWidth || img.width || 800;
        const h = img.naturalHeight || img.height || 600;
        const isPng = (typeof dataUrl === 'string') && (dataUrl.startsWith('data:image/png') || dataUrl.toLowerCase().endsWith('.png'));
        resolve({
          element: img,
          dataUrl: dataUrl,
          width: w,
          height: h,
          format: isPng ? 'PNG' : 'JPEG'
        });
      };
      img.onerror = () => {
        resolve({
          element: null,
          dataUrl: dataUrl,
          width: 800,
          height: 600,
          format: 'JPEG'
        });
      };
      img.src = dataUrl;
    });
  }

  _drawImageFullPage(doc, loadedImg, pWidth, pHeight) {
    if (!loadedImg) return;
    const { element, format, dataUrl, width, height } = loadedImg;

    if (element && element.complete && element.naturalWidth > 0) {
      try {
        doc.addImage(element, format, 0, 0, pWidth, pHeight, undefined, 'FAST');
        return;
      } catch (e1) {
        // proceed to fallback
      }
    }

    if (dataUrl && typeof dataUrl === 'string') {
      try {
        doc.addImage(dataUrl, format, 0, 0, pWidth, pHeight, undefined, 'FAST');
        return;
      } catch (e2) {
        // proceed to fallback
      }
    }

    if (element) {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(element, 0, 0);
        const pngUrl = canvas.toDataURL('image/png');
        doc.addImage(pngUrl, 'PNG', 0, 0, pWidth, pHeight, undefined, 'FAST');
      } catch (e3) {
        console.warn('PDFEngine _drawImageFullPage canvas fallback failed:', e3);
      }
    }
  }

  async _drawImageCentered(doc, dataUrl, startX, startY, maxWidth, maxHeight) {
    return new Promise((resolve) => {
      const tempImg = new Image();
      tempImg.crossOrigin = 'anonymous';
      tempImg.onload = () => {
        const imgWidth = tempImg.naturalWidth || 800;
        const imgHeight = tempImg.naturalHeight || 600;
        const ratio = Math.min(maxWidth / imgWidth, maxHeight / imgHeight);

        const targetW = imgWidth * ratio;
        const targetH = imgHeight * ratio;

        const posX = startX + (maxWidth - targetW) / 2;
        const posY = startY + (maxHeight - targetH) / 2;

        try {
          doc.addImage(tempImg, 'JPEG', posX, posY, targetW, targetH, undefined, 'FAST');
          resolve();
        } catch (e1) {
          try {
            doc.addImage(tempImg, 'PNG', posX, posY, targetW, targetH, undefined, 'FAST');
            resolve();
          } catch (e2) {
            try {
              const canvas = document.createElement('canvas');
              canvas.width = imgWidth;
              canvas.height = imgHeight;
              const ctx = canvas.getContext('2d');
              ctx.drawImage(tempImg, 0, 0);
              const pngData = canvas.toDataURL('image/png');
              doc.addImage(pngData, 'PNG', posX, posY, targetW, targetH, undefined, 'FAST');
            } catch (e3) {
              console.warn('doc.addImage canvas fallback failed:', e3);
            }
            resolve();
          }
        }
      };
      tempImg.onerror = () => {
        resolve();
      };
      tempImg.src = dataUrl;
    });
  }

  downloadCurrentPDF(filename = 'Aptitude_Images_Merged.pdf') {
    if (this.currentDoc) {
      this.currentDoc.save(filename);
    }
  }

  printOrOpenCurrentPDF() {
    if (this.currentBlobUrl) {
      window.open(this.currentBlobUrl, '_blank');
    }
  }
}

window.pdfEngine = new PDFEngine();
