import { appState } from './state.js';
import { showView, showNotification, addTerminalLine, closeTerminal, createNewPromptLine, refreshPromptLine, toggleTheme, handleTabSwitch, openProfileModal, openPasswordModal } from './ui.js';
import { handleFileUpload, downloadModifiedData, displayDataInspector, inferColumnTypes, generateDatasetSummary } from './data.js';
import { renderChart, generateReport, exportReport } from './report.js';
import { getGeminiResponse } from './api.js';

// --- App Initialization & UI Animations ---
document.addEventListener('DOMContentLoaded', () => {
    Chart.register(Chart.registry.plugins.get('datalabels'));
    const sessionEmail = sessionStorage.getItem('imugiSessionEmail') || localStorage.getItem('imugiSessionEmail');
    if (sessionEmail) {
        const userAccountJSON = localStorage.getItem(sessionEmail);
        if (userAccountJSON) {
            initializeApp(JSON.parse(userAccountJSON));
        } else {
            localStorage.removeItem('imugiSessionEmail');
            sessionStorage.removeItem('imugiSessionEmail');
            setupAuthEventListeners();
            showView('landing-view');
        }
    } else {
        setupAuthEventListeners();
        showView('landing-view');
    }
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
            }
        });
    }, { threshold: 0.1 });
    document.querySelectorAll('.anim-on-scroll').forEach(el => observer.observe(el));
    document.querySelector('.landing-hero').classList.add('visible');
});

// --- Authentication & Session Management ---
function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const userAccountJSON = localStorage.getItem(email);
    if (!userAccountJSON) {
        showNotification('No account found with this email.', 'error');
        return;
    }
    const userAccount = JSON.parse(userAccountJSON);
    if (userAccount.password !== password) {
        showNotification("Incorrect password.", 'error');
        return;
    }
    const keepSignedIn = document.getElementById('keep-signed-in').checked;
    if (keepSignedIn) {
        localStorage.setItem('imugiSessionEmail', email);
    } else {
        sessionStorage.setItem('imugiSessionEmail', email);
    }
    initializeApp(userAccount);
}

function handleSignup(e) {
    e.preventDefault();
    const username = document.getElementById('signup-username').value.trim();
    const email = document.getElementById('signup-email').value.trim();
    const password = document.getElementById('signup-password').value;
    const confirmPassword = document.getElementById('signup-confirm-password').value;
    if (!username || !email || !password) {
        showNotification("Please fill out all fields.", 'error');
        return;
    }
    if (password.length < 6) {
        showNotification("Password must be at least 6 characters long.", 'error');
        return;
    }
    if (password !== confirmPassword) {
        showNotification("Passwords do not match!", 'error');
        return;
    }
    if (localStorage.getItem(email)) {
        showNotification("An account with this email already exists.", 'error');
        return;
    }
    const userAccount = { username, email, password };
    localStorage.setItem(email, JSON.stringify(userAccount));
    sessionStorage.setItem('imugiSessionEmail', email);
    initializeApp(userAccount);
}

function handleLogout() {
    localStorage.removeItem('imugiSessionEmail');
    sessionStorage.removeItem('imugiSessionEmail');
    location.reload();
}

function handleChangePassword(e) {
    e.preventDefault();
    const oldPass = document.getElementById('old-password').value;
    const newPass = document.getElementById('new-password').value;
    const confirmNewPass = document.getElementById('confirm-new-password').value;
    const userAccount = JSON.parse(localStorage.getItem(appState.email));
    if (userAccount.password !== oldPass) {
        showNotification("Old password is not correct.", 'error');
        return;
    }
    if (newPass.length < 6) {
        showNotification("New password must be at least 6 characters long.", 'error');
        return;
    }
    if (newPass !== confirmNewPass) {
        showNotification("New passwords do not match.", 'error');
        return;
    }
    userAccount.password = newPass;
    localStorage.setItem(appState.email, JSON.stringify(userAccount));
    showNotification("Password updated successfully!", 'success');
    document.getElementById('password-modal').style.display = 'none';
}

