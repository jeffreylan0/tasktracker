document.addEventListener('DOMContentLoaded', () => {
    const coverDiv = document.getElementById('cover');
    const timerDisplay = document.getElementById('timer-display');
    const controlButton = document.getElementById('control-button');
    const widgetContainer = document.getElementById('widget-container');

    let timerInterval = null;
    let taskState = {};
    const params = new URLSearchParams(window.location.search);
    // The ONLY parameter we need now is the secret token.
    const TOKEN = params.get('token');

    // --- NEW: Theme Detection ---
    // Detects Notion's theme and applies a 'dark' class to the body.
    function detectTheme() {
        // Notion may pass its theme in the URL fragment
        if (window.location.hash.includes('theme=dark')) {
            document.body.classList.add('dark');
        }
        // Also respect the OS-level preference
        const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        if (prefersDark) {
            document.body.classList.add('dark');
        }
    }

    const api = {
        get: (endpoint) => fetch(endpoint), // No query params needed for initial status
        post: (endpoint, body) => fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        }),
    };

    async function initialize() {
        detectTheme(); // Set theme first

        if (!TOKEN) {
            showError("Config Error: 'token' parameter is missing in URL.");
            return;
        }

        try {
            // The API now infers the pageId from the Referer header.
            const response = await api.get('/api/task/status');
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.message || "Failed to fetch status.");
            }
            taskState = await response.json();
            updateUI();
        } catch (err) {
            console.error(err);
            showError(err.message || "Could not load task data.");
        }
    }

    function updateUI() {
        if (taskState.state === 'Completed') {
            widgetContainer.style.display = 'none';
            return;
        }

        coverDiv.style.backgroundImage = `url('${taskState.cover_url || ''}')`;
        clearInterval(timerInterval);

        switch (taskState.state) {
            case 'Not started':
                setButtonState('Start');
                updateTimerDisplay(taskState.duration_sec);
                break;
            case 'Working':
                setButtonState('Pause');
                startClientSideTimer();
                break;
            case 'Paused':
                setButtonState('Resume');
                updateTimerDisplay(taskState.duration_sec - taskState.elapsed_sec);
                break;
        }
    }

    controlButton.addEventListener('click', async () => {
        controlButton.disabled = true;
        try {
            // For all POST requests, we must include the pageId and token.
            const response = await api.post('/api/task/toggle', {
                pageId: taskState.pageId,
                token: TOKEN,
                duration_sec: taskState.duration_sec
            });
            if (!response.ok) throw new Error(await response.text());

            taskState = await response.json();
            updateUI();

            if (taskState.state !== 'Not started') {
                 api.post('/api/image/generate', { pageId: taskState.pageId, token: TOKEN });
            }
        } catch (err) {
            console.error(err);
        } finally {
            controlButton.disabled = false;
        }
    });

    function startClientSideTimer() {
        const resumeTime = new Date(taskState.last_resumed_at).getTime();
        const initialElapsed = taskState.elapsed_sec;
        const duration = taskState.duration_sec;

        timerInterval = setInterval(async () => {
            const sessionElapsed = (new Date().getTime() - resumeTime) / 1000;
            const totalWorked = initialElapsed + sessionElapsed;
            const remaining = duration - totalWorked;

            if (remaining <= 0) {
                clearInterval(timerInterval);
                updateTimerDisplay(0);
                widgetContainer.style.display = 'none';
                await api.post('/api/task/complete', { pageId: taskState.pageId, token: TOKEN });
                return;
            }
            updateTimerDisplay(remaining);
        }, 1000);
    }

    function setButtonState(text) {
        controlButton.textContent = text;
    }

    function updateTimerDisplay(seconds) {
        const remainingSeconds = Math.max(0, seconds);
        const mins = Math.floor(remainingSeconds / 60);
        const secs = Math.floor(remainingSeconds % 60);
        timerDisplay.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }

    function showError(message) {
        widgetContainer.innerHTML = `<div class="overlay" style="padding: 10px; text-align: center;"><p style="color: #d93521; font-weight: 500;">${message}</p></div>`;
    }

    initialize();
});
