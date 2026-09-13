/**
 * Main Web Application Entry Point
 * Displays option collections, handles instant PDF generation, and manages UI states.
 */

class App {
  constructor() {
    this.allImages = [];
    
    // PDF Viewer State
    this.activeViewerImages = [];
    this.activeViewerPageIndex = 0;

    this.init();
  }

  async init() {
    // Initialize Theme
    this.initTheme();

    // Initialize Kinetic Grid Interactive Background Canvas
    this.initKineticGrid();

    // Perform database clear to ensure clean fresh start
    if (localStorage.getItem('db_cleared_v2') !== 'true') {
      await window.appStorage.clearAll();
      localStorage.setItem('db_cleared_v2', 'true');
    }



    // Bind event handlers
    this.bindEvents();

    // Render initial view
    await this.refreshUI();
  }

  initKineticGrid() {
    const canvas = document.getElementById('globalKineticGridCanvas');
    if (canvas && typeof window.KineticGridEngine === 'function') {
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      this.kineticGridInstance = new window.KineticGridEngine(canvas, {
        cellSize: 55,
        influenceRadius: 260,
        maxWarp: 24,
        dotSpacing: 28,
        lerpSpeed: 0.08,
        isDark: isDark
      });
    }
  }

  initTheme() {
    const savedTheme = localStorage.getItem('theme_preference') || 'light';
    this.setTheme(savedTheme);
  }

  setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme_preference', theme);

    if (this.kineticGridInstance) {
      this.kineticGridInstance.setTheme(theme === 'dark');
    }

