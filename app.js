// ==============================================================================
// ETAT DE L'APPLICATION (STATE)
// ==============================================================================
let participants = [];
let foyers = [];
let foyerColorIndex = 1;
let draggedElementId = null;

// Variables pour la boucle d'auto-scroll 60 FPS
let scrollSpeedY = 0;
let scrollTarget = null; // soit window, soit foyersContainer
let scrollIntervalId = null;

// ==============================================================================
// ELEMENTS DU DOM
// ==============================================================================
const inputName = document.getElementById('input-name');
const btnAddName = document.getElementById('btn-add-name');
const toggleBulkInput = document.getElementById('toggle-bulk-input');
const bulkInputContainer = document.getElementById('bulk-input-container');
const bulkNames = document.getElementById('bulk-names');
const btnImportBulk = document.getElementById('btn-import-bulk');
const unassignedList = document.getElementById('unassigned-participants');
const foyersContainer = document.getElementById('foyers-container');
const btnCreateFoyer = document.getElementById('btn-create-foyer');
const btnLaunchDraw = document.getElementById('btn-launch-draw');
const btnResetAll = document.getElementById('btn-reset-all');
const statusBox = document.getElementById('status-box');
const resultsContainer = document.getElementById('results-container');
const resultsTextDisplay = document.getElementById('results-text-display');
const btnCopyClipboard = document.getElementById('btn-copy-clipboard');
const copyToast = document.getElementById('copy-toast');
const totalCountBadge = document.getElementById('total-count');

// ==============================================================================
// INITIALISATION & LISTENERS
// ==============================================================================
document.addEventListener('DOMContentLoaded', () => {
    // Rendre l'année du titre dynamique
    const year = new Date().getFullYear();
    const appYearEl = document.getElementById('app-year');
    if (appYearEl) {
        appYearEl.textContent = 'Noël ' + year;
    }

    initDragAndDropContainer(unassignedList);
    setupEventListeners();
    setupFoyersGridAutoScroll();
    loadDemoData(); // Charge les noms de démonstration par défaut
});

function setupEventListeners() {
    // Saisie individuelle
    btnAddName.addEventListener('click', addSingleName);
    inputName.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addSingleName();
    });

    // Bascule et import en masse
    toggleBulkInput.addEventListener('click', () => {
        bulkInputContainer.classList.toggle('hidden');
        if (!bulkInputContainer.classList.contains('hidden')) {
            bulkNames.focus();
        }
    });
    btnImportBulk.addEventListener('click', importBulkNames);

    // Création de foyers
    btnCreateFoyer.addEventListener('click', createFoyer);

    // Actions globales
    btnLaunchDraw.addEventListener('click', launchSecretSantaDraw);
    btnResetAll.addEventListener('click', resetAll);
    btnCopyClipboard.addEventListener('click', copyResultsToClipboard);

    // Clic global pour fermer le sélecteur de foyers
    document.addEventListener('click', () => {
        closeAllPopovers();
    });
}

// ==============================================================================
// GESTION DES PARTICIPANTS
// ==============================================================================
function updateParticipantCount() {
    totalCountBadge.textContent = participants.length;
}

function addParticipant(name, foyerIds = []) {
    const cleanedName = name.trim();
    if (cleanedName === '') return null;

    const newParticipant = {
        id: 'part-' + Math.random().toString(36).substr(2, 9) + '-' + Date.now(),
        name: cleanedName,
        foyerIds: [...foyerIds] // Tableau de foyerIds pour la multi-appartenance
    };

    participants.push(newParticipant);
    renderParticipant(newParticipant);
    updateParticipantCount();
    return newParticipant;
}

function addSingleName() {
    const name = inputName.value;
    if (name.trim() !== '') {
        addParticipant(name);
        inputName.value = '';
        inputName.focus();
        hideResults();
    }
}

function importBulkNames() {
    const lines = bulkNames.value.split('\n');
    let importCount = 0;
    lines.forEach(line => {
        const cleaned = line.trim();
        if (cleaned !== '') {
            addParticipant(cleaned);
            importCount++;
        }
    });

    if (importCount > 0) {
        bulkNames.value = '';
        bulkInputContainer.classList.add('hidden');
        hideResults();
    }
}

