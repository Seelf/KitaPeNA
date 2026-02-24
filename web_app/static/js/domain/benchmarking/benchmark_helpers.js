/**
 * benchmark_helpers.js — Small utility functions used across benchmarking modules.
 */

export function getCsrfToken() {
    return document.querySelector('meta[name="csrf-token"]')?.content;
}

export function updateDspnPreview() {
    const preview = document.getElementById('dspnCmdPreviewText');
    if (preview) preview.textContent = buildDspnArgs();
}

export function buildDspnArgs() {
    let args = [];

    const v = document.getElementById('dspn_opt_verbose').value;
    if (v) args.push(v);

    if (document.getElementById('dspn_opt_pt').checked) args.push('-pt');
    if (document.getElementById('dspn_opt_trg').checked) args.push('-trg');
    if (document.getElementById('dspn_opt_rg').checked) args.push('-rg');
    if (document.getElementById('dspn_opt_novpaths').checked) args.push('-no-vpaths');
    if (document.getElementById('dspn_opt_pinv').checked) args.push('-pinv');
    if (document.getElementById('dspn_opt_tinv').checked) args.push('-tinv');
    if (document.getElementById('dspn_opt_traps').checked) args.push('-traps');
    if (document.getElementById('dspn_opt_dot').checked) args.push('-dot');
    if (document.getElementById('dspn_opt_allmeas').checked) args.push('-all-measures');
    if (document.getElementById('dspn_opt_s').checked) args.push('-s');

    const tVal = document.getElementById('dspn_val_t').value;
    if (tVal) args.push('-t ' + tVal);

    const m = document.getElementById('dspn_opt_method').value;
    if (m) args.push(m);

    const s = document.getElementById('dspn_opt_solver').value;
    if (s) args.push(s);

    const p = document.getElementById('dspn_opt_prec').value;
    if (p) args.push(p);

    const eps = document.getElementById('dspn_val_epsilon').value;
    if (eps) args.push('-epsilon ' + eps);
    const iters = document.getElementById('dspn_val_maxiters').value;
    if (iters) args.push('-max-iters ' + iters);
    const timeout = document.getElementById('dspn_val_timeout').value;
    if (timeout) args.push('-timeout ' + timeout);

    return args.join(' ');
}

export function setupSearch(inputId, listId) {
    const input = document.getElementById(inputId);
    const list = document.getElementById(listId);
    if (!input || !list) return;

    input.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        const items = list.children;
        Array.from(items).forEach(item => {
            const label = item.innerText.toLowerCase();
            if (label.includes(query)) {
                item.style.display = 'flex';
                if (!item.classList.contains('algo-item') && !item.classList.contains('regex-item')) item.style.display = 'block';
            } else {
                item.style.display = 'none';
            }
        });
    });
}

export function colorizeConsoleOutput(text) {
    if (!text) return "";
    let html = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    html = html.replace(/\b(\d+(\.\d+)?)\b/g, '<span style="color: #b5cea8;">$1</span>');
    html = html.replace(/\b(Error|Warning|Failed|Exception|Skipped)\b/gi, '<span style="color: #f14c4c; font-weight: bold;">$1</span>');
    html = html.replace(/\b(Success|Done|Ready)\b/gi, '<span style="color: #23d18b; font-weight: bold;">$1</span>');
    html = html.replace(/\b(Command|Executing|Starting|Completed|Running)\b/gi, '<span style="color: #569cd6;">$1</span>');
    html = html.replace(/\b(DSPN-Tool|GreatSPN)\b/g, '<span style="color: #ff9f40; font-weight: bold;">$1</span>');
    html = html.replace(/(\B-\w+)/g, '<span style="color: #dcdcaa;">$1</span>');
    html = html.replace(/(\[.*?\])/g, '<span style="color: #ce9178;">$1</span>');
    html = html.replace(/\n/g, '<br>');

    return html;
}

export function appendLog(text, type = 'info') {
    const consoleEl = document.getElementById('benchConsole');
    const largeConsoleEl = document.getElementById('largeBenchConsole');

    [consoleEl, largeConsoleEl].forEach(el => {
        if (!el) return;
        const line = document.createElement('div');
        line.className = `console-line ${type}`;
        line.innerHTML = colorizeConsoleOutput(text);
        el.appendChild(line);
        el.scrollTop = el.scrollHeight;
    });
}

export function selectListItems(containerId, bool) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const items = container.querySelectorAll('.saved-item, .algo-item');
    items.forEach(item => {
        if (item.style.display === 'none') return;
        const cb = item.querySelector('input[type="checkbox"]');
        if (cb && !cb.disabled) {
            cb.checked = bool;
            item.classList.toggle('selected', bool);
        }
    });
}
