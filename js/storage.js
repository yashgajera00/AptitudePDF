/**
 * Storage Manager for Image Storing & PDF Application
 * Utilizes IndexedDB for high-capacity image storage and LocalStorage for metadata/session.
 */

const DB_NAME = 'AptitudeImagePDF_DB';
const DB_VERSION = 2;
const STORE_NAME = 'images_store';
const COLLECTIONS_STORE = 'collections_store';

class StorageManager {
  constructor() {
    this.db = null;
    this.isReady = this.initDB();
  }

  async initDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('category', 'category', { unique: false });
          store.createIndex('createdAt', 'createdAt', { unique: false });
        }
        if (!db.objectStoreNames.contains(COLLECTIONS_STORE)) {
          const colStore = db.createObjectStore(COLLECTIONS_STORE, { keyPath: 'id' });
          colStore.createIndex('name', 'name', { unique: true });
          colStore.createIndex('createdAt', 'createdAt', { unique: false });
        }
      };

      request.onsuccess = async (event) => {
        this.db = event.target.result;
        resolve(this.db);
      };

      request.onerror = (event) => {
        console.error('IndexedDB error:', event.target.error);
        reject(event.target.error);
      };
    });
  }

  // --- COLLECTIONS DATABASE & DISK CRUD ---
  async getAllCollections() {
    try {
      const res = await fetch('/api/collections', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (data && data.success && Array.isArray(data.collections) && data.collections.length > 0) {
          return data.collections;
        }
      }
    } catch (e) {
      // Fallback to static metadata.json
    }

    try {
      const metaRes = await fetch('/uploads/metadata.json', { cache: 'no-store' });
      if (metaRes.ok) {
        const meta = await metaRes.json();
        if (meta && meta.collections) {
          const colList = Array.isArray(meta.collections) ? meta.collections : Object.values(meta.collections);
          if (colList.length > 0) {
            return colList;
          }
        }
      }
    } catch (e) {
      // Fallback to IndexedDB
    }

    await this.isReady;
    return new Promise((resolve) => {
      try {
        const tx = this.db.transaction([COLLECTIONS_STORE], 'readonly');
        const store = tx.objectStore(COLLECTIONS_STORE);
        const request = store.getAll();

        request.onsuccess = () => {
          let results = request.result || [];
          results.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
          resolve(results);
        };
        request.onerror = () => resolve([]);
      } catch (err) {
        resolve([]);
      }
    });
  }

  async addCollection(name, description = '') {
    const cleanName = (name || '').trim();
    if (!cleanName) return null;

    try {
      const res = await fetch('/api/collections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: cleanName, description })
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.success && data.collection) {
          return data.collection;
        }
      }
    } catch (e) {
      console.warn('Backend addCollection fallback to IndexedDB:', e);
    }

    await this.isReady;
    const existing = await this.getAllCollections();
    const found = existing.find(c => c.name.toLowerCase() === cleanName.toLowerCase());
    if (found) {
      return found;
    }

    const newCollection = {
      id: 'col-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
      name: cleanName,
      description: description || `Collection for ${cleanName}`,
      createdAt: Date.now()
    };

    return new Promise((resolve) => {
      try {
        const tx = this.db.transaction([COLLECTIONS_STORE], 'readwrite');
        const store = tx.objectStore(COLLECTIONS_STORE);
        const request = store.put(newCollection);

        request.onsuccess = () => resolve(newCollection);
        request.onerror = () => resolve(newCollection);
      } catch (err) {
        resolve(newCollection);
      }
    });
  }

  async deleteCollection(idOrName) {
    try {
      const res = await fetch('/api/collections', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: idOrName })
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.success) return true;
      }
    } catch (e) {
      console.warn('Backend deleteCollection fallback:', e);
    }

    await this.isReady;
    const collections = await this.getAllCollections();
    const target = collections.find(c => c.id === idOrName || c.name === idOrName);
    if (!target) return false;

    return new Promise((resolve) => {
      try {
        const tx = this.db.transaction([COLLECTIONS_STORE], 'readwrite');
        const store = tx.objectStore(COLLECTIONS_STORE);
        const request = store.delete(target.id);

        request.onsuccess = () => resolve(true);
        request.onerror = () => resolve(false);
      } catch (err) {
        resolve(false);
      }
    });
  }

  // --- IMAGES DATABASE & DISK CRUD ---
  async getAllImages() {
    try {
      const res = await fetch('/api/data', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (data && data.success && Array.isArray(data.images) && data.images.length > 0) {
          return data.images;
        }
      }
    } catch (e) {
      // Fallback to static metadata.json
    }

    try {
      const metaRes = await fetch('/uploads/metadata.json', { cache: 'no-store' });
      if (metaRes.ok) {
        const meta = await metaRes.json();
        if (meta && Array.isArray(meta.images) && meta.images.length > 0) {
          return meta.images;
        }
      }
    } catch (e) {
      // Fallback to IndexedDB
    }

    await this.isReady;
    return new Promise((resolve) => {
      try {
        const tx = this.db.transaction([STORE_NAME], 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const request = store.getAll();

        request.onsuccess = () => {
          let results = request.result || [];
          results.sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
          resolve(results);
        };
        request.onerror = () => resolve([]);
      } catch (err) {
        resolve([]);
      }
    });
  }

  /**
   * Upload image files directly to the project folder 'uploads/<category>/' via backend API
   */
  async uploadImageFiles(category, filesArray) {
    const formData = new FormData();
    formData.append('category', category);

    for (let i = 0; i < filesArray.length; i++) {
      formData.append('files', filesArray[i], filesArray[i].name);
    }

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });

      if (res.ok) {
        const data = await res.json();
        if (data && data.success && Array.isArray(data.saved)) {
          return data.saved;
        }
      }
    } catch (err) {
      console.warn('Backend upload failed, attempting base64 fallback:', err);
    }

    // Fallback: convert to base64 and save to IndexedDB
    return null;
  }

  async addImage(imageItem) {
    await this.isReady;
    return new Promise((resolve, reject) => {
      try {
        const tx = this.db.transaction([STORE_NAME], 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const request = store.put(imageItem);

        request.onsuccess = () => resolve(imageItem);
        request.onerror = () => reject(request.error);
      } catch (err) {
        reject(err);
      }
    });
  }

  async addMultipleImages(imagesArray) {
    await this.isReady;
    return new Promise((resolve, reject) => {
      try {
        const tx = this.db.transaction([STORE_NAME], 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        
        imagesArray.forEach((img) => store.put(img));

        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(new Error('IndexedDB transaction aborted'));
      } catch (err) {
        reject(err);
      }
    });
  }

  async deleteImage(idOrItem) {
    const id = typeof idOrItem === 'string' ? idOrItem : idOrItem?.id;
    const category = idOrItem?.category;
    const filename = idOrItem?.filename;

    try {
      const res = await fetch('/api/images', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, category, filename })
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.success) return true;
      }
    } catch (e) {
      console.warn('Backend deleteImage fallback:', e);
    }

    await this.isReady;
    return new Promise((resolve) => {
      try {
        const tx = this.db.transaction([STORE_NAME], 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const request = store.delete(id);

        request.onsuccess = () => resolve(true);
        request.onerror = () => resolve(false);
      } catch (err) {
        resolve(false);
      }
    });
  }

  async clearAll() {
    await this.isReady;
    return new Promise((resolve) => {
      try {
        const tx = this.db.transaction([STORE_NAME, COLLECTIONS_STORE], 'readwrite');
        tx.objectStore(STORE_NAME).clear();
        tx.objectStore(COLLECTIONS_STORE).clear();

        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(true);
      } catch (err) {
        resolve(true);
      }
    });
  }

  // Admin Auth State Helpers
  isAdminLoggedIn() {
    return sessionStorage.getItem('admin_authenticated') === 'true';
  }

  setAdminLoggedIn(status) {
    if (status) {
      sessionStorage.setItem('admin_authenticated', 'true');
    } else {
      sessionStorage.removeItem('admin_authenticated');
    }
  }

  async getAllCollectionsList() {
    const dbCollections = await this.getAllCollections();
    const images = await this.getAllImages();
    const imageCats = images.map(img => img.category).filter(Boolean);
    const dbCatNames = dbCollections.map(c => c.name);

    return Array.from(new Set([...dbCatNames, ...imageCats]));
  }

  // Generate Sample High-Res SVGs as default images if store is empty
  async seedInitialDataIfEmpty() {
    const images = await this.getAllImages();
    if (images.length > 0) return;

    const samples = [
      {
        id: 'img-1',
        title: 'Quantitative Aptitude - Number System Formulas',
        category: 'Aptitude Formulas',
        tags: ['Math', 'Numbers', 'Formulas'],
        createdAt: Date.now() - 500000,
        orderIndex: 1,
        dataUrl: this.createSampleCardDataUrl(
          'Quantitative Aptitude',
          'NUMBER SYSTEM & HCF/LCM',
          '• Product of two numbers = HCF × LCM\n• Sum of 1st n natural numbers = n(n+1)/2\n• Sum of squares = n(n+1)(2n+1)/6\n• Divisibility by 7: Subtract twice the last digit from the rest\n• (a + b)² = a² + 2ab + b²',
          '#4f46e5',
          '#06b6d4'
        )
      },
      {
        id: 'img-2',
        title: 'Time, Speed & Distance Quick Rules',
        category: 'Aptitude Formulas',
        tags: ['Speed', 'Time', 'Distance'],
        createdAt: Date.now() - 400000,
        orderIndex: 2,
        dataUrl: this.createSampleCardDataUrl(
          'Quantitative Aptitude',
          'TIME, SPEED & DISTANCE',
          '• Speed = Distance / Time\n• Convert km/h to m/s: multiply by 5/18\n• Convert m/s to km/h: multiply by 18/5\n• Average Speed (equal distances) = 2xy / (x + y)\n• Relative Speed (opposite direction) = S1 + S2',
          '#ec4899',
          '#8b5cf6'
        )
      },
      {
        id: 'img-3',
        title: 'Profit, Loss & Discount Cheat Sheet',
        category: 'Aptitude Formulas',
        tags: ['Profit', 'Loss', 'Discount'],
        createdAt: Date.now() - 300000,
        orderIndex: 3,
        dataUrl: this.createSampleCardDataUrl(
          'Commercial Math',
          'PROFIT, LOSS & DISCOUNT',
          '• Gain% = (Gain / CP) × 100\n• Loss% = (Loss / CP) × 100\n• SP = CP × (100 + Gain%) / 100\n• Marked Price = SP + Discount\n• Single equivalent discount for d1 & d2 = (d1 + d2 - d1×d2/100)%',
          '#10b981',
          '#059669'
        )
      },
      {
        id: 'img-4',
        title: 'Logical Reasoning - Syllogism & Blood Relations',
        category: 'Logical Reasoning',
        tags: ['Logic', 'Reasoning', 'Puzzles'],
        createdAt: Date.now() - 200000,
        orderIndex: 4,
        dataUrl: this.createSampleCardDataUrl(
          'Logical Reasoning',
          'SYLLOGISM & BLOOD RELATIONS',
          '• Universal Positive (All A are B): Type A\n• Particular Positive (Some A are B): Type I\n• Universal Negative (No A is B): Type E\n• Father of son = Himself (if only son)\n• Mother\'s brother = Maternal Uncle',
          '#f59e0b',
          '#d97706'
        )
      },
      {
        id: 'img-5',
        title: 'Verbal Ability & Grammar Highlights',
        category: 'Verbal Ability',
        tags: ['English', 'Grammar', 'Vocabulary'],
        createdAt: Date.now() - 100000,
        orderIndex: 5,
        dataUrl: this.createSampleCardDataUrl(
          'Verbal Ability',
          'GRAMMAR RULES & VOCAB',
          '• Subject-Verb Agreement: Singular subject takes singular verb\n• Neither/Nor: Verb agrees with closest subject\n• Idioms: "Bite the bullet" = Face hardship bravely\n• Root Word: \'Bene\' means Good (Benefactor, Benefit)\n• Active vs Passive Voice conversions',
          '#3b82f6',
          '#1d4ed8'
        )
      },
      {
        id: 'img-6',
        title: 'Data Interpretation - Charts & Graphs',
        category: 'Data Interpretation',
        tags: ['DI', 'Bar Chart', 'Pie Chart'],
        createdAt: Date.now(),
        orderIndex: 6,
        dataUrl: this.createSampleCardDataUrl(
          'Data Interpretation',
          'PIE CHARTS & RATIO TABLES',
          '• Total Angle in Pie Chart = 360°\n• Percentage to Angle conversion: (P% / 100) × 360°\n• Growth Rate = ((Current - Previous) / Previous) × 100\n• Weighted Average = (w1·x1 + w2·x2) / (w1 + w2)\n• Tabular approximation techniques',
          '#8b5cf6',
          '#6366f1'
        )
      }
    ];

    await this.addMultipleImages(samples);
  }

  // Create crisp aesthetic card graphics formatted in Base64
  createSampleCardDataUrl(categoryTitle, mainTitle, pointsText, color1, color2) {
    const canvas = document.createElement('canvas');
    canvas.width = 1000;
    canvas.height = 750;
    const ctx = canvas.getContext('2d');

    // Background Gradient
    const bgGrad = ctx.createLinearGradient(0, 0, 1000, 750);
    bgGrad.addColorStop(0, '#0f172a');
    bgGrad.addColorStop(1, '#1e293b');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, 1000, 750);

    // Accent Header Bar
    const headerGrad = ctx.createLinearGradient(0, 0, 1000, 0);
    headerGrad.addColorStop(0, color1);
    headerGrad.addColorStop(1, color2);
    ctx.fillStyle = headerGrad;
    ctx.fillRect(0, 0, 1000, 16);

    // Subtle glow circle
    const glowGrad = ctx.createRadialGradient(850, 150, 10, 850, 150, 300);
    glowGrad.addColorStop(0, color1 + '33');
    glowGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = glowGrad;
    ctx.fillRect(0, 0, 1000, 750);

    // Badge Pill
    ctx.fillStyle = color1 + '22';
    ctx.strokeStyle = color1 + '88';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(60, 60, 240, 44, 22);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 18px Outfit, sans-serif';
    ctx.fillText('✦ ' + categoryTitle.toUpperCase(), 82, 88);

    // Main Title
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 36px Outfit, sans-serif';
    ctx.fillText(mainTitle, 60, 160);

    // Divider
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(60, 190);
    ctx.lineTo(940, 190);
    ctx.stroke();

    // Points / Body Content
    ctx.fillStyle = '#e2e8f0';
    ctx.font = '500 24px Inter, sans-serif';
    const lines = pointsText.split('\n');
    let y = 260;
    for (const line of lines) {
      // Content Box background for each bullet
      ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
      ctx.beginPath();
      ctx.roundRect(60, y - 32, 880, 56, 12);
      ctx.fill();

      // Text
      ctx.fillStyle = '#cbd5e1';
      ctx.fillText(line, 85, y + 4);
      y += 74;
    }

    // Footer Watermark
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.font = '600 16px Inter, sans-serif';
    ctx.fillText('Aptitude Study & PDF System • Document Reference', 60, 710);

    // Stamp Icon
    ctx.fillStyle = color2;
    ctx.font = 'bold 18px Outfit, sans-serif';
    ctx.fillText('★ CERTIFIED REFERENCE', 720, 710);

    return canvas.toDataURL('image/jpeg', 0.95);
  }
}

window.appStorage = new StorageManager();