function removeParticipant(id) {
    // Supprimer du state
    participants = participants.filter(p => p.id !== id);
    
    // Supprimer tous les clones du DOM
    document.querySelectorAll(`.participant-tag[id^="${id}"]`).forEach(el => el.remove());
    
    updateParticipantCount();
    hideResults();
}

// Dessine ou met à jour les badges d'un participant dans les foyers correspondants
function renderParticipant(participant) {
    // 1. Supprimer l'ancien élément ou tous les anciens clones du DOM
    document.querySelectorAll(`.participant-tag[id^="${participant.id}"]`).forEach(el => el.remove());

    // 2. Si le participant n'a aucun foyer, on l'affiche à gauche (Sans restriction)
    if (participant.foyerIds.length === 0) {
        const tag = createTagElement(participant, null);
        unassignedList.appendChild(tag);
        sortUnassignedList();
        return;
    }

    // 3. S'il est affecté à un ou plusieurs foyers, on dessine un clone dans chaque foyer
    participant.foyerIds.forEach(foyerId => {
        const foyerDropZone = document.querySelector(`.foyer-card[data-foyer-id="${foyerId}"] .foyer-drop-zone`);
        if (foyerDropZone) {
            const tagClone = createTagElement(participant, foyerId);
            foyerDropZone.appendChild(tagClone);
        }
    });
}

// Crée un badge HTML pour un participant (soit neutre à gauche, soit clone dans un foyer)
function createTagElement(participant, foyerId) {
    const tag = document.createElement('div');
    tag.className = 'participant-tag';
    // ID unique dans le DOM pour gérer les clones : "IDParticipant___IDFoyer" ou simplement "IDParticipant" si non affecté
    tag.id = foyerId ? `${participant.id}___${foyerId}` : participant.id;
    tag.draggable = true;
    tag.textContent = participant.name;

    // Bouton d'action additionnel pour dupliquer/lier (uniquement si le participant est dans un foyer)
    if (foyerId) {
        const btnLink = document.createElement('button');
        btnLink.className = 'btn-duplicate';
        btnLink.innerHTML = '🔗';
        btnLink.title = 'Associer ce participant à un autre foyer';
        btnLink.addEventListener('click', (e) => {
            showFoyerSelector(e, participant, foyerId);
        });
        tag.appendChild(btnLink);
    }

    // Bouton de suppression
    const btnRemove = document.createElement('button');
    btnRemove.className = 'btn-remove';
    btnRemove.innerHTML = '×';
    btnRemove.title = foyerId ? `Retirer de ce Foyer` : `Supprimer ${participant.name}`;
    btnRemove.addEventListener('click', (e) => {
        e.stopPropagation(); // Évite les conflits de drag et sélection
        if (foyerId) {
            // Retirer uniquement ce foyer d'appartenance
            participant.foyerIds = participant.foyerIds.filter(fid => fid !== foyerId);
            renderParticipant(participant);
            hideResults();
        } else {
            // Suppression complète
            removeParticipant(participant.id);
        }
    });
    tag.appendChild(btnRemove);

    // Événement clic pour support tactile mobile (sélection)
    tag.addEventListener('click', (e) => {
        e.stopPropagation();
        closeAllPopovers();
        const wasSelected = tag.classList.contains('selected');
        document.querySelectorAll('.participant-tag').forEach(t => t.classList.remove('selected'));
        if (!wasSelected) {
            tag.classList.add('selected');
        }
    });

    // Synchronisation du survol visuel des clones
    tag.addEventListener('mouseenter', () => highlightClones(participant.id, true));
    tag.addEventListener('mouseleave', () => highlightClones(participant.id, false));

    // Drag events
    tag.addEventListener('dragstart', handleDragStart);
    tag.addEventListener('dragend', handleDragEnd);

    return tag;
}