    const icon = document.getElementById('themeToggleIcon');
    if (icon) {
      if (theme === 'dark') {
        icon.className = 'fa-solid fa-sun';
      } else {
        icon.className = 'fa-solid fa-moon';
      }
    }
  }

  toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    this.setTheme(next);
    this.showToast(`Switched to ${next} theme`, 'info');
  }

  bindEvents() {
    // Theme toggle button
    const themeToggleBtn = document.getElementById('themeToggleBtn');
    if (themeToggleBtn) {
      themeToggleBtn.addEventListener('click', () => this.toggleTheme());
    }

    // Floating Background Border Beam Search Input
    const searchInput = document.getElementById('mainSearchInput');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        if (!query || !this.fanCarousel) return;

        const foundIndex = this.fanCarousel.cards.findIndex(c => 
          c.category.toLowerCase().includes(query)
        );
        if (foundIndex !== -1) {
          this.fanCarousel.jumpTo(foundIndex);
        }
      });

      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          const query = searchInput.value.toLowerCase().trim();
          if (!query || !this.fanCarousel) return;
          const found = this.fanCarousel.cards.find(c => 
            c.category.toLowerCase().includes(query)
          );
          if (found) {
            this.openAlbumAsPDF(found.category);
          }
        }
      });
    }

    // Modal close triggers
    document.querySelectorAll('.modal-close, [data-close-modal]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const modal = e.target.closest('.modal-overlay');
        if (modal) {
          modal.classList.remove('active');
        }
      });
    });

    // Close on overlay backdrop click
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          overlay.classList.remove('active');
        }
      });
    });

    // Keyboard ESC to close modal
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay.active').forEach(modal => {
          modal.classList.remove('active');
        });
      }
    });

    // PDF Controls in viewer modal
    // PDF Controls in viewer modal (Matching user reference UI)
    this.pdfZoomIndex = 2; // 100%
    this.pdfZoomLevels = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];
    this.pdfRotation = 0;

    const pdfDownloadBtn = document.getElementById('pdfDownloadBtn');
    const pdfQuickDownloadBtn = document.getElementById('pdfQuickDownloadBtn');
    const triggerDownload = async () => {
      if (!this.activeViewerImages || this.activeViewerImages.length === 0) {
        this.showToast('No photos to download as PDF', 'warning');
        return;
      }
      const rawTitle = document.getElementById('pdfDocumentName')?.textContent || 'Document.pdf';
      const cleanName = rawTitle.endsWith('.pdf') ? rawTitle : `${rawTitle.replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`;
      this.showToast('Generating and downloading PDF document...', 'info');

      await window.pdfEngine.generatePDF(this.activeViewerImages, {
        orientation: 'auto',
        layout: '1-per-page',
        margin: 0,
        addPageNumbers: false,
        addTitleHeader: false,
        pdfTitle: cleanName.replace(/\.pdf$/i, '')
      });

      window.pdfEngine.downloadCurrentPDF(cleanName);
      this.showToast('PDF downloaded successfully!', 'success');
      if (typeof confetti === 'function') {
        confetti({ particleCount: 80, spread: 60, origin: { y: 0.8 } });
      }
    };

    if (pdfDownloadBtn) pdfDownloadBtn.addEventListener('click', triggerDownload);
    if (pdfQuickDownloadBtn) pdfQuickDownloadBtn.addEventListener('click', triggerDownload);

    const pdfPrintBtn = document.getElementById('pdfPrintBtn');
    if (pdfPrintBtn) {
      pdfPrintBtn.addEventListener('click', async () => {
        if (!this.activeViewerImages || this.activeViewerImages.length === 0) return;
        const rawTitle = document.getElementById('pdfDocumentName')?.textContent || 'Document.pdf';
        await window.pdfEngine.generatePDF(this.activeViewerImages, {
          orientation: 'auto',
          layout: '1-per-page',
          margin: 0,
          addPageNumbers: false,
          addTitleHeader: false,
          pdfTitle: rawTitle.replace(/\.pdf$/i, '')
        });
        window.pdfEngine.printOrOpenCurrentPDF();
      });
    }

    // Multi-Vendor Fullscreen synchronization
    const toggleFsBtn = document.getElementById('pdfToggleFullscreenBtn');
    if (toggleFsBtn) {
      toggleFsBtn.addEventListener('click', (e) => this.toggleDeviceFullscreen(e));
    }
    const updateFsUI = () => {
      const isFs = !!(
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.mozFullScreenElement ||
        document.msFullscreenElement
      );
      if (toggleFsBtn) {
        if (isFs) {
          toggleFsBtn.innerHTML = '<i class="fa-solid fa-compress"></i>';
          toggleFsBtn.title = 'Exit Full Screen (ESC)';
        } else {
          toggleFsBtn.innerHTML = '<i class="fa-solid fa-expand"></i>';
          toggleFsBtn.title = 'Full Screen (F11)';
        }
      }
    };

    ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange'].forEach(ev => {
      document.addEventListener(ev, updateFsUI);
    });

    // Zoom Controls
    const zoomInBtn = document.getElementById('pdfZoomInBtn');
    const zoomOutBtn = document.getElementById('pdfZoomOutBtn');
    if (zoomInBtn) {
      zoomInBtn.addEventListener('click', () => {
        if (this.pdfZoomIndex < this.pdfZoomLevels.length - 1) {
          this.pdfZoomIndex++;
          this.applyPdfZoom();
        }
      });
    }
    if (zoomOutBtn) {
      zoomOutBtn.addEventListener('click', () => {
        if (this.pdfZoomIndex > 0) {
          this.pdfZoomIndex--;
          this.applyPdfZoom();
        }
      });
    }

    // Rotate Button
    const rotateBtn = document.getElementById('pdfRotateBtn');
    if (rotateBtn) {
      rotateBtn.addEventListener('click', () => {
        this.pdfRotation = (this.pdfRotation + 90) % 360;
        document.querySelectorAll('.pdf-page-body-photo img').forEach(img => {
          img.style.transform = `rotate(${this.pdfRotation}deg)`;
          img.style.transition = 'transform 0.3s ease';
        });
        this.showToast(`Rotated to ${this.pdfRotation}°`, 'info');
      });
    }

    // Page Input navigation
    const pageInput = document.getElementById('pdfCurrentPageInput');
    if (pageInput) {
      pageInput.addEventListener('change', () => {
        const val = parseInt(pageInput.value, 10);
        this.jumpToPdfPage(val);
      });
      pageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          const val = parseInt(pageInput.value, 10);
          this.jumpToPdfPage(val);
        }
      });
    }

    // Scroll synchronization for page counter
    const streamContainer = document.getElementById('pdfDocumentStreamContainer');
    if (streamContainer) {
      streamContainer.addEventListener('scroll', () => {
        this.syncPdfCurrentPageOnScroll();
      });
    }

    // Other toolbar buttons
    const fitWidthBtn = document.getElementById('pdfFitWidthBtn');
    if (fitWidthBtn) {
      fitWidthBtn.addEventListener('click', () => {
        this.pdfZoomIndex = 2; // reset to 100%
        this.applyPdfZoom();
      });
    }

    const presentBtn = document.getElementById('pdfPresentModeBtn');
    if (presentBtn) {
      presentBtn.addEventListener('click', () => {
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(() => {});
        }
        this.showToast('Presentation Mode Active', 'info');
      });
    }

    const annotateBtn = document.getElementById('pdfAnnotateBtn');
    if (annotateBtn) {
      annotateBtn.addEventListener('click', () => {
        this.showToast('Pen & Annotation tool active', 'info');
      });
    }
  }

  applyPdfZoom() {
    const zoom = this.pdfZoomLevels[this.pdfZoomIndex];
    const displayEl = document.getElementById('pdfZoomLevelDisplay');
    const streamEl = document.getElementById('pdfDocumentStream');
    if (displayEl) displayEl.textContent = `${Math.round(zoom * 100)}%`;
    if (streamEl) {
      if (zoom === 1.0) {
        streamEl.style.width = '95vw';
        streamEl.style.maxWidth = '95vw';
      } else {
        streamEl.style.width = `${Math.round(95 * zoom)}vw`;
        streamEl.style.maxWidth = `${Math.round(95 * zoom)}vw`;
      }
    }
  }

  toggleDeviceFullscreen(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (e && e.stopPropagation) e.stopPropagation();

    if (this._fsDebounce) return;
    this._fsDebounce = true;
    setTimeout(() => { this._fsDebounce = false; }, 350);

    const isFs = Boolean(
      document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.mozFullScreenElement ||
      document.msFullscreenElement
    );

    const el = document.documentElement;

    if (!isFs) {
      // Direct call on element to guarantee no "Illegal invocation" error
      if (el.requestFullscreen) {
        el.requestFullscreen().catch(err => {
          console.warn('requestFullscreen error, trying body:', err);
          if (document.body && document.body.requestFullscreen) {
            document.body.requestFullscreen().catch(() => {});
          }
        });
      } else if (el.webkitRequestFullscreen) {
        el.webkitRequestFullscreen();
      } else if (el.mozRequestFullScreen) {
        el.mozRequestFullScreen();
      } else if (el.msRequestFullscreen) {
        el.msRequestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(err => console.warn('exitFullscreen error:', err));
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      } else if (document.mozCancelFullScreen) {
        document.mozCancelFullScreen();
      } else if (document.msExitFullscreen) {
        document.msExitFullscreen();
      }
    }
  }

  jumpToPdfPage(pageNum) {
    const total = this.activeViewerImages?.length || 1;
    const clamped = Math.max(1, Math.min(pageNum, total));
    const targetPage = document.getElementById(`pdf-page-${clamped}`);
    if (targetPage) {
      targetPage.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    const pageInput = document.getElementById('pdfCurrentPageInput');
    if (pageInput) pageInput.value = clamped;
  }

  syncPdfCurrentPageOnScroll() {
    const pages = document.querySelectorAll('.pdf-document-page');
    const streamContainer = document.getElementById('pdfDocumentStreamContainer');
    if (!pages.length || !streamContainer) return;

    const containerTop = streamContainer.getBoundingClientRect().top;
    let closestPage = 1;
    let minDiff = Infinity;

    pages.forEach((page, idx) => {
      const rect = page.getBoundingClientRect();
      const diff = Math.abs(rect.top - containerTop - 50);
      if (diff < minDiff) {
        minDiff = diff;
        closestPage = idx + 1;
      }
    });

    const pageInput = document.getElementById('pdfCurrentPageInput');
    if (pageInput && parseInt(pageInput.value, 10) !== closestPage) {
      pageInput.value = closestPage;
    }
  }

  async refreshUI() {
    this.allImages = await window.appStorage.getAllImages();
    this.updateStatsRibbon();
    await this.renderAlbumCards();
  }

  updateStatsRibbon() {
    const totalCountEl = document.getElementById('statTotalImages');
    const totalAlbumsEl = document.getElementById('statTotalAlbums');
    
    if (totalCountEl) totalCountEl.textContent = this.allImages.length;
    
    const categories = new Set(this.allImages.map(img => img.category));
    if (totalAlbumsEl) totalAlbumsEl.textContent = categories.size;
  }

  async renderAlbumCards() {
    const allCollections = await window.appStorage.getAllCollectionsList();
    const activeImageCategories = Array.from(new Set(this.allImages.map(img => img.category))).filter(Boolean);
    const combinedCategories = Array.from(new Set([...allCollections, ...activeImageCategories]));

    // Strictly create cards only for actual collections
    let cardsData = combinedCategories.map(cat => {
      const catImages = this.allImages.filter(img => img.category === cat);
      return {
        category: cat,
        coverImg: catImages[0]?.dataUrl || '',
        count: catImages.length
      };
    });

    if (!this.fanCarousel && window.CardFanCarousel) {
      this.fanCarousel = new window.CardFanCarousel('fanLayoutContainer', {
        maxVisible: 7,
        half: 3,
        onCardClick: (cardData) => {
          if (typeof cardData === 'string') {
            this.openAlbumAsPDF(cardData);
          } else if (cardData && cardData.category) {
            this.openAlbumAsPDF(cardData.category);
          }
        }
      });
      window.cardFanCarousel = this.fanCarousel;
    }

    if (this.fanCarousel) {
      window.cardFanCarousel = this.fanCarousel;
      this.fanCarousel.setCards(cardsData);
    }
  }

  // PDF Preview & Merge Triggers
  openSingleImageAsPDF(id) {
    const item = this.allImages.find(img => img.id === id);
    if (!item) return;
    this.openPDFViewerModal([item], `${item.title}.pdf`);
  }

  async openAlbumAsPDF(category) {
    this.allImages = await window.appStorage.getAllImages();
    const catImages = this.allImages.filter(img => img.category === category);
    this.openPDFViewerModal(catImages, `${category}.pdf`, category);
  }

  async openPDFViewerModal(images, defaultTitle = 'Document.pdf', categoryName = '') {
    this.activeViewerImages = images || [];
    this.activeViewerPageIndex = 0;
    this.activeViewerCategory = categoryName || (this.activeViewerImages[0]?.category) || '';
    
    // Ensure filename ends with .pdf
    let filename = defaultTitle;
    if (!filename.toLowerCase().endsWith('.pdf')) {
      filename = `${filename}.pdf`;
    }

    const nameEl = document.getElementById('pdfDocumentName');
    const pageInput = document.getElementById('pdfCurrentPageInput');
    const totalPagesEl = document.getElementById('pdfTotalPagesDisplay');
    const streamContainer = document.getElementById('pdfDocumentStream');
    const downloadBtn = document.getElementById('pdfDownloadBtn');
    const toggleFsBtn = document.getElementById('pdfToggleFullscreenBtn');

    const total = this.activeViewerImages.length;
    if (nameEl) nameEl.textContent = filename;
    if (pageInput) {
      pageInput.value = 1;
      pageInput.max = Math.max(1, total);
    }
    if (totalPagesEl) {
      totalPagesEl.textContent = total;
    }

    if (toggleFsBtn) {
      const isFs = !!(
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.mozFullScreenElement ||
        document.msFullscreenElement
      );
      if (isFs) {
        toggleFsBtn.innerHTML = '<i class="fa-solid fa-compress"></i>';
        toggleFsBtn.title = 'Exit Full Screen (ESC)';
      } else {
        toggleFsBtn.innerHTML = '<i class="fa-solid fa-expand"></i>';
        toggleFsBtn.title = 'Full Screen (F11)';
      }
    }

    this.pdfZoomIndex = 2; // reset to 100%
    this.pdfRotation = 0;
    this.applyPdfZoom();

    if (streamContainer) {
      if (total === 0) {
        streamContainer.innerHTML = `
          <div class="pdf-document-page" style="min-height: 480px; justify-content: center; align-items: center; text-align: center; padding: 48px 24px;">
            <div style="width: 72px; height: 72px; border-radius: 50%; background: rgba(99, 102, 241, 0.1); color: var(--primary); display: flex; align-items: center; justify-content: center; font-size: 2rem; margin: 0 auto 16px;">
              <i class="fa-regular fa-images"></i>
            </div>
            <h3 style="font-size: 1.35rem; font-weight: 700; color: var(--text-main); margin-bottom: 8px;">
              No Photos in "${this.activeViewerCategory || 'Collection'}" Yet
            </h3>
            <p style="font-size: 0.92rem; color: var(--text-muted); max-width: 440px; margin: 0 auto 16px; line-height: 1.6;">
              There are no documents or photos currently in this collection.
            </p>
          </div>
        `;
      } else {
        streamContainer.innerHTML = this.activeViewerImages.map((img, idx) => `
          <div class="pdf-document-page" data-page="${idx + 1}" id="pdf-page-${idx + 1}">
            <img src="${img.dataUrl}" alt="${img.title || `${filename} - Page ${idx + 1}`}" class="pdf-page-image" loading="lazy">
          </div>
        `).join('');
      }
    }

    this.openModal('pdfViewerModal');
  }

  changeViewerPage(delta) {
    const total = this.activeViewerImages.length;
    const newIdx = this.activeViewerPageIndex + delta;
    if (newIdx >= 0 && newIdx < total) {
      this.activeViewerPageIndex = newIdx;
      this.renderViewerSheet();
    }
  }

  // Modal Helpers
  openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.add('active');
    }
  }

  closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.remove('active');
      if (modalId === 'pdfViewerModal' && document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
    }
  }

  // Toast Notification System
  showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    let icon = 'fa-circle-info';
    if (type === 'success') icon = 'fa-circle-check';
    if (type === 'error') icon = 'fa-triangle-exclamation';
    if (type === 'warning') icon = 'fa-circle-exclamation';

    toast.innerHTML = `
      <i class="fa-solid ${icon}"></i>
      <span>${message}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
});
