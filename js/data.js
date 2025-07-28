import { appState } from './state.js';
import { addTerminalLine, refreshPromptLine, createTableHTML } from './ui.js';

// --- Data Analysis Helpers ---
export function inferColumnTypes(data, headers) {
    const types = {};
    if (!data || data.length === 0) return headers.reduce((acc, h) => { acc[h] = 'unknown'; return acc; }, {});
    const sampleSize = Math.min(data.length, 20);
    headers.forEach(header => {
        let nonNullCount = 0;
        let numericCount = 0;
        for (let i = 0; i < sampleSize; i++) {
            if (data[i] && (data[i][header] !== null && String(data[i][header]).trim() !== '')) {
                nonNullCount++;
                const value = String(data[i][header]).trim().replace(/[,%$]/g, '');
                if (value !== '' && !isNaN(Number(value))) {
                    numericCount++;
                }
            }
        }
        types[header] = (nonNullCount > 0 && (numericCount / nonNullCount) > 0.8) ? 'numerical' : 'categorical';
    });
    return types;
}

export function generateDatasetSummary(data, headers, columnTypes) {
    const summary = {};
    headers.forEach(header => {
        const values = data.map(row => row[header]).filter(v => v !== null && v !== undefined && String(v).trim() !== '');
        const missingCount = data.length - values.length;
        if (columnTypes[header] === 'numerical') {
            const numericValues = values.map(v => Number(String(v).trim().replace(/[,%$]/g, ''))).filter(n => !isNaN(n));
            if (numericValues.length > 0) {
                const sum = numericValues.reduce((a, b) => a + b, 0);
                const mean = sum / numericValues.length;
                const stdDev = Math.sqrt(numericValues.map(x => Math.pow(x - mean, 2)).reduce((a, b) => a + b, 0) / numericValues.length);
                summary[header] = { type: 'numerical', count: values.length, missing: missingCount, mean: parseFloat(mean.toFixed(2)), std: parseFloat(stdDev.toFixed(2)), min: Math.min(...numericValues), max: Math.max(...numericValues) };
            } else {
                summary[header] = { type: 'numerical', count: 0, missing: missingCount, mean: 0, std: 0, min: 0, max: 0 };
            }
        } else {
            const frequencies = values.reduce((acc, val) => { acc[val] = (acc[val] || 0) + 1; return acc; }, {});
            const top3 = Object.entries(frequencies).sort((a,b) => b[1] - a[1]).slice(0,3);
            summary[header] = { type: 'categorical', count: values.length, missing: missingCount, unique: new Set(values).size, top_3_frequencies: Object.fromEntries(top3) };
        }
    });
    return summary;
}

function generateDynamicSuggestions(summary) {
    const suggestions = []; const headers = Object.keys(summary);
    const numericalCols = headers.filter(h => summary[h].type === 'numerical');
    const categoricalCols = headers.filter(h => summary[h].type === 'categorical');
    suggestions.push(`give me a full summary of the dataset`);
    if (numericalCols.length > 0) { suggestions.push(`plot the distribution of ${numericalCols[0]}`); }
    if (categoricalCols.length > 0) { suggestions.push(`show a bar chart of counts for ${categoricalCols[0]}`); }
    if (numericalCols.length >= 2) { suggestions.push(`create a scatter plot of ${numericalCols[0]} vs ${numericalCols[1]}`); }
    if (numericalCols.length > 0 && categoricalCols.length > 0) { suggestions.push(`visualize the average ${numericalCols[0]} for each ${categoricalCols[0]}`); }
    return suggestions.slice(0, 5);
}

// --- File Handling & Processing ---
export function handleFileUpload(e) {
    for (const file of e.target.files) {
        addTerminalLine(`Processing "${file.name}"...`, 'agent');
        const ext = file.name.split('.').pop().toLowerCase();
        if (ext === 'csv') parseCsv(file);
        else if (ext === 'xls' || ext === 'xlsx') parseExcel(file);
    }
    e.target.value = '';
}

function parseCsv(file) {
    Papa.parse(file, {
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true,
        complete: (res) => processParsedData(file.name, res.data, res.meta.fields)
    });
}

function parseExcel(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const workbook = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
            const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
            if (jsonData.length > 0) processParsedData(file.name, jsonData, Object.keys(jsonData[0]));
        } catch (err) {
            addTerminalLine(`Error parsing Excel: ${err.message}`, 'agent');
        }
    };
    reader.readAsArrayBuffer(file);
}

function processParsedData(filename, data, headers) {
    appState.datasets[filename] = { data, headers };
    updateDatasetList();
    if (!appState.activeDataset || !appState.datasets[appState.activeDataset]) {
        setActiveDataset(filename);
    }
}