// Trie la liste des participants disponibles par ordre alphabétique
function sortUnassignedList() {
    const tags = Array.from(unassignedList.querySelectorAll('.participant-tag'));
    tags.sort((a, b) => {
        const nameA = a.childNodes[0].textContent.trim();
        const nameB = b.childNodes[0].textContent.trim();
        return nameA.localeCompare(nameB, 'fr', { sensitivity: 'base' });
    });
    tags.forEach(tag => unassignedList.appendChild(tag));
}

// Met en surbrillance ou éteint tous les clones d'un participant à l'écran
function highlightClones(participantId, highlight) {
    document.querySelectorAll('.participant-tag').forEach(tag => {
        const parts = tag.id.split('___');
        if (parts[0] === participantId) {
            if (highlight) {
                tag.classList.add('highlight-clone');
            } else {
                tag.classList.remove('highlight-clone');
            }
        }
    });
}

// ==============================================================================
// GESTION DES FOYERS (EXCLUSIONS)
// ==============================================================================
function createFoyer() {
    const foyerId = 'foyer-' + Math.random().toString(36).substr(2, 9) + '-' + Date.now();
    const foyerName = `Foyer ${foyers.length + 1}`;
    const colorClass = `color-${foyerColorIndex}`;
    
    foyerColorIndex = (foyerColorIndex % 6) + 1;

    const newFoyer = {
        id: foyerId,
        name: foyerName,
        colorClass: colorClass
    };

    foyers.push(newFoyer);
    renderFoyerCard(newFoyer);
    hideResults();
}

function renderFoyerCard(foyer) {
    const card = document.createElement('div');
    card.className = `foyer-card ${foyer.colorClass}`;
    card.setAttribute('data-foyer-id', foyer.id);

    card.innerHTML = `
        <div class="foyer-header">
            <input type="text" class="foyer-title-input" value="${foyer.name}" title="Cliquez pour renommer" />
            <button class="btn-delete-foyer" title="Supprimer ce foyer et libérer les membres">🗑️</button>
        </div>
        <div class="foyer-search-container">
            <input type="text" class="foyer-search-input" placeholder="🔍 Ajouter un membre..." autocomplete="off" />
            <div class="foyer-search-suggestions hidden"></div>
        </div>
        <div class="foyer-drop-zone" data-foyer-id="${foyer.id}"></div>
        <div class="foyer-rule-indicator">
            <span>🚫 Les membres ne s'offrent pas de cadeaux</span>
        </div>
    `;

    // Événement renommer
    const titleInput = card.querySelector('.foyer-title-input');
    titleInput.addEventListener('change', (e) => {
        foyer.name = e.target.value;
    });

    // Événement supprimer foyer
    const btnDelete = card.querySelector('.btn-delete-foyer');
    btnDelete.addEventListener('click', (e) => {
        e.stopPropagation();
        removeFoyer(foyer.id);
    });

    // Rendre la zone réceptive au drop
    const dropZone = card.querySelector('.foyer-drop-zone');
    initDragAndDropContainer(dropZone);

    // Initialiser la recherche interne
    initFoyerSearch(card, foyer);

    foyersContainer.appendChild(card);
}

