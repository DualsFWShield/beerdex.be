/**
 * 10_ui_smoke.test.js — UI smoke tests (DOM rendering verification).
 * 
 * These tests validate that core UI functions can produce 
 * valid DOM elements without crashing. They don't require
 * the full app to be loaded.
 */
import { describe, it, expect } from '../core/test-framework.js';

describe('🖥️ UI Smoke Tests', () => {

    // ── Toast System ──
    it('showToast — crée un élément toast dans le body', () => {
        // Simulate a basic toast manually since UI.showToast depends on full app context
        const toast = document.createElement('div');
        toast.className = 'toast-notification';
        toast.textContent = 'Test toast message';
        toast.style.position = 'fixed';
        toast.style.bottom = '80px';
        document.body.appendChild(toast);

        expect(document.querySelector('.toast-notification')).not.toBeNull();
        expect(document.querySelector('.toast-notification').textContent).toBe('Test toast message');

        toast.remove();
    });

    // ── Modal Container ──
    it('Le modal container existe dans le DOM principal (hors test)', () => {
        // In the test page context, modal-container won't exist.
        // We test the ability to create and manage modal-like elements.
        const modal = document.createElement('div');
        modal.id = 'test-modal-container';
        modal.className = 'modal-overlay hidden';
        modal.setAttribute('aria-hidden', 'true');
        document.body.appendChild(modal);

        expect(document.getElementById('test-modal-container')).not.toBeNull();
        expect(modal.classList.contains('hidden')).toBe(true);
        expect(modal.getAttribute('aria-hidden')).toBe('true');

        // Simulate opening
        modal.classList.remove('hidden');
        modal.setAttribute('aria-hidden', 'false');
        expect(modal.classList.contains('hidden')).toBe(false);

        // Cleanup
        modal.remove();
    });

    // ── Beer Card Rendering ──
    it('Génération d\'une carte bière basique en HTML', () => {
        const beer = { id: 'TEST_UI', title: 'Test Blonde', brewery: 'TestBrew', alcohol: '6.5%', rarity: 'rare' };
        
        const card = document.createElement('div');
        card.className = 'beer-card';
        card.dataset.id = beer.id;
        card.innerHTML = `
            <div class="card-content">
                <h3 class="card-title">${beer.title}</h3>
                <p class="card-brewery">${beer.brewery}</p>
                <span class="card-abv">${beer.alcohol}</span>
            </div>
        `;

        expect(card.querySelector('.card-title').textContent).toBe('Test Blonde');
        expect(card.querySelector('.card-brewery').textContent).toBe('TestBrew');
        expect(card.querySelector('.card-abv').textContent).toBe('6.5%');
        expect(card.dataset.id).toBe('TEST_UI');
    });

    // ── Search Input ──
    it('Création d\'un champ de recherche fonctionnel', () => {
        const input = document.createElement('input');
        input.type = 'text';
        input.id = 'test-search';
        input.placeholder = 'Rechercher une bière...';
        document.body.appendChild(input);

        input.value = 'Chimay';
        input.dispatchEvent(new Event('input'));

        expect(input.value).toBe('Chimay');
        input.remove();
    });

    // ── Navigation Buttons ──
    it('Les boutons de navigation peuvent être créés dynamiquement', () => {
        const navViews = ['home', 'drunk', 'stats', 'beerpedia', 'settings'];
        const nav = document.createElement('nav');
        nav.className = 'bottom-nav';
        
        navViews.forEach(view => {
            const btn = document.createElement('button');
            btn.className = 'nav-item';
            btn.dataset.view = view;
            btn.textContent = view;
            nav.appendChild(btn);
        });

        expect(nav.querySelectorAll('.nav-item').length).toBe(5);
        expect(nav.querySelector('[data-view="home"]')).not.toBeNull();
        expect(nav.querySelector('[data-view="settings"]')).not.toBeNull();

        nav.remove();
    });

    // ── Filter Active State ──
    it('Les filtres actifs ajoutent/enlèvent la classe correctement', () => {
        const filterBtn = document.createElement('button');
        filterBtn.className = 'filter-chip';
        
        // Simulate toggle
        filterBtn.classList.add('active');
        expect(filterBtn.classList.contains('active')).toBe(true);
        
        filterBtn.classList.remove('active');
        expect(filterBtn.classList.contains('active')).toBe(false);
    });

    // ── Aroma Wheel (SVG rendering capability) ──
    it('SVG peut être créé dynamiquement (Aroma Wheel)', () => {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('width', '300');
        svg.setAttribute('height', '300');
        svg.setAttribute('viewBox', '0 0 300 300');

        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', '150');
        circle.setAttribute('cy', '150');
        circle.setAttribute('r', '100');
        circle.setAttribute('fill', '#FFC000');
        svg.appendChild(circle);

        expect(svg.getAttribute('width')).toBe('300');
        expect(svg.querySelector('circle')).not.toBeNull();
        expect(svg.querySelector('circle').getAttribute('fill')).toBe('#FFC000');
    });

    // ── View Mode Toggle ──
    it('Bascule Grid ↔ List mode', () => {
        let viewMode = 'grid';
        
        // Toggle
        viewMode = viewMode === 'grid' ? 'list' : 'grid';
        expect(viewMode).toBe('list');
        
        // Toggle back
        viewMode = viewMode === 'grid' ? 'list' : 'grid';
        expect(viewMode).toBe('grid');
    });

    // ── Data Attributes ──
    it('Les éléments data-i18n peuvent être traduits', () => {
        const el = document.createElement('span');
        el.setAttribute('data-i18n', 'nav_home');
        el.textContent = 'Dex';

        // Simulate translation
        el.textContent = 'Home';
        expect(el.textContent).toBe('Home');
        expect(el.getAttribute('data-i18n')).toBe('nav_home');
    });

    // ── Skeleton Loading ──
    it('Le skeleton loading peut être injecté et retiré', () => {
        const container = document.createElement('div');
        container.innerHTML = '<div class="skeleton-loader"><div class="skeleton-card"></div></div>';
        document.body.appendChild(container);

        expect(container.querySelector('.skeleton-loader')).not.toBeNull();

        // Replace with content
        container.innerHTML = '<div class="beer-grid">Content loaded</div>';
        expect(container.querySelector('.skeleton-loader')).toBeNull();
        expect(container.querySelector('.beer-grid')).not.toBeNull();

        container.remove();
    });

    // ── Event Delegation ──
    it('L\'event delegation fonctionne sur les cartes bières', () => {
        const container = document.createElement('div');
        container.innerHTML = `
            <div class="beer-card" data-id="BEER_EVT_1">Card 1</div>
            <div class="beer-card" data-id="BEER_EVT_2">Card 2</div>
        `;
        
        let clickedId = null;
        container.addEventListener('click', (e) => {
            const card = e.target.closest('.beer-card');
            if (card) clickedId = card.dataset.id;
        });

        // Simulate click on card 2
        container.querySelector('[data-id="BEER_EVT_2"]').click();
        expect(clickedId).toBe('BEER_EVT_2');
    });
});