// --- App Core ---
function initializeApp(user) {
    appState.username = user.username;
    appState.email = user.email;
    document.getElementById('app-wrapper').style.display = 'flex';
    showView('app-wrapper');
    document.getElementById('user-avatar').textContent = appState.username.charAt(0).toUpperCase();
    document.getElementById('profile-username').textContent = appState.username;
    document.getElementById('profile-email').textContent = appState.email;
    setupAppListeners();
    initializeTerminal();
}

export function initializeTerminal() {
    const terminalWindow = document.getElementById('terminal-window');
    const reopenBtn = document.getElementById('reopen-terminal-btn');
    terminalWindow.style.display = 'flex';
    terminalWindow.classList.remove('minimized', 'fullscreen');
    reopenBtn.style.display = 'none';
    const terminalBody = document.getElementById('terminal-body');
    terminalBody.innerHTML = '';
    appState.terminalHistory = [];
    appState.isAwaitingConfirmation = false;
    appState.pendingCode = null;
    addTerminalLine(`Welcome, ${appState.username}. The agent Imugi is ready. Use 'cd' to issue commands.`, 'agent');
    refreshPromptLine();
}

// --- Terminal & Command Logic ---
export function handleConfirmation(input) {
    const response = input.toLowerCase();
    if (response === 'y' || response === 'yes') {
        try {
            const actionFunction = new Function('appState', appState.pendingCode);
            actionFunction(appState);
            addTerminalLine('Action executed successfully. The data has been modified.', 'agent');
            displayDataInspector();
        } catch (execError) {
            console.error("Error executing generated code:", execError);
            addTerminalLine(`Error during action execution: ${execError.message}`, 'agent');
        }
    } else {
        addTerminalLine('Action cancelled by user.', 'agent');
    }
    appState.isAwaitingConfirmation = false;
    appState.pendingCode = null;
    refreshPromptLine();
}

export async function processCommand(command) {
    if (command.toLowerCase() === 'cd dwn excel' || command.toLowerCase() === 'cd dwn csv') {
        const format = command.toLowerCase() === 'cd dwn excel' ? 'xlsx' : 'csv';
        downloadModifiedData(format);
        refreshPromptLine();
        return;
    }
    appState.terminalHistory.push({ type: 'prompt', content: command });
    if (!appState.activeDataset) {
        addTerminalLine("Error: No dataset loaded.", 'agent');
        refreshPromptLine();
        return;
    }
    if (!command.toLowerCase().startsWith('cd ')) {
        addTerminalLine("Error: Invalid syntax. All prompts must start with 'cd '.", 'agent');
        refreshPromptLine();
        return;
    }
    const thinkingLine = addTerminalLine("Imugi is thinking...", 'agent', true);
    const actualPrompt = command.substring(3).trim();
    try {
        // --- THIS IS THE MODIFIED SECTION ---
        const dataset = appState.datasets[appState.activeDataset];
        const { data, headers } = dataset;
        const columnTypes = inferColumnTypes(data, headers);
        const summary = generateDatasetSummary(data, headers, columnTypes);
        const dataSample = data.slice(0, 5);

        const datasetSummary = {
            totalRows: data.length,
            summary: summary
        };

        const agentResponse = await getGeminiResponse(actualPrompt, datasetSummary, dataSample, appState.activeDataset);
        // --- END OF MODIFIED SECTION ---

        thinkingLine.remove();
        if (agentResponse.type === 'action' && agentResponse.code) {
            addTerminalLine(agentResponse.explanation, 'agent');
            const codeBlock = document.createElement('pre');
            codeBlock.style.cssText = 'background-color: #030712; padding: 1rem; border-radius: 0.5rem; white-space: pre-wrap; color: #f9fafb;';
            codeBlock.textContent = agentResponse.code;
            document.getElementById('terminal-body').appendChild(codeBlock);
            appState.isAwaitingConfirmation = true;
            appState.pendingCode = agentResponse.code;
            const existingForm = document.querySelector('.terminal-form');
            if (existingForm) existingForm.parentElement.remove();
            createNewPromptLine("Execute this code? (y/n):&nbsp;");
        } else {
            addTerminalLine(agentResponse.explanation, 'agent');
            appState.terminalHistory.push({ type: 'response', content: agentResponse.explanation });
            if (agentResponse.chart && agentResponse.chart.type !== 'none' && agentResponse.chart.data) {
                const chartId = `chart-${Date.now()}`;
                renderChart(agentResponse.chart, chartId);
                appState.terminalHistory.push({ type: 'chart', content: { chartId, chartDef: agentResponse.chart } });
            }
            refreshPromptLine();
        }
    } catch (error) {
        thinkingLine.remove();
        console.error('Gemini API Error:', error);
        addTerminalLine(`An error occurred: ${error.message}`, 'agent');
        refreshPromptLine();
    }
}