// Initialise la recherche filtrante à auto-complétion dans une carte Foyer
function initFoyerSearch(card, foyer) {
    const searchInput = card.querySelector('.foyer-search-input');
    const suggestionsContainer = card.querySelector('.foyer-search-suggestions');
    let activeIndex = -1;

    // Fermer les suggestions au clic extérieur
    document.addEventListener('click', (e) => {
        if (!searchInput.contains(e.target) && !suggestionsContainer.contains(e.target)) {
            closeSuggestions();
        }
    });

    function closeSuggestions() {
        suggestionsContainer.innerHTML = '';
        suggestionsContainer.classList.add('hidden');
        activeIndex = -1;
    }

    searchInput.addEventListener('input', () => {
        renderSuggestions();
    });

    searchInput.addEventListener('focus', () => {
        renderSuggestions();
    });

    // Support de la navigation au clavier (flèches + entrée + échap)
    searchInput.addEventListener('keydown', (e) => {
        const items = Array.from(suggestionsContainer.querySelectorAll('.foyer-suggestion-item'));
        if (items.length === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            activeIndex = (activeIndex + 1) % items.length;
            updateActiveItem(items);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            activeIndex = (activeIndex - 1 + items.length) % items.length;
            updateActiveItem(items);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (activeIndex >= 0 && activeIndex < items.length) {
                items[activeIndex].click();
            } else if (items.length > 0) {
                items[0].click(); // Valide le premier résultat par défaut
            }
        } else if (e.key === 'Escape') {
            e.preventDefault();
            closeSuggestions();
            searchInput.blur();
        }
    });

    function updateActiveItem(items) {
        items.forEach((item, index) => {
            if (index === activeIndex) {
                item.classList.add('active');
                item.scrollIntoView({ block: 'nearest' });
            } else {
                item.classList.remove('active');
            }
        });
    }

    function renderSuggestions() {
        const query = searchInput.value.trim().toLowerCase();
        
        if (query === '') {
            closeSuggestions();
            return;
        }

        // Filtrer les participants : exclure ceux déjà dans ce foyer, et filtrer sur la saisie (sans accents)
        const matches = participants.filter(p => {
            const alreadyInThisFoyer = p.foyerIds.includes(foyer.id);
            if (alreadyInThisFoyer) return false;

            const nameNormalized = p.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            const queryNormalized = query.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            
            return nameNormalized.includes(queryNormalized);
        });

        if (matches.length === 0) {
            suggestionsContainer.innerHTML = '<div class="foyer-selector-title" style="border:none; text-align:center; padding: 0.5rem 0;">Aucun résultat</div>';
            suggestionsContainer.classList.remove('hidden');
            activeIndex = -1;
            return;
        }

        suggestionsContainer.innerHTML = '';
        activeIndex = -1;

        matches.forEach(participant => {
            const item = document.createElement('div');
            item.className = 'foyer-suggestion-item';
            
            const nameSpan = document.createElement('span');
            nameSpan.textContent = participant.name;
            item.appendChild(nameSpan);

            const badge = document.createElement('span');
            badge.className = 'suggestion-badge';
            if (participant.foyerIds.length > 0) {
                badge.textContent = `Foyers: ${participant.foyerIds.length}`;
            } else {
                badge.textContent = 'Libre';
            }
            item.appendChild(badge);

            item.addEventListener('click', (event) => {
                event.stopPropagation();
                
                if (!participant.foyerIds.includes(foyer.id)) {
                    participant.foyerIds.push(foyer.id);
                }
                
                renderParticipant(participant);
                hideResults();
                
                searchInput.value = '';
                closeSuggestions();
            });

            suggestionsContainer.appendChild(item);
        });

        suggestionsContainer.classList.remove('hidden');
    }
}

function removeFoyer(foyerId) {
    // 1. Retirer ce Foyer ID des foyerIds de tous les participants concernés
    participants.forEach(p => {
        if (p.foyerIds.includes(foyerId)) {
            p.foyerIds = p.foyerIds.filter(fid => fid !== foyerId);
            renderParticipant(p);
        }
    });

    // 2. Supprimer du state des foyers
    foyers = foyers.filter(f => f.id !== foyerId);

    // 3. Retirer la carte du DOM
    const cardEl = document.querySelector(`.foyer-card[data-foyer-id="${foyerId}"]`);
    if (cardEl) cardEl.remove();
    
    hideResults();
}

// Affiche le sélecteur contextuel de foyer (popover de duplication)
function showFoyerSelector(e, participant, currentFoyerId) {
    e.stopPropagation();
    closeAllPopovers();

    // S'il n'y a pas d'autre foyer disponible
    if (foyers.length <= 1) {
        alert("Créez d'autres foyers d'abord pour pouvoir dupliquer ce participant !");
        return;
    }

    const popover = document.createElement('div');
    popover.className = 'foyer-selector-popover';

    const title = document.createElement('div');
    title.className = 'foyer-selector-title';
    title.textContent = 'Ajouter à un autre Foyer :';
    popover.appendChild(title);

    foyers.forEach(foyer => {
        const item = document.createElement('div');
        item.className = 'foyer-selector-item';
        item.textContent = foyer.name;

        const alreadyIn = participant.foyerIds.includes(foyer.id);
        if (alreadyIn) {
            item.classList.add('disabled');
            item.title = "Déjà présent dans ce foyer";
        } else {
            item.addEventListener('click', (event) => {
                event.stopPropagation();
                participant.foyerIds.push(foyer.id);
                renderParticipant(participant);
                hideResults();
                closeAllPopovers();
            });
        }
        popover.appendChild(item);
    });

    document.body.appendChild(popover);

    // Positionner le menu juste en dessous du bouton cliqué
    const rect = e.target.getBoundingClientRect();
    popover.style.left = (window.scrollX + rect.left) + 'px';
    popover.style.top = (window.scrollY + rect.bottom + 5) + 'px';
}

