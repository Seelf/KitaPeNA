/**
 * explorer_cards.js — Card rendering for Petri nets and graphs.
 */

import { getCsrfToken, selectedNetIds, showCustomModal } from './explorer_shared.js';
import { updateBulkDeleteButton, handleAction, handleGraphAction, loadNetToEditor, loadGraphToEditor, updateNetClass } from './explorer_actions.js';

export function createNetCard(net) {
    const card = document.createElement('div');
    card.className = 'net-card';

    const stats = net.stats || { places: 0, transitions: 0, arcs: 0, class: '' };
    const dateStr = net.created_at ? new Date(net.created_at).toLocaleDateString() : 'Unknown';
    const isSelected = selectedNetIds.has(net.id);

    const metadata = net.metadata || {};
    const isPetri = typeof stats.places !== 'undefined';
    const infoHtml = isPetri ? `<span class="net-info-btn" title="View / Edit Metadata" style="cursor:pointer; color:#888; font-size:14px; margin-left:5px; vertical-align:middle;">ⓘ</span>` : '';

    card.innerHTML = `
        <div class="card-checkbox-wrapper">
            <input type="checkbox" class="card-checkbox" data-id="${net.id}" ${isSelected ? 'checked' : ''}>
        </div>
        <div class="net-card-header">
            <div class="net-info-group">
                <div class="net-title" title="${net.name}">${net.name}${infoHtml}</div>
                <div class="net-id-badge">#${net.id} • ${dateStr}</div>
            </div>
        </div>

        <div class="net-stats-row">
            <div class="stat-badge" title="Places">
                <span class="stat-label">Places:</span> <span>${stats.places}</span>
            </div>
            <div class="stat-badge" title="Transitions">
                <span class="stat-label">Transitions:</span> <span>${stats.transitions}</span>
            </div>
            <div class="stat-badge" title="Arcs">
                <span class="stat-label">Arcs:</span> <span>${stats.arcs}</span>
            </div>
            <div class="stat-badge" title="Tokens">
                <span class="stat-label">Tokens:</span> <span>${stats.tokens || 0}</span>
            </div>
        </div>

        <div class="class-input-group">
            <div class="class-label">Class:</div>
            <input type="text" class="class-input" value="${stats.class || ''}" placeholder="e.g. MG, SM..." data-id="${net.id}">
        </div>

        <div class="card-actions">
            <button class="action-btn-small primary btn-open">Open</button>
            <button class="action-btn-small icon-only btn-download-pnh" title="Download PNH">PNH</button>
            <button class="action-btn-small icon-only btn-download-pnml" title="Download PNML">PNML</button>
            <button class="action-btn-small icon-only btn-download-json" title="Download JSON">JSON</button>
            <button class="action-btn-small icon-only btn-download-gspn" title="Download GSPN">GSPN</button>
            <button class="action-btn-small icon-only danger btn-delete" title="Delete">🗑</button>
        </div>
    `;

    card.querySelector('.btn-open').addEventListener('click', () => loadNetToEditor(net));
    card.querySelector('.btn-delete').addEventListener('click', () => handleAction(net, 'delete'));
    card.querySelector('.btn-download-pnh').addEventListener('click', () => handleAction(net, 'download-pnh'));
    card.querySelector('.btn-download-pnml').addEventListener('click', () => handleAction(net, 'download-pnml'));
    card.querySelector('.btn-download-json').addEventListener('click', () => handleAction(net, 'download-json'));
    card.querySelector('.btn-download-gspn').addEventListener('click', () => handleAction(net, 'download-gspn'));
    card.querySelector('.class-input').addEventListener('change', (e) => updateNetClass(net, e.target.value));

    const checkbox = card.querySelector('.card-checkbox');
    checkbox.addEventListener('change', (e) => {
        if (e.target.checked) {
            selectedNetIds.add(net.id);
            card.classList.add('selected');
        } else {
            selectedNetIds.delete(net.id);
            card.classList.remove('selected');
        }
        updateBulkDeleteButton();
    });

    if (isSelected) card.classList.add('selected');

    if (isPetri) {
        const infoBtn = card.querySelector('.net-info-btn');
        if (infoBtn) {
            infoBtn.addEventListener('click', (e) => {
                e.stopPropagation();

                let textContent = '';
                if (metadata.raw !== undefined) {
                    textContent = metadata.raw;
                } else {
                    for (const [k, v] of Object.entries(metadata)) {
                        textContent += `;${k}=${v}\n`;
                    }
                }

                let content = `
                <div style="display: flex; flex-direction: column; height: 100%; text-align: left;">
                    <div style="margin-bottom: 8px; color: #aaa; font-size: 13px; flex-shrink: 0;">Edit metadata (lines starting with ';' are parsed as metadata):</div>
                    <textarea id="editMetadataArea_${net.id}" style="
                        background-color: #1e1e1e; 
                        color: #d4d4d4; 
                        font-family: 'Courier New', Courier, monospace; 
                        padding: 15px; 
                        border-radius: 6px; 
                        width: 100%;
                        flex: 1;
                        resize: none;
                        white-space: pre-wrap;
                        font-size: 13px;
                        border: 1px solid #333;
                        box-sizing: border-box;
                        outline: none;
                    ">${textContent.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</textarea>
                </div>`;

                showCustomModal(`Metadata: ${net.name}`, content, true, async () => {
                    const textarea = document.getElementById(`editMetadataArea_${net.id}`);
                    if (!textarea) return;

                    const newText = textarea.value;

                    try {
                        const getRes = await fetch(`/api/petri/saved/${net.id}`);
                        if (!getRes.ok) throw new Error('Failed to fetch net data');
                        const netData = await getRes.json();

                        const contentJson = typeof netData.content_json === 'string' ? JSON.parse(netData.content_json) : netData.content_json;
                        if (!contentJson.metadata) contentJson.metadata = {};
                        contentJson.metadata.raw = newText;

                        const putRes = await fetch(`/api/petri/saved/${net.id}`, {
                            method: 'PUT',
                            headers: {
                                'Content-Type': 'application/json',
                                'X-CSRFToken': getCsrfToken()
                            },
                            body: JSON.stringify({
                                name: netData.name,
                                content: contentJson
                            })
                        });

                        if (!putRes.ok) throw new Error('Failed to update metadata');

                        import('./explorer_init.js').then(m => m.loadDatabaseItems(true));

                    } catch (err) {
                        console.error(err);
                        alert('Failed to save metadata');
                    }
                }, null, { large: true });
            });
        }
    }

    card.addEventListener('click', (e) => {
        if (e.target.closest('button') || e.target.closest('input') || e.target.closest('a') || e.target.closest('.net-info-btn')) {
            return;
        }
        checkbox.checked = !checkbox.checked;
        checkbox.dispatchEvent(new Event('change'));
    });

    return card;
}

