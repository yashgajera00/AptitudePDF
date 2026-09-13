/**
 * Interactive 3D Card Fan Carousel Engine
 * Full continuous cycling for any number of cards, robust GSAP animations, and click-to-PDF.
 */

class CardFanCarousel {
  constructor(containerId, options = {}) {
    window.cardFanCarousel = this;
    this.container = document.getElementById(containerId);
    if (!this.container) return;

    this.options = Object.assign({
      maxVisible: 7,
      half: 3,
      onCardClick: null
    }, options);

    this.cards = [];
    this.centerIndex = 0;
    this.isAnimating = false;
    this.hasEntered = false;
    this.direction = null;
    this.prevVisible = new Set();
    this.activeSlot = null;
    this.leaveTimer = null;

    // Symmetrical 7-slot geometric curvature & scale matrix
    this.fanPositions = [
      { rot: -21, scale: 0.7756, x: -30, y: 7.3, zIndex: 1 },
      { rot: -14, scale: 0.8498, x: -22, y: 4.0, zIndex: 2 },
      { rot: -7,  scale: 0.9346, x: -11, y: 1.3, zIndex: 3 },
      { rot: 0,   scale: 1.0,    x: 0,   y: 0.0, zIndex: 10 },
      { rot: 7,   scale: 0.9346, x: 11,  y: 1.3, zIndex: 3 },
      { rot: 14,  scale: 0.8498, x: 22,  y: 4.0, zIndex: 2 },
      { rot: 21,  scale: 0.7756, x: 30,  y: 7.3, zIndex: 1 },
    ];

    this.bindGlobalEvents();
  }

  getResponsiveMultiplier(width) {
    if (width < 480) return 0.28;
    if (width < 640) return 0.38;
    if (width < 768) return 0.52;
    if (width < 1024) return 0.78;
    return 1.0;
  }

  getHeightMultiplier(width) {
    let idealPx = 38 * 16;
    if (width < 480) idealPx = 22 * 16;
    else if (width < 640) idealPx = 26 * 16;
    else if (width < 768) idealPx = 28 * 16;
    else if (width < 1024) idealPx = 34 * 16;

    const available = window.innerHeight * 0.7;
    if (available >= idealPx) return 1;
    return available / idealPx;
  }

  getSlotConfig(totalCards, slot) {
    if (totalCards <= 1) {
      return { rot: 0, scale: 1.0, x: 0, y: 0.0, zIndex: 10 };
    }
    if (totalCards === 2) {
      return slot === 0
        ? { rot: -8, scale: 0.96, x: -11, y: 1.2, zIndex: 5 }
        : { rot: 8, scale: 0.96, x: 11, y: 1.2, zIndex: 5 };
    }
    if (totalCards >= this.options.maxVisible) return this.fanPositions[slot];
    const center = (totalCards - 1) / 2;
    const distance = center > 0 ? (slot - center) / center : 0;
    const absDistance = Math.abs(distance);
    return {
      rot: distance * 21,
      scale: 1.0 - 0.2244 * absDistance * absDistance,
      x: distance * 28,
      y: absDistance * absDistance * 7.3,
      zIndex: 10 - Math.round(absDistance * 5),
    };
  }

  setCards(cardsData) {
    this.cards = cardsData || [];
    const totalCards = this.cards.length;
    this.centerIndex = 0;
    this.hasEntered = false;
    this.isAnimating = false;
    this.render();
  }

  /**
   * Maps each card to a visible slot based on current centerIndex
   */
  getVisibleMap(center) {
    const map = new Map();
    const total = this.cards.length;
    if (total === 0) return map;

    const visibleSlots = Math.min(this.options.maxVisible, total);
    const halfSlots = Math.floor(visibleSlots / 2);

    for (let slot = 0; slot < visibleSlots; slot++) {
      const cardIdx = ((center + slot - halfSlots) % total + total) % total;
      map.set(cardIdx, slot);
    }
    return map;
  }

  cycle(direction) {
    const totalCards = this.cards.length;
    if (totalCards <= 1) return;

    this.isAnimating = true;
    this.direction = direction;
    this.centerIndex = direction === 'right' 
      ? (this.centerIndex + 1) % totalCards 
      : (this.centerIndex - 1 + totalCards) % totalCards;

    this.updateLayout();
    this.updateDots();
    this.updateAmbientBackdrop();

    // Safety timeout to prevent animation locking
    setTimeout(() => {
      this.isAnimating = false;
    }, 450);
  }