function closeAllPopovers() {
    document.querySelectorAll('.foyer-selector-popover').forEach(p => p.remove());
}

// ==============================================================================
// GESTION DU DRAG & DROP & AUTO-SCROLL
// ==============================================================================
function handleDragStart(e) {
    draggedElementId = this.id;
    this.classList.add('dragging');
    
    const parts = this.id.split('___');
    highlightClones(parts[0], true);
    
    e.dataTransfer.setData('text/plain', this.id);
    e.dataTransfer.effectAllowed = 'move';

    // Démarrer la boucle d'auto-scroll 60 FPS
    startAutoScrollLoop();
}

function handleDragEnd() {
    this.classList.remove('dragging');
    const parts = this.id.split('___');
    highlightClones(parts[0], false);
    draggedElementId = null;
    
    document.querySelectorAll('.foyer-card, .participants-list').forEach(el => {
        el.classList.remove('dragover');
    });
    
    // Arrêter la boucle d'auto-scroll et réinitialiser
    stopAutoScrollLoop();
}

// Démarre la boucle de défilement continu (60 FPS)
function startAutoScrollLoop() {
    if (scrollIntervalId) clearInterval(scrollIntervalId);
    scrollIntervalId = setInterval(() => {
        if (scrollSpeedY !== 0) {
            if (scrollTarget === window) {
                window.scrollBy(0, scrollSpeedY);
            } else if (scrollTarget) {
                scrollTarget.scrollTop += scrollSpeedY;
            }
        }
    }, 16); // Environ 60 frames par seconde
}

// Arrête la boucle de défilement et réinitialise les vitesses
function stopAutoScrollLoop() {
    if (scrollIntervalId) {
        clearInterval(scrollIntervalId);
        scrollIntervalId = null;
    }
    scrollSpeedY = 0;
    scrollTarget = null;
}

// Analyse la position du pointeur/doigt et définit la vitesse de défilement (Viewport et Grille interne)
function handlePointerMove(clientY) {
    const viewportHeight = window.innerHeight;
    const thresholdTop = 120; // Zone de déclenchement en haut (120px)
    const thresholdBottom = 330; // Zone de déclenchement au tiers inférieur (330px) pour anticiper très tôt la barre Android

    // 1. Détection de proximité avec les bords de l'écran global (Viewport)
    if (clientY < thresholdTop) {
        scrollTarget = window;
        // Vitesse progressive vers le haut : de 4px/frame à 20px/frame max
        const diff = thresholdTop - clientY;
        const ratio = Math.min(1, diff / thresholdTop);
        scrollSpeedY = -Math.round(4 + ratio * 16);
    } else if (clientY > viewportHeight - thresholdBottom) {
        scrollTarget = window;
        // Vitesse progressive vers le bas (tiers inférieur) : de 7px/frame (démarrage franc) à 28px/frame max
        const diff = clientY - (viewportHeight - thresholdBottom);
        const ratio = Math.min(1, diff / thresholdBottom);
        scrollSpeedY = Math.round(7 + ratio * 21);
    } else {
        // 2. Si on est au milieu de l'écran, on gère le scroll interne de la grille centrale (PC uniquement)
        const rect = foyersContainer.getBoundingClientRect();
        if (clientY >= rect.top && clientY <= rect.bottom) {
            const topEdge = rect.top + 60;
            const bottomEdge = rect.bottom - 60;
            
            if (clientY < topEdge) {
                scrollTarget = foyersContainer;
                scrollSpeedY = -Math.max(3, (topEdge - clientY) / 2.5);
            } else if (clientY > bottomEdge) {
                scrollTarget = foyersContainer;
                scrollSpeedY = Math.max(3, (clientY - bottomEdge) / 2.5);
            } else {
                scrollSpeedY = 0;
                scrollTarget = null;
            }
        } else {
            scrollSpeedY = 0;
            scrollTarget = null;
        }
    }
}

