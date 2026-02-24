/**
 * explorer_converters.js — PNH/PNML parsers and converters, plus file download helper.
 */

export function parsePnh(content) {
    const lines = content.split(/\r?\n/).filter(l => l.trim().length > 0 && !l.trim().startsWith('#') && !l.trim().startsWith('//'));

    const dataLines = [];
    const pNames = [];
    const tNames = [];
    const rawMetadataLines = [];

    lines.forEach(l => {
        const trimmed = l.trim();
        if (trimmed.startsWith(';')) {
            rawMetadataLines.push(trimmed);
            const metaContent = trimmed.substring(1).trim();
            if (metaContent.startsWith('Places=')) {
                metaContent.substring(7).split(';').forEach(n => pNames.push(n));
            } else if (metaContent.startsWith('Transitions=')) {
                metaContent.substring(12).split(';').forEach(n => tNames.push(n));
            }
        } else {
            dataLines.push(trimmed);
        }
    });

    if (dataLines.length < 3) throw new Error("Invalid PNH format");

    const numPlaces = parseInt(dataLines[0].trim());
    const numRows = parseInt(dataLines[1].trim());
    const numTransitions = numRows - 1;

    const places = [];
    for (let i = 0; i < numPlaces; i++) places.push({ id: i, label: pNames[i] || `p${i}`, tokens: 0 });

    const transitions = [];
    for (let i = 0; i < numTransitions; i++) transitions.push({ id: i, label: tNames[i] || `t${i}` });

    const arcs = [];

    // Parse Matrix
    for (let t = 0; t < numTransitions; t++) {
        const line = dataLines[2 + t].trim();
        let vals = [];
        if (line.includes(' ')) {
            vals = line.split(/\s+/).map(v => v === 'x' ? -1 : parseInt(v));
        } else {
            vals = line.split('').map(c => c === 'x' ? -1 : parseInt(c));
        }

        vals.forEach((val, pIdx) => {
            if (val === -1) arcs.push({ sourceId: places[pIdx].id, targetId: transitions[t].id, type: 'place_to_transition', weight: 1 });
            else if (val === 1) arcs.push({ sourceId: transitions[t].id, targetId: places[pIdx].id, type: 'transition_to_place', weight: 1 });
        });
    }

    // Marking
    const markingLine = dataLines[2 + numTransitions].trim();
    let tokens = [];
    if (markingLine.includes(' ')) {
        tokens = markingLine.split(/\s+/).map(Number);
    } else {
        tokens = markingLine.split('').map(Number);
    }
    tokens.forEach((t, i) => { if (places[i]) places[i].tokens = t; });

    const metadata = {
        raw: rawMetadataLines.join('\n')
    };

    return { places, transitions, arcs, metadata };
}

export function parsePnml(content) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(content, "text/xml");

    const places = [];
    const transitions = [];
    const arcs = [];

    const placeNodes = xmlDoc.getElementsByTagName("place");
    for (let i = 0; i < placeNodes.length; i++) {
        const p = placeNodes[i];
        let pIdStr = p.getAttribute("id");
        let pId = parseInt(pIdStr.replace(/[^0-9]/g, '')) || i;

        let label = pIdStr;
        const nameNode = p.querySelector("name text");
        if (nameNode) label = nameNode.textContent;

        let tokens = 0;
        const initMarkNode = p.querySelector("initialMarking text");
        if (initMarkNode) tokens = parseInt(initMarkNode.textContent) || 0;

        let x = undefined, y = undefined;
        const posNode = p.querySelector("graphics position");
        if (posNode) {
            x = parseFloat(posNode.getAttribute("x"));
            y = parseFloat(posNode.getAttribute("y"));
        }

        places.push({ id: pId, label: label, tokens: tokens, x: x, y: y });
    }

    const transNodes = xmlDoc.getElementsByTagName("transition");
    for (let i = 0; i < transNodes.length; i++) {
        const t = transNodes[i];
        let tIdStr = t.getAttribute("id");
        let tId = parseInt(tIdStr.replace(/[^0-9]/g, '')) || i;

        let label = tIdStr;
        const nameNode = t.querySelector("name text");
        if (nameNode) label = nameNode.textContent;

        let x = undefined, y = undefined;
        const posNode = t.querySelector("graphics position");
        if (posNode) {
            x = parseFloat(posNode.getAttribute("x"));
            y = parseFloat(posNode.getAttribute("y"));
        }

        transitions.push({ id: tId, label: label, x: x, y: y });
    }

    const arcNodes = xmlDoc.getElementsByTagName("arc");
    for (let i = 0; i < arcNodes.length; i++) {
        const a = arcNodes[i];
        const srcStr = a.getAttribute("source");
        const tgtStr = a.getAttribute("target");

        const srcId = parseInt(srcStr.replace(/[^0-9]/g, ''));
        const tgtId = parseInt(tgtStr.replace(/[^0-9]/g, ''));

        let weight = 1;
        const inscriptNode = a.querySelector("inscription text");
        if (inscriptNode) weight = parseInt(inscriptNode.textContent) || 1;

        const isSrcPlace = places.some(p => p.id === srcId);

        if (isSrcPlace) {
            arcs.push({ source: srcId, target: tgtId, type: 'place_to_transition', weight: weight });
        } else {
            arcs.push({ source: srcId, target: tgtId, type: 'transition_to_place', weight: weight });
        }
    }

    return { places, transitions, arcs };
}