// --- Event Listener Setup ---
function setupAuthEventListeners() {
    document.getElementById('get-started-btn').addEventListener('click', () => showView('auth-view'));
    document.getElementById('nav-signin-btn').addEventListener('click', () => showView('auth-view'));
    document.getElementById('login-form').addEventListener('submit', handleLogin);
    document.getElementById('signup-form').addEventListener('submit', handleSignup);
    document.getElementById('show-signup-link').addEventListener('click', (e) => { e.preventDefault(); showView('signup-view'); });
    document.getElementById('show-login-link').addEventListener('click', (e) => { e.preventDefault(); showView('auth-view'); });
}

function setupAppListeners() {
    const userProfile = document.querySelector('.user-profile');
    document.getElementById('user-avatar').addEventListener('click', (e) => { e.stopPropagation(); userProfile.classList.toggle('open'); });
    document.addEventListener('click', (e) => { if (!userProfile.contains(e.target)) { userProfile.classList.remove('open'); } });
    document.getElementById('logout-btn').addEventListener('click', handleLogout);
    document.getElementById('file-upload').addEventListener('change', handleFileUpload);
    document.querySelectorAll('.tab-btn').forEach(btn => btn.addEventListener('click', handleTabSwitch));
    document.querySelectorAll('.accordion-header').forEach(h => h.addEventListener('click', () => h.parentElement.classList.toggle('open')));
    document.getElementById('terminal-close').addEventListener('click', closeTerminal);
    document.getElementById('terminal-minimize').addEventListener('click', () => document.getElementById('terminal-window').classList.toggle('minimized'));
    document.getElementById('terminal-maximize').addEventListener('click', () => document.getElementById('terminal-window').classList.toggle('fullscreen'));
    document.getElementById('reopen-terminal-btn').addEventListener('click', initializeTerminal);
    document.getElementById('theme-toggle-btn').addEventListener('click', toggleTheme);
    document.getElementById('generate-report-btn').addEventListener('click', generateReport);
    document.getElementById('close-report-btn').addEventListener('click', () => {
        document.getElementById('report-modal').style.display = 'none';
        if (appState.reportKeydownHandler) {
            document.removeEventListener('keydown', appState.reportKeydownHandler);
            appState.reportKeydownHandler = null;
        }
    });
    document.getElementById('account-info-btn').addEventListener('click', openProfileModal);
    document.getElementById('change-password-btn').addEventListener('click', openPasswordModal);
    document.querySelectorAll('.close-modal-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.getElementById('profile-modal').style.display = 'none';
            document.getElementById('password-modal').style.display = 'none';
        });
    });
    document.getElementById('change-password-form').addEventListener('submit', handleChangePassword);
    const exportDropdown = document.querySelector('.export-dropdown');
    document.getElementById('export-btn').addEventListener('click', (e) => { e.stopPropagation(); exportDropdown.classList.toggle('open'); });
    document.addEventListener('click', (e) => { if (!exportDropdown.contains(e.target)) { exportDropdown.classList.remove('open'); } });
    document.getElementById('export-pdf').addEventListener('click', (e) => { e.preventDefault(); exportReport('pdf'); });
    document.getElementById('export-ppt').addEventListener('click', (e) => { e.preventDefault(); exportReport('pptx'); });
}