// Gestion de l'auto-scroll pendant le drag (grille interne sur PC et fenêtre globale sur mobile)
function setupFoyersGridAutoScroll() {
    // Écouteur pour la souris (PC)
    document.addEventListener('dragover', (e) => {
        if (!draggedElementId) return;
        handlePointerMove(e.clientY);
    });

    // Écouteur pour le tactile (Smartphones Android & iOS)
    document.addEventListener('touchmove', (e) => {
        if (!draggedElementId) return;
        if (e.touches && e.touches.length > 0) {
            handlePointerMove(e.touches[0].clientY);
        }
    }, { passive: true });

    // En cas de sortie d'élément ou de dépôt, on réinitialise les vitesses
    document.addEventListener('dragleave', () => {
        scrollSpeedY = 0;
        scrollTarget = null;
    });

    document.addEventListener('drop', () => {
        stopAutoScrollLoop();
        draggedElementId = null;
    });

    // Événements tactiles de fin de drag pour mobile (arrêt immédiat dès qu'on lève le doigt)
    document.addEventListener('touchend', () => {
        stopAutoScrollLoop();
        draggedElementId = null;
    });

    document.addEventListener('touchcancel', () => {
        stopAutoScrollLoop();
        draggedElementId = null;
    });
}

function initDragAndDropContainer(container) {
    container.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const targetZone = container.closest('.foyer-card') || container;
        targetZone.classList.add('dragover');
    });

    container.addEventListener('dragleave', () => {
        const targetZone = container.closest('.foyer-card') || container;
        targetZone.classList.remove('dragover');
    });

    container.addEventListener('drop', (e) => {
        e.preventDefault();
        stopAutoScrollLoop();
        
        const fullId = e.dataTransfer.getData('text/plain') || draggedElementId;
        if (!fullId) return;

        const parts = fullId.split('___');
        const participantId = parts[0];
        const sourceFoyerId = parts[1] || null;

        const targetFoyerId = container.getAttribute('data-foyer-id');
        const finalTargetFoyerId = targetFoyerId === 'null' ? null : targetFoyerId;

        const p = participants.find(part => part.id === participantId);
        if (p) {
            if (finalTargetFoyerId === null) {
                // Rapatriement à gauche : on retire toutes les exclusions (foyerIds se vide)
                p.foyerIds = [];
            } else {
                // Déplacé dans un foyer
                if (sourceFoyerId === null) {
                    // Provient de la liste de gauche : on l'ajoute au foyer cible
                    p.foyerIds = [finalTargetFoyerId];
                } else {
                    // Provient d'un autre foyer (déplacement direct)
                    p.foyerIds = p.foyerIds.filter(fid => fid !== sourceFoyerId);
                    if (!p.foyerIds.includes(finalTargetFoyerId)) {
                        p.foyerIds.push(finalTargetFoyerId);
                    }
                }
            }
            renderParticipant(p);
        }

        const targetZone = container.closest('.foyer-card') || container;
        targetZone.classList.remove('dragover');
        hideResults();
    });

    // Support tactile mobile (déplacement par sélection + clic de dépôt)
    container.addEventListener('click', (e) => {
        if (e.target.closest('.btn-delete-foyer') || e.target.closest('.btn-remove') || e.target.closest('.btn-duplicate')) return;

        const selectedTag = document.querySelector('.participant-tag.selected');
        if (selectedTag) {
            const fullId = selectedTag.id;
            const parts = fullId.split('___');
            const participantId = parts[0];
            const sourceFoyerId = parts[1] || null;

            const targetFoyerId = container.getAttribute('data-foyer-id');
            const finalTargetFoyerId = targetFoyerId === 'null' ? null : targetFoyerId;

            const p = participants.find(part => part.id === participantId);
            if (p) {
                if (finalTargetFoyerId === null) {
                    p.foyerIds = [];
                } else {
                    if (sourceFoyerId === null) {
                        p.foyerIds = [finalTargetFoyerId];
                    } else {
                        p.foyerIds = p.foyerIds.filter(fid => fid !== sourceFoyerId);
                        if (!p.foyerIds.includes(finalTargetFoyerId)) {
                            p.foyerIds.push(finalTargetFoyerId);
                        }
                    }
                }
                renderParticipant(p);
            }
            selectedTag.classList.remove('selected');
            hideResults();
        }
    });
}