export function convertToPnh(json) {
    const places = json.places || [];
    const transitions = json.transitions || [];
    const arcs = json.arcs || [];

    const pMap = new Map();
    places.forEach((p, i) => pMap.set(p.id, i));

    const tMap = new Map();
    transitions.forEach((t, i) => tMap.set(t.id, i));

    const numP = places.length;
    const numT = transitions.length;

    let lines = [];
    lines.push(`${numP}`);
    lines.push(`${numT}`);

    for (let t = 0; t < numT; t++) {
        let row = [];
        const tId = transitions[t].id;

        for (let p = 0; p < numP; p++) {
            const pId = places[p].id;
            const arcIn = arcs.find(a => a.source === pId && a.target === tId);
            const arcOut = arcs.find(a => a.source === tId && a.target === pId);

            let val = 0;
            if (arcIn) val -= (arcIn.weight || 1);
            if (arcOut) val += (arcOut.weight || 1);

            if (val === 0) row.push('0');
            else if (val > 0) row.push(String(val));
            else row.push('x');
        }
        lines.push(row.join(' '));
    }

    let marking = [];
    for (let p = 0; p < numP; p++) {
        marking.push(places[p].tokens || 0);
    }
    lines.push(marking.join(' '));

    const pNames = places.map(p => p.label || p.name || `p${p.id}`).join(';');
    lines.push(`;Places=${pNames}`);

    const tNames = transitions.map(t => t.label || t.name || `t${t.id}`).join(';');
    lines.push(`;Transitions=${tNames}`);

    if (json.metadata && json.metadata.raw) {
        lines.push('');
        const metaLines = json.metadata.raw.split('\n');
        metaLines.forEach(l => {
            const clean = l.trim();
            if (clean && !clean.startsWith(';Places=') && !clean.startsWith(';Transitions=')) {
                lines.push(clean);
            }
        });
    }

    return lines.join("\n");
}

export function convertToPnml(json, netName) {
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<pnml>\n';
    xml += `  <net id="${netName}" type="http://www.pnml.org/version-2009/grammar/ptnet">\n`;

    const places = json.places || [];
    places.forEach(p => {
        xml += `    <place id="p${p.id}">\n`;
        xml += `      <name><text>${p.label || p.name || `p${p.id}`}</text></name>\n`;
        xml += `      <initialMarking><text>${p.tokens || 0}</text></initialMarking>\n`;
        if (p.x !== undefined && p.y !== undefined) {
            xml += `      <graphics><position x="${p.x}" y="${p.y}"/></graphics>\n`;
        }
        xml += `    </place>\n`;
    });

    const transitions = json.transitions || [];
    transitions.forEach(t => {
        xml += `    <transition id="t${t.id}">\n`;
        xml += `      <name><text>${t.label || t.name || `t${t.id}`}</text></name>\n`;
        if (t.x !== undefined && t.y !== undefined) {
            xml += `      <graphics><position x="${t.x}" y="${t.y}"/></graphics>\n`;
        }
        xml += `    </transition>\n`;
    });

    const arcs = json.arcs || [];
    let arcIdCounter = 0;
    arcs.forEach(a => {
        const isSourcePlace = places.some(p => p.id === a.source);
        const sourceId = isSourcePlace ? `p${a.source}` : `t${a.source}`;
        const targetId = isSourcePlace ? `t${a.target}` : `p${a.target}`;
        xml += `    <arc id="a${arcIdCounter++}" source="${sourceId}" target="${targetId}">\n`;
        xml += `      <inscription><text>${a.weight || 1}</text></inscription>\n`;
        xml += `    </arc>\n`;
    });

    xml += '  </net>\n';
    xml += '</pnml>';
    return xml;
}

export function downloadFile(filename, content) {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