export function createGraphCard(graph) {
    const card = document.createElement('div');
    card.className = 'net-card';

    const dateStr = graph.created_at ? new Date(graph.created_at).toLocaleDateString() : 'Unknown';
    const dirStr = graph.is_directed ? 'Directed' : 'Undirected';
    const isSelected = selectedNetIds.has(graph.id);

    let vCount = '?';
    let eCount = '?';
    try {
        const nodes = typeof graph.nodes === 'string' ? JSON.parse(graph.nodes) : graph.nodes;
        const edges = typeof graph.edges === 'string' ? JSON.parse(graph.edges) : graph.edges;
        vCount = nodes ? nodes.length : 0;
        eCount = edges ? edges.length : 0;
    } catch (e) { }

    card.innerHTML = `
        <div class="card-checkbox-wrapper">
            <input type="checkbox" class="card-checkbox" data-id="${graph.id}" ${isSelected ? 'checked' : ''}>
        </div>
        <div class="net-card-header">
            <div class="net-info-group">
                <div class="net-title" title="${graph.name}">${graph.name}</div>
                <div class="net-id-badge">#${graph.id} • ${dateStr} • ${dirStr}</div>
            </div>
        </div>
        
        <div class="net-stats-row">
            <div class="stat-badge" title="Vertices">
                <span class="stat-label">Vertices:</span> <span>${vCount}</span>
            </div>
            <div class="stat-badge" title="Edges">
                <span class="stat-label">Edges:</span> <span>${eCount}</span>
            </div>
        </div>

        <div class="card-actions" style="margin-top: 20px;">
            <button class="action-btn-small primary btn-open">Open in Editor</button>
            <button class="action-btn-small icon-only btn-download-gml" title="Download GML">GML</button>
            <button class="action-btn-small icon-only btn-download-graphml" title="Download GraphML">GraphML</button>
            <button class="action-btn-small icon-only btn-download-json" title="Download JSON">JSON</button>
            <button class="action-btn-small icon-only danger btn-delete" title="Delete">🗑</button>
        </div>
    `;

    card.querySelector('.btn-open').addEventListener('click', () => loadGraphToEditor(graph));
    card.querySelector('.btn-delete').addEventListener('click', () => handleGraphAction(graph, 'delete'));
    card.querySelector('.btn-download-gml').addEventListener('click', () => handleGraphAction(graph, 'download-gml'));
    card.querySelector('.btn-download-graphml').addEventListener('click', () => handleGraphAction(graph, 'download-graphml'));
    card.querySelector('.btn-download-json').addEventListener('click', () => handleGraphAction(graph, 'download-json'));

    const checkbox = card.querySelector('.card-checkbox');
    checkbox.addEventListener('change', (e) => {
        if (e.target.checked) {
            selectedNetIds.add(graph.id);
            card.classList.add('selected');
        } else {
            selectedNetIds.delete(graph.id);
            card.classList.remove('selected');
        }
        updateBulkDeleteButton();
    });

    if (isSelected) card.classList.add('selected');

    card.addEventListener('click', (e) => {
        if (e.target.closest('button') || e.target.closest('input') || e.target.closest('a')) {
            return;
        }
        checkbox.checked = !checkbox.checked;
        checkbox.dispatchEvent(new Event('change'));
    });

    return card;
}

export function renderNewItems(nets, viewMode) {
    const dbGrid = document.getElementById('dbGrid');
    if (!dbGrid) return;

    nets.forEach(net => {
        const card = viewMode === 'petri' ? createNetCard(net) : createGraphCard(net);
        dbGrid.appendChild(card);
    });
}