// ==============================================================================
// ALGORITHME DE TIRAGE AU SORT OPTIMISÉ (ITÉRATION TENTATIVES + TRI MRV COHÉRENT)
// ==============================================================================
function launchSecretSantaDraw() {
    if (participants.length < 2) {
        showStatus("Il faut au moins 2 participants pour effectuer un tirage au sort !", "error");
        return;
    }

    // 1. Validation préliminaire immédiate (0 ms)
    // Règle de la majorité absolue pour chaque foyer
    const totalCount = participants.length;
    let impossibleFoyerName = null;
    
    for (let i = 0; i < foyers.length; i++) {
        const foyer = foyers[i];
        const memberCount = participants.filter(p => p.foyerIds.includes(foyer.id)).length;
        if (memberCount > totalCount / 2) {
            impossibleFoyerName = foyer.name;
            break;
        }
    }

    if (impossibleFoyerName) {
        showStatus("Tirage au sort impossible", "error");
        resultsContainer.classList.add('hidden');
        return;
    }

    // 2. Modifier l'état du bouton et masquer les anciens résultats
    const originalText = btnLaunchDraw.innerHTML;
    btnLaunchDraw.disabled = true;
    btnLaunchDraw.innerHTML = '<span>Tirage en cours... ⚙️</span>';
    btnLaunchDraw.classList.remove('pulse');
    hideResults();

    // 3. Délai de 450ms pour la sensation de calcul
    setTimeout(() => {
        // Trier les donneurs par ordre de difficulté décroissant (MRV) pour accélérer le tirage
        const sortedGivers = [...participants].sort((a, b) => {
            const countExclusions = (participant) => {
                let excludedCount = 0;
                participants.forEach(p => {
                    if (p.id !== participant.id) {
                        const shared = participant.foyerIds.some(fid => p.foyerIds.includes(fid));
                        if (shared) excludedCount++;
                    }
                });
                return excludedCount;
            };
            return countExclusions(b) - countExclusions(a); // Décroissant
        });

        const maxAttempts = 3000; // Limite sécurisée d'essais globaux (très rapide <15ms)
        let attempts = 0;
        let success = false;
        let assignments = {};

        // Boucle d'itérations globales (les tentatives)
        while (attempts < maxAttempts && !success) {
            attempts++;
            success = tryDraw(sortedGivers, assignments);
        }

        // Rétablir le bouton
        btnLaunchDraw.disabled = false;
        btnLaunchDraw.innerHTML = originalText;
        btnLaunchDraw.classList.add('pulse');

        if (success) {
            renderResults(assignments, attempts);
        } else {
            showStatus("Tirage au sort impossible", "error");
            resultsContainer.classList.add('hidden');
        }
    }, 450);
}

function tryDraw(sortedGivers, assignments) {
    // Vider les affectations précédentes
    for (let member in assignments) delete assignments[member];

    // Créer une copie de la liste des receveurs disponibles
    let availableReceivers = [...participants];

    for (let i = 0; i < sortedGivers.length; i++) {
        const giver = sortedGivers[i];
        
        // Filtrer les receveurs valides pour ce donneur
        const validReceivers = availableReceivers.filter(receiver => {
            if (receiver.id === giver.id) return false; // Pas d'auto-cadeau
            
            // Pas de foyer commun
            const shareFoyer = giver.foyerIds.some(fid => receiver.foyerIds.includes(fid));
            if (giver.foyerIds.length > 0 && receiver.foyerIds.length > 0 && shareFoyer) {
                return false;
            }
            
            return true;
        });

        // Impasse : aucun receveur autorisé restant pour ce donneur
        if (validReceivers.length === 0) return false;

        // Sélection aléatoire d'un receveur valide
        const chosenReceiver = validReceivers[Math.floor(Math.random() * validReceivers.length)];
        assignments[giver.id] = chosenReceiver.id;
        
        // Retirer de la liste
        availableReceivers = availableReceivers.filter(r => r.id !== chosenReceiver.id);
    }

    return true;
}

