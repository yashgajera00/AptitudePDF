/**
 * Main Web Application Entry Point
 * Displays option collections, handles instant PDF generation, and manages UI states.
 */

class App {
  constructor() {
    this.allImages = [];
    this.allCollectionCardsData = [];
    this.currentViewMode = localStorage.getItem('preferred_view_mode') || 'card';
    this.currentListSort = 'default';
    
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

    // Set initial view mode
    this.setViewMode(this.currentViewMode);

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

    // View pattern switcher triggers
    const viewModeToggleBtn = document.getElementById('viewModeToggleBtn');
    if (viewModeToggleBtn) {
      viewModeToggleBtn.addEventListener('click', () => this.toggleViewMode());
    }

    const viewCardBtn = document.getElementById('viewCardBtn');
    if (viewCardBtn) {
      viewCardBtn.addEventListener('click', () => this.setViewMode('card'));
    }

    const viewListBtn = document.getElementById('viewListBtn');
    if (viewListBtn) {
      viewListBtn.addEventListener('click', () => this.setViewMode('list'));
    }

    const listSortSelect = document.getElementById('listSortSelect');
    if (listSortSelect) {
      listSortSelect.addEventListener('change', (e) => {
        this.currentListSort = e.target.value;
        this.renderCollectionsList();
      });
    }

    // Floating Background Border Beam Search Input
    const searchInput = document.getElementById('mainSearchInput');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();

        // In list mode: filter list cards in real-time
        if (this.currentViewMode === 'list') {
          this.filterCollectionsList(query);
          return;
        }

        // In card mode: jump to matching card in 3D fan carousel
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
          if (!query) return;

          const found = this.allCollectionCardsData.find(c => 
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
      const isMobile = window.innerWidth <= 640;
      const baseVw = isMobile ? 100 : 95;
      if (zoom === 1.0) {
        streamEl.style.width = `${baseVw}vw`;
        streamEl.style.maxWidth = `${baseVw}vw`;
      } else {
        streamEl.style.width = `${Math.round(baseVw * zoom)}vw`;
        streamEl.style.maxWidth = `${Math.round(baseVw * zoom)}vw`;
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

    this.allCollectionCardsData = cardsData;

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

    // Also populate the list pattern view
    this.renderCollectionsList();
  }

  // View Mode Switching (3D Cards vs List Pattern)
  setViewMode(mode) {
    this.currentViewMode = mode;
    localStorage.setItem('preferred_view_mode', mode);

    const fanStage = document.getElementById('fanCarouselStage');
    const fanControls = document.getElementById('fanControlsCapsule');
    const listView = document.getElementById('collectionsListView');
    const viewCardBtn = document.getElementById('viewCardBtn');
    const viewListBtn = document.getElementById('viewListBtn');
    const cornerBtn = document.getElementById('viewModeToggleBtn');
    const cornerIcon = document.getElementById('viewModeIcon');
    const section = document.getElementById('albumsSection');

    if (mode === 'list') {
      if (fanStage) fanStage.style.display = 'none';
      if (fanControls) fanControls.style.display = 'none';
      if (listView) listView.style.display = 'block';
      if (section) section.classList.add('list-view-active');
      document.body.classList.add('list-mode-enabled');
      document.documentElement.classList.add('list-mode-enabled');

      if (viewCardBtn) viewCardBtn.classList.remove('active');
      if (viewListBtn) viewListBtn.classList.add('active');

      if (cornerBtn) cornerBtn.title = 'Switch to 3D Cards';
      if (cornerIcon) cornerIcon.className = 'fa-solid fa-layer-group';

      this.renderCollectionsList();
    } else {
      if (fanStage) fanStage.style.display = 'flex';
      if (fanControls) fanControls.style.display = 'inline-flex';
      if (listView) listView.style.display = 'none';
      if (section) section.classList.remove('list-view-active');
      document.body.classList.remove('list-mode-enabled');
      document.documentElement.classList.remove('list-mode-enabled');

      if (viewCardBtn) viewCardBtn.classList.add('active');
      if (viewListBtn) viewListBtn.classList.remove('active');

      if (cornerBtn) cornerBtn.title = 'Switch to List Pattern';
      if (cornerIcon) cornerIcon.className = 'fa-solid fa-list-ul';

      if (this.fanCarousel) {
        this.fanCarousel.updateLayout();
      }
    }
  }

  toggleViewMode() {
    const next = this.currentViewMode === 'card' ? 'list' : 'card';
    this.setViewMode(next);
    this.showToast(next === 'list' ? 'Switched to List Pattern' : 'Switched to 3D Cards', 'info');
  }

  getCollectionIcon(categoryName) {
    const lower = (categoryName || '').toLowerCase().trim();
    if (lower.includes('percent')) return 'fa-solid fa-percent';
    if (lower.includes('basic') || lower.includes('mathem')) return 'fa-solid fa-calculator';
    if (lower.includes('compound')) return 'fa-solid fa-chart-line';
    if (lower.includes('interest')) return 'fa-solid fa-coins';
    if (lower.includes('profit') || lower.includes('loss')) return 'fa-solid fa-chart-pie';
    if (lower.includes('average')) return 'fa-solid fa-scale-balanced';
    if (lower.includes('age')) return 'fa-solid fa-user-clock';
    if (lower.includes('ratio') || lower.includes('proportion')) return 'fa-solid fa-arrows-split-up-and-left';
    if (lower.includes('partner')) return 'fa-solid fa-handshake';
    if (lower.includes('time') || lower.includes('work')) return 'fa-solid fa-stopwatch';
    if (lower.includes('speed') || lower.includes('distance')) return 'fa-solid fa-gauge-high';
    return 'fa-solid fa-book-bookmark';
  }

  renderCollectionsList() {
    const listGrid = document.getElementById('collectionsListGrid');
    const emptyState = document.getElementById('listEmptyState');
    const countDisplay = document.getElementById('listTotalCountDisplay');
    if (!listGrid) return;

    let items = [...(this.allCollectionCardsData || [])];
    
    // Sort
    if (this.currentListSort === 'name-asc') {
      items.sort((a, b) => a.category.localeCompare(b.category));
    } else if (this.currentListSort === 'name-desc') {
      items.sort((a, b) => b.category.localeCompare(a.category));
    } else if (this.currentListSort === 'photos-desc') {
      items.sort((a, b) => b.count - a.count);
    }

    if (countDisplay) {
      countDisplay.textContent = `${items.length} ${items.length === 1 ? 'Topic' : 'Topics'} Available`;
    }

    if (!items.length) {
      listGrid.innerHTML = '';
      if (emptyState) emptyState.style.display = 'block';
      return;
    }

    if (emptyState) emptyState.style.display = 'none';
    this.renderCardsIntoGrid(items);
  }

  filterCollectionsList(query = '') {
    const listGrid = document.getElementById('collectionsListGrid');
    const emptyState = document.getElementById('listEmptyState');
    const countDisplay = document.getElementById('listTotalCountDisplay');
    if (!listGrid) return;

    let items = [...(this.allCollectionCardsData || [])];
    if (query) {
      items = items.filter(c => c.category.toLowerCase().includes(query));
    }

    if (countDisplay) {
      countDisplay.textContent = `${items.length} ${items.length === 1 ? 'Topic' : 'Topics'} Found`;
    }

    if (!items.length) {
      listGrid.innerHTML = '';
      if (emptyState) emptyState.style.display = 'block';
      return;
    }

    if (emptyState) emptyState.style.display = 'none';
    this.renderCardsIntoGrid(items);
  }

  renderCardsIntoGrid(items) {
    const listGrid = document.getElementById('collectionsListGrid');
    if (!listGrid) return;

    listGrid.innerHTML = items.map((card, idx) => {
      const iconClass = this.getCollectionIcon(card.category);
      const safeCategory = (card.category || '').replace(/'/g, "\\'");
      const collectionNum = (this.allCollectionCardsData.findIndex(c => c.category === card.category) + 1) || (idx + 1);

      return `
        <div class="list-grid-card" onclick="window.app.openAlbumAsPDF('${safeCategory}')">
          <div class="fan-card-full-image bronze-grain-gradient">
            <div class="fan-card-glow-bg"></div>
            
            <!-- Top Tag & Icon -->
            <div class="fan-card-top-row">
              <span class="fan-card-pill-tag">Collection #${collectionNum}</span>
              <div class="fan-card-icon-bubble">
                <i class="${iconClass}"></i>
              </div>
            </div>

            <!-- Prominent Card Name on Background -->
            <div class="fan-card-center-body">
              <h3 class="fan-card-title-text">${card.category}</h3>
              <p class="fan-card-subtitle-text">Curated formula & diagram notes</p>
            </div>

            <!-- Bottom Action Row -->
            <div class="fan-card-bottom-row">
              <span class="fan-card-photo-count">
                <i class="fa-solid fa-layer-group"></i> ${card.count} ${card.count === 1 ? 'Photo' : 'Photos'}
              </span>
              <div class="list-card-btn-group" onclick="event.stopPropagation()">
                <button class="fan-card-action-btn" onclick="window.app.openAlbumAsPDF('${safeCategory}')">
                  <i class="fa-solid fa-file-pdf"></i> Open PDF
                </button>
                <button class="fan-card-download-btn" onclick="window.app.quickDownloadAlbum('${safeCategory}', event)" title="Direct Download ${safeCategory}.pdf">
                  <i class="fa-solid fa-download"></i>
                </button>
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  async quickDownloadAlbum(category, e) {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    this.allImages = await window.appStorage.getAllImages();
    const catImages = this.allImages.filter(img => img.category === category);
    if (!catImages.length) {
      this.showToast(`No notes found in "${category}"`, 'warning');
      return;
    }
    this.showToast(`Compiling ${catImages.length} pages for ${category}.pdf...`, 'info');
    try {
      await window.pdfEngine.generatePDF(catImages, {
        orientation: 'auto',
        layout: '1-per-page',
        margin: 0,
        addPageNumbers: false,
        addTitleHeader: false,
        pdfTitle: category
      });
      window.pdfEngine.downloadCurrentPDF(`${category}.pdf`);
      this.showToast(`${category}.pdf downloaded successfully!`, 'success');
      if (typeof confetti === 'function') {
        confetti({ particleCount: 70, spread: 60, origin: { y: 0.8 } });
      }
    } catch (err) {
      console.error('Quick download failed:', err);
      this.showToast('Failed to download PDF', 'error');
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
