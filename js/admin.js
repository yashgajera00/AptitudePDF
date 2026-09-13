/**
 * Admin Management Module
 * Handles admin authentication, image uploads, batch operations, and direct PDF merge triggers.
 */

class AdminManager {
  constructor() {
    this.uploadedFilesQueue = [];
    this.initEventListeners();
  }

  initEventListeners() {
    // Admin login form submit
    const loginForm = document.getElementById('adminLoginForm');
    if (loginForm) {
      loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleLogin();
      });
    }

    // Auto-fill demo credentials helper
    const fillDemoBtn = document.getElementById('fillDemoCredsBtn');
    if (fillDemoBtn) {
      fillDemoBtn.addEventListener('click', () => {
        document.getElementById('adminUser').value = 'admin';
        document.getElementById('adminPass').value = 'admin123';
      });
    }

    // Logout button
    const logoutBtn = document.getElementById('adminLogoutBtn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => this.handleLogout());
    }

    // File Dropzone for Opened Collection setup
    const colDropzone = document.getElementById('collectionDropzone');
    const colFileInput = document.getElementById('collectionFileInput');

    if (colDropzone && colFileInput) {
      colDropzone.addEventListener('click', () => colFileInput.click());

      colDropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        colDropzone.classList.add('dragover');
      });

      colDropzone.addEventListener('dragleave', () => {
        colDropzone.classList.remove('dragover');
      });

      colDropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        colDropzone.classList.remove('dragover');
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          this.handleCollectionSelectedFiles(e.dataTransfer.files);
        }
      });

      colFileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
          this.handleCollectionSelectedFiles(e.target.files);
          e.target.value = '';
        }
      });
    }

    // Direct "Merge All into PDF" in Admin Modal
    const adminMergeAllBtn = document.getElementById('adminMergeAllBtn');
    if (adminMergeAllBtn) {
      adminMergeAllBtn.addEventListener('click', () => this.handleDirectMergeAll());
    }

    // Reset default demo data button
    const resetDataBtn = document.getElementById('adminResetDataBtn');
    if (resetDataBtn) {
      resetDataBtn.addEventListener('click', () => this.handleResetData());
    }
  }

  handleLogin() {
    const user = document.getElementById('adminUser').value.trim();
    const pass = document.getElementById('adminPass').value.trim();

    if (user === 'admin' && pass === 'admin123') {
      window.appStorage.setAdminLoggedIn(true);
      window.app.showToast('Logged in as Administrator successfully!', 'success');
      window.app.closeModal('adminLoginModal');
      window.app.openModal('adminDashboardModal');
      this.updateAdminUI();
      this.loadAdminItemsList();
    } else {
      window.app.showToast('Invalid admin credentials. Use admin / admin123', 'error');
    }
  }

  handleLogout() {
    window.appStorage.setAdminLoggedIn(false);
    window.app.showToast('Admin logged out', 'info');
    window.app.closeModal('adminDashboardModal');
    this.updateAdminUI();
    window.app.refreshUI();
  }

  updateAdminUI() {
    const isLoggedIn = window.appStorage.isAdminLoggedIn();
    const loginNavBtn = document.getElementById('navAdminLoginBtn');
    const adminDashboardNavBtn = document.getElementById('navAdminDashboardBtn');
    const adminStatusPill = document.getElementById('adminStatusPill');

    if (isLoggedIn) {
      if (loginNavBtn) loginNavBtn.style.display = 'none';
      if (adminDashboardNavBtn) adminDashboardNavBtn.style.display = 'inline-flex';
      if (adminStatusPill) adminStatusPill.style.display = 'inline-flex';
    } else {
      if (loginNavBtn) loginNavBtn.style.display = 'inline-flex';
      if (adminDashboardNavBtn) adminDashboardNavBtn.style.display = 'none';
      if (adminStatusPill) adminStatusPill.style.display = 'none';
    }
  }

  async handleSelectedFiles(fileList) {
    const defaultCategory = document.getElementById('adminUploadCategory').value || 'General Photos';
    const totalFiles = fileList.length;
    let loadedCount = 0;

    window.app.showToast(`Processing ${totalFiles} image(s)...`, 'info');

    const newItems = [];
    const existingImages = await window.appStorage.getAllImages();
    let currentMaxIndex = existingImages.length;

    for (let i = 0; i < totalFiles; i++) {
      const file = fileList[i];
      if (!file.type.startsWith('image/')) {
        continue;
      }

      const dataUrl = await this.readFileAsDataURL(file);
      const cleanTitle = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');

      newItems.push({
        id: 'upload-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5),
        title: cleanTitle.charAt(0).toUpperCase() + cleanTitle.slice(1),
        category: defaultCategory,
        tags: [defaultCategory, 'Uploaded'],
        createdAt: Date.now(),
        orderIndex: ++currentMaxIndex,
        dataUrl: dataUrl
      });

      loadedCount++;
    }

    if (newItems.length > 0) {
      await window.appStorage.addMultipleImages(newItems);
      window.app.showToast(`Successfully added ${loadedCount} new photo(s)!`, 'success');
      this.loadAdminItemsList();
      window.app.refreshUI();

      // Trigger automatic prompt to convert merged PDF if desired
      const autoMerge = document.getElementById('adminAutoMergeCheck')?.checked;
      if (autoMerge) {
        setTimeout(() => {
          this.handleDirectMergeAll();
        }, 400);
      }
    }
  }

  readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
    });
  }

  async loadAdminItemsList() {
    const listContainer = document.getElementById('adminItemsGrid');
    if (!listContainer) return;

    const images = await window.appStorage.getAllImages();
    const countBadge = document.getElementById('adminTotalImagesCount');
    if (countBadge) countBadge.textContent = `${images.length} Photos`;

    if (images.length === 0) {
      listContainer.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 30px; color: var(--text-muted);">
          <i class="fa-regular fa-image" style="font-size: 2rem; margin-bottom: 8px;"></i>
          <p>No images in store yet. Upload photos above to start!</p>
        </div>
      `;
      return;
    }

    listContainer.innerHTML = images.map((img, idx) => `
      <div class="admin-item-card" data-id="${img.id}">
        <div class="admin-item-thumb">
          <img src="${img.dataUrl}" alt="${img.title}">
        </div>
        <div class="admin-item-title" title="${img.title}">${img.title}</div>
        <div style="font-size: 0.75rem; color: var(--text-dim); margin-bottom: 6px;">
          <span style="color: var(--primary); font-weight: 600;">[#${idx + 1}]</span> ${img.category}
        </div>
        <div class="admin-item-actions">
          <div style="display: flex; gap: 4px;">
            <button class="btn btn-secondary btn-sm" onclick="window.admin.moveItem('${img.id}', -1)" title="Move Up" ${idx === 0 ? 'disabled' : ''}>
              <i class="fa-solid fa-arrow-up"></i>
            </button>
            <button class="btn btn-secondary btn-sm" onclick="window.admin.moveItem('${img.id}', 1)" title="Move Down" ${idx === images.length - 1 ? 'disabled' : ''}>
              <i class="fa-solid fa-arrow-down"></i>
            </button>
          </div>
          <button class="btn btn-danger btn-sm" onclick="window.admin.deleteSingleItem('${img.id}')" title="Delete Photo">
            <i class="fa-solid fa-trash-can"></i>
          </button>
        </div>
      </div>
    `).join('');
  }

  async moveItem(id, direction) {
    const images = await window.appStorage.getAllImages();
    const currentIndex = images.findIndex(img => img.id === id);
    if (currentIndex === -1) return;

    const targetIndex = currentIndex + direction;
    if (targetIndex < 0 || targetIndex >= images.length) return;

    // Swap orderIndex
    const temp = images[currentIndex];
    images[currentIndex] = images[targetIndex];
    images[targetIndex] = temp;

    // Re-assign order indices
    images.forEach((img, idx) => {
      img.orderIndex = idx + 1;
    });

    await window.appStorage.addMultipleImages(images);
    this.loadAdminItemsList();
    window.app.refreshUI();
  }

  async deleteSingleItem(id) {
    const allImages = await window.appStorage.getAllImages();
    const item = allImages.find(img => img.id === id);
    const photoTitle = item?.title || 'this photo';

    window.app.askConfirmation({
      title: 'Delete Photo?',
      message: `Are you sure you want to delete "${photoTitle}" from the project storage?`,
      confirmBtnText: 'Delete',
      onConfirm: async () => {
        await window.appStorage.deleteImage(item || id);
        window.app.showToast(`Photo "${photoTitle}" deleted`, 'info');
        await this.loadAdminItemsList();
        await window.app.refreshUI();
      }
    });
  }

  async loadAdminCollectionsDropdown() {
    const select = document.getElementById('adminUploadCategory');
    if (!select) return;

    const allCollections = await window.appStorage.getAllCollectionsList();
    const images = await window.appStorage.getAllImages();
    const currentVal = select.value;

    if (allCollections.length === 0) {
      select.innerHTML = '<option value="" disabled selected>No collections yet — Add one in Option 2 below</option>';
      return;
    }

    select.innerHTML = allCollections.map(col => {
      const count = images.filter(img => img.category === col).length;
      return `<option value="${col}">${col} (${count} photo${count === 1 ? '' : 's'})</option>`;
    }).join('');

    if (currentVal && allCollections.includes(currentVal)) {
      select.value = currentVal;
    } else {
      select.value = allCollections[0];
    }
  }

  handleCategoryChange() {
    const select = document.getElementById('adminUploadCategory');
    if (!select || !select.value) return;
    const currentVal = select.value;
    window.app.showToast(`Active collection: "${currentVal}"`, 'info');
  }

  async handleAddNewCollection() {
    const input = document.getElementById('newCollectionNameInput');
    if (!input) return;
    const name = input.value.trim();
    if (!name) {
      window.app.showToast('Please enter a collection name', 'warning');
      return;
    }

    const result = await window.appStorage.addCollection(name);
    if (!result) {
      window.app.showToast(`Collection "${name}" already exists in database!`, 'warning');
      return;
    }

    input.value = '';
    window.app.showToast(`Collection "${name}" created! Opening collection...`, 'success');
    
    // Refresh dropdown
    await this.loadAdminCollectionsDropdown();
    const select = document.getElementById('adminUploadCategory');
    if (select) select.value = name;

    // Automatically open the collection photos modal so user can immediately upload photos!
    this.currentOpenedCollection = name;
    window.app.closeModal('adminDashboardModal');
    window.app.openModal('collectionPhotosModal');
    await this.loadCollectionPhotos(name);
    await window.app.refreshUI();
  }

  async openSelectedCollection() {
    const select = document.getElementById('adminUploadCategory');
    if (!select || !select.value) {
      window.app.showToast('Please add a collection in Option 2 first', 'warning');
      return;
    }

    this.currentOpenedCollection = select.value;
    window.app.closeModal('adminDashboardModal');
    window.app.openModal('collectionPhotosModal');
    await this.loadCollectionPhotos(this.currentOpenedCollection);
  }

  backToAdminMenu() {
    window.app.closeModal('collectionPhotosModal');
    window.app.openModal('adminDashboardModal');
    this.loadAdminCollectionsDropdown();
  }

  async loadCollectionPhotos(categoryName) {
    this.currentOpenedCollection = categoryName;
    const titleEl = document.getElementById('openedCollectionName');
    const countEl = document.getElementById('openedCollectionCount');
    const gridEl = document.getElementById('collectionPhotosGrid');

    if (titleEl) titleEl.textContent = categoryName;

    const allImages = await window.appStorage.getAllImages();
    const colImages = allImages.filter(img => img.category === categoryName);

    if (countEl) countEl.textContent = `${colImages.length} Photo${colImages.length === 1 ? '' : 's'}`;

    if (!gridEl) return;

    if (colImages.length === 0) {
      gridEl.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 36px 20px; color: var(--text-muted);">
          <i class="fa-regular fa-images" style="font-size: 2.2rem; color: var(--primary); margin-bottom: 10px; opacity: 0.7;"></i>
          <h4 style="font-size: 1.05rem; margin-bottom: 4px; color: var(--text-main);">No photos in this collection yet</h4>
          <p style="font-size: 0.85rem;">Click the dropzone above or drag & drop images to add photos into "${categoryName}".</p>
        </div>
      `;
      return;
    }

    gridEl.innerHTML = colImages.map((img, idx) => `
      <div class="admin-item-card" data-id="${img.id}">
        <div class="admin-item-thumb">
          <img src="${img.dataUrl}" alt="${img.title}">
        </div>
        <div class="admin-item-title" title="${img.title}">${img.title}</div>
        <div style="font-size: 0.75rem; color: var(--text-dim); margin-bottom: 6px;">
          <span style="color: var(--primary); font-weight: 600;">[Photo #${idx + 1}]</span>
        </div>
        <div class="admin-item-actions">
          <button class="btn btn-secondary btn-sm" onclick="window.admin.previewSinglePhotoPDF('${img.id}')" title="Preview single photo as PDF">
            <i class="fa-solid fa-file-pdf"></i> PDF
          </button>
          <button class="btn btn-danger btn-sm" onclick="window.admin.deletePhotoFromOpenedCollection('${img.id}')" title="Delete Photo">
            <i class="fa-solid fa-trash-can"></i>
          </button>
        </div>
      </div>
    `).join('');
  }

  async previewSinglePhotoPDF(id) {
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
    const images = await window.appStorage.getAllImages();
    const item = images.find(img => img.id === id);
    if (!item) return;
    window.app.closeModal('collectionPhotosModal');
    window.app.openPDFViewerModal([item], `${item.title}.pdf`, item.category);
  }

  async handleCollectionSelectedFiles(fileList) {
    if (!this.currentOpenedCollection) {
      this.currentOpenedCollection = document.getElementById('openedCollectionName')?.textContent?.trim() || 
        document.getElementById('adminUploadCategory')?.value || 
        'General Collection';
    }

    const targetCategory = this.currentOpenedCollection;
    const totalFiles = fileList.length;

    window.app.showToast(`Uploading ${totalFiles} photo(s) to "${targetCategory}"...`, 'info');

    // Filter valid image files
    const validFiles = [];
    for (let i = 0; i < totalFiles; i++) {
      const file = fileList[i];
      const isImage = !file.type || 
        file.type.toLowerCase().startsWith('image/') || 
        /\.(jpe?g|png|webp|gif|svg|bmp|jfif|heic|avif|ico|tiff?)$/i.test(file.name);
      if (isImage) {
        validFiles.push(file);
      }
    }

    if (validFiles.length === 0) {
      window.app.showToast('No valid image files found to upload.', 'warning');
      return;
    }

    // 1. Try backend direct disk upload into uploads/<targetCategory>/
    const savedDiskItems = await window.appStorage.uploadImageFiles(targetCategory, validFiles);
    if (savedDiskItems && savedDiskItems.length > 0) {
      window.app.showToast(`Saved ${savedDiskItems.length} photo(s) to project folder "uploads/${targetCategory}/"!`, 'success');
      await this.loadCollectionPhotos(targetCategory);
      await window.app.refreshUI();
      return;
    }

    // 2. Fallback to base64 in IndexedDB
    let loadedCount = 0;
    const newItems = [];
    const existingImages = await window.appStorage.getAllImages();
    let currentMaxIndex = existingImages.length;

    for (let i = 0; i < validFiles.length; i++) {
      const file = validFiles[i];
      try {
        const dataUrl = await this.readFileAsDataURL(file);
        const cleanTitle = (file.name || `Photo ${currentMaxIndex + 1}`).replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');

        newItems.push({
          id: 'upload-' + Date.now() + '-' + Math.random().toString(36).substr(2, 7) + '-' + i,
          title: cleanTitle.charAt(0).toUpperCase() + cleanTitle.slice(1),
          category: targetCategory,
          filename: file.name,
          tags: [targetCategory, 'Uploaded'],
          createdAt: Date.now() + i,
          orderIndex: ++currentMaxIndex,
          dataUrl: dataUrl
        });

        loadedCount++;
      } catch (err) {
        console.error('File read error for file:', file.name, err);
      }
    }

    if (newItems.length > 0) {
      await window.appStorage.addMultipleImages(newItems);
      await window.appStorage.addCollection(targetCategory);
      window.app.showToast(`Successfully added ${loadedCount} photo(s) into "${targetCategory}"!`, 'success');
      await this.loadCollectionPhotos(targetCategory);
      await window.app.refreshUI();
    } else {
      window.app.showToast('Failed to process image files.', 'error');
    }
  }

  async deletePhotoFromOpenedCollection(id) {
    const allImages = await window.appStorage.getAllImages();
    const item = allImages.find(img => img.id === id);
    const photoTitle = item?.title || 'this photo';

    window.app.askConfirmation({
      title: 'Delete Photo?',
      message: `Are you sure you want to delete "${photoTitle}" from "${this.currentOpenedCollection}" and the local project folder?`,
      confirmBtnText: 'Delete Photo',
      onConfirm: async () => {
        await window.appStorage.deleteImage(item || id);
        window.app.showToast(`Photo "${photoTitle}" deleted from collection`, 'info');
        await this.loadCollectionPhotos(this.currentOpenedCollection);
        await window.app.refreshUI();
      }
    });
  }

  async convertOpenedCollectionToPDF() {
    if (!this.currentOpenedCollection) return;
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
    const images = await window.appStorage.getAllImages();
    const colImages = images.filter(img => img.category === this.currentOpenedCollection);

    window.app.closeModal('collectionPhotosModal');
    window.app.openPDFViewerModal(colImages, `${this.currentOpenedCollection}.pdf`, this.currentOpenedCollection);
  }

  async handleDeleteCurrentCollection() {
    const select = document.getElementById('adminUploadCategory');
    if (!select || !select.value) return;
    const selectedCategory = select.value;

    window.app.askConfirmation({
      title: 'Delete Collection?',
      message: `Are you sure you want to delete collection "${selectedCategory}" and all its photos from the project folder?`,
      confirmBtnText: 'Delete Collection',
      onConfirm: async () => {
        await window.appStorage.deleteCollection(selectedCategory);
        window.app.showToast(`Collection "${selectedCategory}" deleted`, 'info');
        await this.loadAdminCollectionsDropdown();
        await window.app.refreshUI();
      }
    });
  }

  async handleDirectMergeAll() {
    const images = await window.appStorage.getAllImages();
    if (images.length === 0) {
      window.app.showToast('No photos available in database to merge', 'error');
      return;
    }

    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
    window.app.showToast('Merging all collections into master PDF...', 'info');
    window.app.closeModal('adminDashboardModal');
    window.app.openPDFViewerModal(images, 'All Collections Merged.pdf');
  }

  async handleResetData() {
    if (confirm('Reset database back to initial default study notes & collections?')) {
      await window.appStorage.clearAll();
      await window.appStorage.seedInitialDataIfEmpty();
      window.app.showToast('Database reset to defaults successfully!', 'success');
      this.loadAdminItemsList();
      await this.loadAdminCollectionsDropdown();
      window.app.refreshUI();
    }
  }
}

window.admin = new AdminManager();