// ==============================================================================
// AFFICHAGE DES RESULTATS & PRESSE-PAPIERS
// ==============================================================================
function renderResults(assignments, attempts) {
    const couples = [];
    participants.forEach(giver => {
        const receiverId = assignments[giver.id];
        const receiver = participants.find(p => p.id === receiverId);
        if (receiver) {
            couples.push({
                giverName: giver.name,
                receiverName: receiver.name
            });
        }
    });

    couples.sort((a, b) => a.giverName.localeCompare(b.giverName, 'fr', { sensitivity: 'base' }));

    const year = new Date().getFullYear();
    let textResult = `🎄 Tirage au sort Noël ${year} 🎄\n\n`;
    couples.forEach(c => {
        textResult += `${c.giverName} 🎁 ➔ ${c.receiverName}\n`;
    });

    resultsTextDisplay.textContent = textResult;
    resultsContainer.classList.remove('hidden');
    btnResetAll.classList.remove('hidden');

    showStatus(`Tirage réussi en ${attempts} itération(s) ! Le résultat a été classé par ordre alphabétique.`, "success");

    // Auto-scroll fluide vers la zone des résultats (très important sur mobile)
    setTimeout(() => {
        resultsContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 80);
}

function showStatus(message, type) {
    statusBox.textContent = message;
    statusBox.className = 'status-box';
    statusBox.classList.add(type);
    statusBox.classList.remove('hidden');
}

function hideResults() {
    resultsContainer.classList.add('hidden');
    statusBox.classList.add('hidden');
}

// Copie dans le presse-papiers
function copyResultsToClipboard() {
    const textToCopy = resultsTextDisplay.textContent;
    if (!textToCopy) return;

    navigator.clipboard.writeText(textToCopy).then(() => {
        copyToast.classList.add('show');
        setTimeout(() => {
            copyToast.classList.remove('show');
        }, 2500);
    }).catch(err => {
        console.error('Erreur de copie : ', err);
    });
}

function resetAll() {
    if (confirm("Voulez-vous vraiment réinitialiser toute la page (participants et foyers) ?")) {
        participants = [];
        foyers = [];
        foyerColorIndex = 1;
        unassignedList.innerHTML = '';
        foyersContainer.innerHTML = '';
        updateParticipantCount();
        hideResults();
        btnResetAll.classList.add('hidden');
    }
}

// ==============================================================================
// DONNEES DE DEMO (DEMO DATA)
// ==============================================================================
function loadDemoData() {
    const demoNames = [
        "Catherine", "Hervé", "Manu", "Clara", "Pierre", 
        "Emelia", "Guillaume", "Bruno", "Sam", "Victor", 
        "Celine", "Kevin", "Theo"
    ];
    
    // Ajouter tous les participants
    demoNames.forEach(name => addParticipant(name));
    
    // Créer un premier foyer de démonstration (ex: un couple)
    createFoyer();
    
    // Assigner Celine et Victor au Foyer 1 de démonstration
    setTimeout(() => {
        if (foyers.length > 0 && participants.length >= 2) {
            const foyerId = foyers[0].id;
            const celine = participants.find(p => p.name.toLowerCase() === "celine" || p.name.toLowerCase() === "céline");
            const victor = participants.find(p => p.name.toLowerCase() === "victor");
            
            if (celine && victor) {
                // Placer Celine et Victor dans le Foyer 1
                celine.foyerIds = [foyerId];
                victor.foyerIds = [foyerId];
                
                // Rafraîchir leur affichage pour les positionner dans le foyer
                renderParticipant(celine);
                renderParticipant(victor);
            }
        }
    }, 100);
}