  render() {
    if (!this.container) return;

    if (!this.cards || this.cards.length === 0) {
      this.container.innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 40px 24px; background: rgba(255, 255, 255, 0.7); border: 1px dashed var(--border-color); border-radius: 28px; backdrop-filter: blur(20px); max-width: 460px; margin: 0 auto; box-shadow: 0 10px 30px rgba(0,0,0,0.06); z-index: 20; position: relative;">
          <div style="width: 56px; height: 56px; border-radius: 50%; background: var(--primary-light); color: var(--primary); display: flex; align-items: center; justify-content: center; font-size: 1.5rem; margin-bottom: 14px;">
            <i class="fa-solid fa-folder-open"></i>
          </div>
          <h3 style="font-size: 1.2rem; font-weight: 700; margin-bottom: 6px; color: var(--text-main);">Database is Empty</h3>
          <p style="font-size: 0.88rem; color: var(--text-muted); margin-bottom: 20px; line-height: 1.5;">Click "Login with Admin" in the top-right corner to add your custom collections and upload study notes.</p>
          <button class="pill-action-btn" onclick="window.app.openModal('adminLoginModal')" style="font-size: 0.88rem; padding: 10px 22px;">
            <i class="fa-solid fa-user-shield"></i> Open Admin Portal
          </button>
        </div>
      `;
      const dotsContainer = document.getElementById('fanDotsContainer');
      if (dotsContainer) dotsContainer.innerHTML = '';
      return;
    }

    const icons = [
      'fa-solid fa-calculator',
      'fa-solid fa-brain',
      'fa-solid fa-book-bookmark',
      'fa-solid fa-chart-pie',
      'fa-solid fa-shapes',
      'fa-solid fa-compass-drafting',
      'fa-solid fa-certificate'
    ];

    this.container.innerHTML = this.cards.map((card, index) => {
      const iconClass = icons[index % icons.length];
      return `
        <div class="fan-card" data-index="${index}" onclick="window.cardFanCarousel.handleCardClick(${index})">
          <div class="fan-card-full-image bronze-grain-gradient">
            <div class="fan-card-glow-bg"></div>
            
            <!-- Top Tag & Icon -->
            <div class="fan-card-top-row">
              <span class="fan-card-pill-tag">Collection #${index + 1}</span>
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
              <button class="fan-card-action-btn" onclick="event.stopPropagation(); window.cardFanCarousel.handleCardClick(${index})">
                <i class="fa-solid fa-file-pdf"></i> Open PDF
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    this.updateDots();
    this.updateLayout();
    this.attachCardInteractions();
  }

  updateDots() {
    const dotsContainer = document.getElementById('fanDotsContainer');
    if (!dotsContainer) return;

    dotsContainer.innerHTML = this.cards.map((_, i) => `
      <span class="fan-dot ${i === this.centerIndex ? 'active' : ''}" onclick="window.cardFanCarousel.jumpTo(${i})"></span>
    `).join('');
  }

  jumpTo(index) {
    if (index === this.centerIndex) return;
    const direction = index > this.centerIndex ? 'right' : 'left';
    this.direction = direction;
    this.centerIndex = index;
    this.updateLayout();
    this.updateDots();
  }

  updateLayout() {
    const totalCards = this.cards.length;
    if (!this.container || !totalCards || !window.gsap) return;

    const cardElements = Array.from(this.container.querySelectorAll('.fan-card'));
    if (!cardElements.length) return;

    const visibleMap = this.getVisibleMap(this.centerIndex);
    const previouslyVisible = this.prevVisible;
    const direction = this.direction;
    const isFirstMount = !this.hasEntered;
    const multiplier = this.getResponsiveMultiplier(window.innerWidth);
    const hMult = this.getHeightMultiplier(window.innerWidth);
    const slotCount = Math.min(this.options.maxVisible, totalCards);
    const config = (slot) => this.getSlotConfig(slotCount, slot);

    let completedCount = 0;
    const visibleCount = visibleMap.size;
    const onCardDone = () => {
      if (++completedCount >= visibleCount) {
        this.isAnimating = false;
        if (isFirstMount) this.hasEntered = true;
      }
    };

    cardElements.forEach((card, cardIndex) => {
      const slot = visibleMap.get(cardIndex);
      const wasVisible = previouslyVisible.has(cardIndex);

      if (slot !== undefined) {
        const { x, y, rot, scale, zIndex } = config(slot);
        const target = {
          x: `${x * multiplier}rem`,
          y: `${y * hMult}rem`,
          rotation: rot,
          scale,
          opacity: 1,
          zIndex: zIndex + 2,
        };

        if (isFirstMount) {
          gsap.set(card, { x: 0, y: `${12 * hMult}rem`, rotation: 0, scale: 0.5, opacity: 0 });
          gsap.to(card, { ...target, duration: 1.1, ease: 'elastic.out(1.05,.78)', delay: 0.15 + slot * 0.05, onComplete: onCardDone });
        } else if (!wasVisible) {
          const enterX = direction === 'right' ? 40 : -40;
          gsap.set(card, { x: `${enterX}rem`, y: `${y * hMult}rem`, rotation: direction === 'right' ? 30 : -30, scale: 0.5, opacity: 0 });
          gsap.to(card, { ...target, duration: 0.55, ease: 'power2.out', onComplete: onCardDone });
        } else {
          gsap.to(card, { ...target, duration: 0.45, ease: 'power2.out', onComplete: onCardDone });
        }
      } else if (wasVisible) {
        const exitX = direction === 'right' ? -40 : 40;
        gsap.to(card, { x: `${exitX}rem`, opacity: 0, scale: 0.4, rotation: direction === 'right' ? -30 : 30, duration: 0.35, ease: 'power2.in', zIndex: 0 });
      } else if (isFirstMount) {
        gsap.set(card, { opacity: 0, scale: 0.3, x: 0, y: 0, zIndex: 0 });
      }
    });

    this.prevVisible = new Set(visibleMap.keys());
  }

  attachCardInteractions() {
    const cardElements = Array.from(this.container.querySelectorAll('.fan-card'));
    const totalCards = this.cards.length;
    const slotCount = Math.min(this.options.maxVisible, totalCards);
    const config = (slot) => this.getSlotConfig(slotCount, slot);

    const updateHoverLayout = (hoveredSlot) => {
      const visibleMap = this.getVisibleMap(this.centerIndex);
      const visibleEntries = [];
      cardElements.forEach((el, i) => {
        const slot = visibleMap.get(i);
        if (slot !== undefined) visibleEntries.push({ el, slot });
      });
      visibleEntries.sort((a, b) => a.slot - b.slot);

      const mult = this.getResponsiveMultiplier(window.innerWidth);
      const hM = this.getHeightMultiplier(window.innerWidth);
      const centerSlot = visibleEntries.length >> 1;

      visibleEntries.forEach(({ el, slot }) => {
        const base = config(slot);
        let targetX = base.x * mult;
        let targetY = base.y * hM;
        let targetRot = base.rot;
        let targetScale = base.scale;
        let delay = 0;

        if (hoveredSlot !== null) {
          const distance = Math.abs(slot - hoveredSlot);
          delay = distance * 0.02;

          if (slot === hoveredSlot) {
            targetY -= 2.8 * hM;
            targetScale *= 1.1;
          } else {
            const normalized = centerSlot > 0 ? (slot - centerSlot) / centerSlot : 0;
            const pushStrength = 8 * (1 - Math.abs(normalized)) * (1 + 0.2 * Math.max(0, 3 - distance));

            if (slot < hoveredSlot) {
              targetX -= pushStrength * mult;
              targetRot -= 3 / (distance + 1);
            } else {
              targetX += pushStrength * mult;
              targetRot += 3 / (distance + 1);
            }

            if (slot === visibleEntries.length - 1 && hoveredSlot < centerSlot) targetY -= 1 * hM;
            if (slot === 0 && hoveredSlot > centerSlot) targetY -= 1 * hM;
          }
        } else {
          delay = Math.abs(slot - centerSlot) * 0.02;
        }

        gsap.to(el, {
          x: `${targetX}rem`, y: `${targetY}rem`, rotation: targetRot, scale: targetScale,
          duration: 0.45, delay, ease: 'elastic.out(1,.75)', overwrite: 'auto',
        });
        gsap.set(el, { zIndex: base.zIndex + (slot === hoveredSlot ? 25 : 2) });
      });
    };

    cardElements.forEach((el, i) => {
      el.addEventListener('mouseenter', () => {
        const visibleMap = this.getVisibleMap(this.centerIndex);
        const slot = visibleMap.get(i);
        if (slot !== undefined) {
          if (this.leaveTimer) { clearTimeout(this.leaveTimer); this.leaveTimer = null; }
          this.activeSlot = slot;
          updateHoverLayout(slot);

        }
      });
    });

    this.container.addEventListener('mouseleave', () => {
      if (this.leaveTimer) clearTimeout(this.leaveTimer);
      this.leaveTimer = setTimeout(() => {
        this.activeSlot = null;
        updateHoverLayout(null);
      }, 50);
    });
  }

  bindGlobalEvents() {
    window.addEventListener('resize', () => {
      this.updateLayout();
    });

    // Arrow button listeners
    const prevBtn = document.getElementById('fanPrevBtn');
    const nextBtn = document.getElementById('fanNextBtn');
    
    if (prevBtn) {
      prevBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.cycle('left');
      };
    }

    if (nextBtn) {
      nextBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.cycle('right');
      };
    }
  }

  handleCardClick(index) {
    const cardData = this.cards[index];
    if (cardData) {
      if (typeof this.options.onCardClick === 'function') {
        this.options.onCardClick(cardData);
      } else if (window.app && typeof window.app.openAlbumAsPDF === 'function') {
        window.app.openAlbumAsPDF(cardData.category || cardData);
      }
    }
  }
}

window.CardFanCarousel = CardFanCarousel;