export function downloadModifiedData(format = 'xlsx') {
    const dataset = appState.datasets[appState.activeDataset];
    if (!dataset || dataset.data.length === 0) {
        addTerminalLine("Error: No data to download.", 'agent');
        return;
    }
    addTerminalLine(`Preparing download as ${format.toUpperCase()}...`, 'agent');
    const filename = `preprocessed_${appState.activeDataset.split('.')[0]}.${format}`;
    if (format === 'xlsx') {
        const worksheet = XLSX.utils.json_to_sheet(dataset.data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Preprocessed Data");
        XLSX.writeFile(workbook, filename);
    } else if (format === 'csv') {
        const csvString = Papa.unparse(dataset.data);
        const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}

// --- UI Updates related to Data ---
function updateDatasetList() {
    const listDiv = document.getElementById('dataset-list');
    listDiv.innerHTML = '<h3>Datasets</h3>';
    Object.keys(appState.datasets).forEach(filename => {
        const label = document.createElement('label');
        label.style.cssText = 'display: block; margin-bottom: 0.5rem;';
        label.innerHTML = `<input type="radio" name="active_dataset" value="${filename.replace(/"/g, '&quot;')}"> ${filename}`;
        listDiv.appendChild(label);
    });
    const firstRadio = listDiv.querySelector('input');
    if (firstRadio) firstRadio.checked = true;
    listDiv.querySelectorAll('input').forEach(radio => radio.addEventListener('change', (e) => setActiveDataset(e.target.value)));
}

function setActiveDataset(filename) {
    try {
        const selector = `input[value="${filename.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`;
        const radio = document.querySelector(selector);
        if (radio) radio.checked = true;
        appState.activeDataset = filename;
        appState.inspectorCurrentPage = 1;
        addTerminalLine(`Active dataset set to '${filename}'.`, 'agent');
        displayDataInspector();
        displayPromptSuggestions();
        document.querySelector('.tab-btn[data-target="inspector-pane"]').click();
    } catch(e) {
        console.error("Error setting active dataset:", e);
        addTerminalLine(`Error initializing UI for ${filename}.`, 'agent');
    } finally {
        if (!appState.isAwaitingConfirmation) {
            refreshPromptLine();
        }
    }
}


export function displayDataInspector() {
    const dataset = appState.datasets[appState.activeDataset];
    if (!dataset) return;
    const data = dataset.data;
    const totalRows = data.length;
    const rowsPerPage = appState.inspectorRowsPerPage;
    let currentPage = appState.inspectorCurrentPage;
    const totalPages = Math.ceil(totalRows / rowsPerPage) || 1;
    currentPage = Math.max(1, Math.min(currentPage, totalPages));
    appState.inspectorCurrentPage = currentPage;
    const start = (currentPage - 1) * rowsPerPage;
    const end = start + rowsPerPage;
    const paginatedData = data.slice(start, end);
    const inspectorPane = document.getElementById('inspector-pane');
    const rowCounts = [50, 100, 500];
    let buttonsHTML = rowCounts.map(count => `<button class="${count === appState.inspectorRowsPerPage ? 'active' : ''}" data-count="${count}">${count}</button>`).join('');
    inspectorPane.innerHTML = `<div class="inspector-controls"><div class="control-btn-group">${buttonsHTML}</div><div class="pagination-controls"><button id="prev-page-btn" class="btn btn-secondary" ${currentPage === 1 ? 'disabled' : ''}>Prev</button><span>Page ${currentPage} of ${totalPages}</span><button id="next-page-btn" class="btn btn-secondary" ${currentPage === totalPages ? 'disabled' : ''}>Next</button></div></div><div id="inspector-table-container"></div>`;
    inspectorPane.querySelectorAll('.control-btn-group button').forEach(button => button.addEventListener('click', (e) => {
        appState.inspectorRowsPerPage = parseInt(e.target.dataset.count, 10);
        appState.inspectorCurrentPage = 1;
        displayDataInspector();
    }));
    document.getElementById('prev-page-btn').addEventListener('click', () => { if (appState.inspectorCurrentPage > 1) { appState.inspectorCurrentPage--; displayDataInspector(); } });
    document.getElementById('next-page-btn').addEventListener('click', () => { if (appState.inspectorCurrentPage < totalPages) { appState.inspectorCurrentPage++; displayDataInspector(); } });
    document.getElementById('inspector-table-container').innerHTML = createTableHTML(paginatedData, dataset.headers);
}

function displayPromptSuggestions() {
    const suggestionsDiv = document.getElementById('prompt-suggestions');
    const suggestionsAccordion = document.getElementById('suggestions-accordion');
    if (!suggestionsDiv || !suggestionsAccordion || !appState.activeDataset) {
        if(suggestionsAccordion) suggestionsAccordion.style.display = 'none';
        return;
    };
    suggestionsAccordion.style.display = 'block';
    const dataset = appState.datasets[appState.activeDataset];
    const columnTypes = inferColumnTypes(dataset.data, dataset.headers);
    const summary = generateDatasetSummary(dataset.data, dataset.headers, columnTypes);
    const suggestions = generateDynamicSuggestions(summary);
    suggestionsDiv.innerHTML = suggestions.map(s => `<button class="btn btn-secondary btn-full" style="text-align: left; margin-bottom: 0.5rem; font-weight: 500;">${s}</button>`).join('');
    suggestionsDiv.querySelectorAll('button').forEach(btn => btn.addEventListener('click', () => {
        const command = btn.textContent;
        document.querySelector('.tab-btn[data-target="terminal-pane"]').click();
        setTimeout(() => {
            const input = document.querySelector('.prompt-input');
            if(input) {
                input.value = `cd ${command}`; // Prepend 'cd' for consistency
                input.closest('form').dispatchEvent(new Event('submit', { bubbles: true }));
            }
        }, 100);
    }));
}