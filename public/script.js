// File: public/script.js
document.addEventListener('DOMContentLoaded', () => {
    const coverDiv = document.getElementById('cover');
    const timerDisplay = document.getElementById('timer-display');
    const controlButton = document.getElementById('control-button');
    const statusText = document.getElementById('status-text');
    const widgetContainer = document.getElementById('widget-container');

    let timerInterval = null;
    let taskState = {};
    const params = new URLSearchParams(window.location.search);
    const PAGE_ID = params.get('pageId');
    const TOKEN = params.get('token');

    const api = {
        get: (endpoint, queryParams) => fetch(`${endpoint}?${new URLSearchParams(queryParams)}`),
        post: (endpoint, body) => fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        }),
    };

    async function initialize() {
        if (!PAGE_ID || !TOKEN) {
            showError("Config Error: pageId or token missing in URL.");
            return;
        }

        try {
            // The duration parameter is no longer sent from the client
            const response = await api.get('/api/task/status', { pageId: PAGE_ID, token: TOKEN });
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
                setButtonState('Start', 'state-start');
                statusText.textContent = 'Ready to begin?';
                updateTimerDisplay(taskState.duration_sec);
                break;
            case 'Working':
                setButtonState('Pause', 'state-pause');
                statusText.textContent = 'In progress...';
                startClientSideTimer();
                break;
            case 'Paused':
                setButtonState('Resume', 'state-resume');
                statusText.textContent = 'Paused. Take a break!';
                updateTimerDisplay(taskState.duration_sec - taskState.elapsed_sec);
                break;
        }
    }

    controlButton.addEventListener('click', async () => {
        controlButton.disabled = true;
        try {
            // Now, we pass the duration that was fetched from the status endpoint
            const response = await api.post('/api/task/toggle', {
                pageId: PAGE_ID,
                token: TOKEN,
                duration_sec: taskState.duration_sec
            });
            if (!response.ok) throw new Error(await response.text());

            taskState = await response.json();
            updateUI();

            if (taskState.state !== 'Not started') {
                 api.post('/api/image/generate', { pageId: PAGE_ID, token: TOKEN });
            }
        } catch (err) {
            console.error(err);
            statusText.textContent = "An error occurred.";
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
                await api.post('/api/task/complete', { pageId: PAGE_ID, token: TOKEN });
                return;
            }
            updateTimerDisplay(remaining);
        }, 1000);
    }

    function setButtonState(text, cssClass, disabled = false) {
        controlButton.textContent = text;
        controlButton.className = cssClass;
        controlButton.disabled = disabled;
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
