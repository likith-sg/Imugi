import { appState } from './state.js';
import { initializeTerminal, processCommand, handleConfirmation } from './main.js';

export function showView(viewId) {
    document.getElementById('landing-view').classList.remove('active');
    document.querySelectorAll('.page-view').forEach(v => v.classList.remove('active'));
    const view = document.getElementById(viewId);
    if (view) { view.classList.add('active'); }
    document.body.classList.toggle('app-mode', viewId === 'app-wrapper');
    document.body.style.overflowY = viewId === 'landing-view' ? 'auto' : 'hidden';
}

export function showNotification(message, type = 'success') {
    const toast = document.getElementById('notification-toast');
    toast.textContent = message;
    toast.className = 'show';
    toast.classList.add(type);
    setTimeout(() => {
        toast.className = toast.className.replace('show', '');
    }, 4000);
}

export function createNewPromptLine(promptText) {
    const terminalBody = document.getElementById('terminal-body');
    if (!terminalBody) return;
    const lineDiv = document.createElement('div');
    lineDiv.className = 'line';
    const form = document.createElement('form');
    form.className = 'terminal-form';
    const finalPromptText = promptText || `OS:/User/${appState.username}:&nbsp;`;
    form.innerHTML = `<span class="prompt-text">${finalPromptText}</span><input type="text" class="prompt-input" autocomplete="off" spellcheck="false" autofocus>`;
    lineDiv.appendChild(form);
    terminalBody.appendChild(lineDiv);
    const input = form.querySelector('.prompt-input');
    input.focus();
    terminalBody.scrollTop = terminalBody.scrollHeight;
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const command = input.value.trim();
        if (command) {
            const staticLine = document.createElement('div');
            staticLine.className = 'line';
            staticLine.innerHTML = `<span class="prompt-text">${finalPromptText}</span><span>${command}</span>`;
            form.parentElement.replaceWith(staticLine);
            if (appState.isAwaitingConfirmation) {
                handleConfirmation(command);
            } else {
                processCommand(command);
            }
        }
    });
}

export function refreshPromptLine() {
    const existingForm = document.querySelector('.terminal-form');
    if (existingForm) existingForm.parentElement.remove();
    createNewPromptLine(null);
}

export function addTerminalLine(text, type, returnElement = false) {
    const p = document.createElement('p');
    p.style.cssText = 'white-space: pre-wrap; margin: 0 0 0.5rem 0;';
    p.textContent = text;
    const terminalBody = document.getElementById('terminal-body');
    if (terminalBody) {
        terminalBody.appendChild(p);
        terminalBody.scrollTop = terminalBody.scrollHeight;
    }
    if (returnElement) return p;
}

export function closeTerminal() {
    document.getElementById('terminal-window').style.display = 'none';
    document.getElementById('reopen-terminal-btn').style.display = 'inline-flex';
}

export function toggleTheme() {
    const currentTheme = document.body.dataset.theme;
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    document.body.dataset.theme = newTheme;
    Chart.helpers.each(Chart.instances, (instance) => {
        const textColor = newTheme === 'dark' ? '#f9fafb' : '#0f172a';
        instance.options.plugins.legend.labels.color = textColor;
        instance.options.scales.x.ticks.color = textColor;
        instance.options.scales.y.ticks.color = textColor;
        instance.options.plugins.title.color = textColor;
        instance.options.plugins.datalabels.color = newTheme === 'dark' ? '#e5e7eb' : '#374151';
        instance.update();
    });
}

export function handleTabSwitch(e) {
    const targetId = e.target.dataset.target;
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    e.target.classList.add('active');
    document.querySelectorAll('.tab-pane').forEach(pane => {
        pane.classList.toggle('active', pane.id === targetId);
    });
}

export function createTableHTML(data, headers) {
    let headHTML = headers.map(h => `<th>${h}</th>`).join('');
    let bodyHTML = data.map(row => `<tr>${headers.map(h => `<td>${row[h] === null || row[h] === undefined ? '' : row[h]}</td>`).join('')}</tr>`).join('');
    return `<table class="inspector-table"><thead><tr>${headHTML}</tr></thead><tbody>${bodyHTML}</tbody></table>`;
}

export function openProfileModal() {
    document.getElementById('modal-username-display').textContent = appState.username;
    document.getElementById('modal-email-display').textContent = appState.email;
    document.getElementById('profile-modal').style.display = 'flex';
    document.querySelector('.user-profile').classList.remove('open');
}

export function openPasswordModal() {
    document.getElementById('change-password-form').reset();
    document.getElementById('password-modal').style.display = 'flex';
    document.querySelector('.user-profile').classList.remove('open');
}