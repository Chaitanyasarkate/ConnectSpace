/**
 * ConnectSpace Main Application UI Controller
 */
document.addEventListener('DOMContentLoaded', () => {
    // DOM Element References
    const elements = {
        // Status & Notices
        connectionStatusBadge: document.getElementById('connection-status-badge'),
        statusText: document.getElementById('status-text'),
        twilioWarning: document.getElementById('twilio-warning'),
        toastContainer: document.getElementById('toast-container'),
        loadingOverlay: document.getElementById('loading-overlay'),
        loadingMessage: document.getElementById('loading-message'),

        // Lobby View
        lobbyContainer: document.getElementById('lobby-container'),
        joinForm: document.getElementById('join-room-form'),
        usernameInput: document.getElementById('username-input'),
        roomInput: document.getElementById('room-input'),
        joinBtn: document.getElementById('join-btn'),
        localPreviewVideo: document.getElementById('local-preview-video'),
        previewPlaceholder: document.getElementById('preview-placeholder'),
        previewMicBtn: document.getElementById('preview-mic-btn'),
        previewCamBtn: document.getElementById('preview-cam-btn'),
        requestPermBtn: document.getElementById('request-perm-btn'),

        // Active Call View
        roomContainer: document.getElementById('room-container'),
        currentRoomName: document.getElementById('current-room-name'),
        callTimer: document.getElementById('call-timer'),
        participantCount: document.getElementById('participant-count'),
        videoGrid: document.getElementById('video-grid'),

        // Local Participant Tile
        localParticipantTile: document.getElementById('local-participant-tile'),
        localVideo: document.getElementById('local-video'),
        localVideoFallback: document.getElementById('local-video-fallback'),
        localAvatarInitials: document.getElementById('local-avatar-initials'),
        localUserName: document.getElementById('local-user-name'),
        localAudioIndicator: document.getElementById('local-audio-indicator'),

        // Call Metrics & View Header
        toggleViewBtn: document.getElementById('toggle-view-btn'),
        viewModeLabel: document.getElementById('view-mode-label'),
        muteAllBtn: document.getElementById('mute-all-btn'),

        // Control Bar
        toggleMicBtn: document.getElementById('toggle-mic-btn'),
        toggleCamBtn: document.getElementById('toggle-cam-btn'),
        toggleScreenBtn: document.getElementById('toggle-screen-btn'),
        toggleChatBtn: document.getElementById('toggle-chat-btn'),
        unreadBadge: document.getElementById('unread-badge'),
        handRaiseBtn: document.getElementById('hand-raise-btn'),
        reactionsBtn: document.getElementById('reactions-btn'),
        reactionsPicker: document.getElementById('reactions-picker'),
        toggleCaptionsBtn: document.getElementById('toggle-captions-btn'),
        toggleBlurBtn: document.getElementById('toggle-blur-btn'),
        toggleFullscreenBtn: document.getElementById('toggle-fullscreen-btn'),
        copyLinkBtn: document.getElementById('copy-link-btn'),
        leaveBtn: document.getElementById('leave-btn'),

        // Closed Captions Overlay Banner
        captionOverlay: document.getElementById('caption-overlay'),
        captionSpeaker: document.getElementById('caption-speaker'),
        captionText: document.getElementById('caption-text'),

        // In-Call Chat Drawer
        chatPanel: document.getElementById('chat-panel'),
        closeChatBtn: document.getElementById('close-chat-btn'),
        chatMessages: document.getElementById('chat-messages'),
        chatForm: document.getElementById('chat-form'),
        chatInput: document.getElementById('chat-input')
    };

    // State Variables
    let localPreviewStream = null;
    let isPreviewMicOn = true;
    let isPreviewCamOn = true;
    let roomManager = null;
    let callTimerInterval = null;
    let callStartTime = null;
    let activeParticipants = new Map(); // Store remote participant tiles by SID
    
    // Phase 1 State
    let isSharingScreen = false;
    let isHandRaised = false;
    let isChatOpen = false;
    let unreadCount = 0;
    let currentUsername = '';

    // Phase 2 State
    let isHost = false;
    let isSpeakerView = false;
    let currentSpotlightSid = null;

    // Phase 3 State
    let isCaptionsOn = false;
    let isBackgroundBlurred = false;
    let speechRecognizer = null;
    let captionHideTimeout = null;

    // Check Backend Health & Twilio Config Status on Load
    checkBackendHealth();

    // Auto-fill room name from URL query parameter if present
    const urlParams = new URLSearchParams(window.location.search);
    const roomParam = urlParams.get('room');
    if (roomParam) {
        elements.roomInput.value = roomParam;
    }

    // Auto start camera preview
    startLocalPreview();

    // Event Listeners
    elements.requestPermBtn.addEventListener('click', startLocalPreview);
    elements.previewMicBtn.addEventListener('click', togglePreviewMic);
    elements.previewCamBtn.addEventListener('click', togglePreviewCam);
    elements.joinForm.addEventListener('submit', handleJoinRoomSubmit);
    elements.toggleMicBtn.addEventListener('click', handleToggleMic);
    elements.toggleCamBtn.addEventListener('click', handleToggleCam);
    elements.toggleScreenBtn.addEventListener('click', handleToggleScreenShare);
    elements.toggleChatBtn.addEventListener('click', toggleChatDrawer);
    elements.closeChatBtn.addEventListener('click', toggleChatDrawer);
    elements.chatForm.addEventListener('submit', handleSendChatMessage);
    elements.handRaiseBtn.addEventListener('click', handleToggleHandRaise);
    elements.reactionsBtn.addEventListener('click', toggleReactionsPicker);

    // Phase 2 Listeners
    elements.toggleViewBtn.addEventListener('click', toggleSpeakerView);
    elements.muteAllBtn.addEventListener('click', handleHostMuteAll);

    // Phase 3 Listeners
    elements.toggleCaptionsBtn.addEventListener('click', toggleCaptions);
    elements.reactionsBtn.addEventListener('click', toggleReactionsPicker);

    // Reaction Emoji Event Delegation
    elements.reactionsPicker.addEventListener('click', (e) => {
        const btn = e.target.closest('.reaction-emoji-btn');
        if (btn) {
            const emoji = btn.getAttribute('data-emoji');
            sendEmojiReaction(emoji);
        }
    });

    // Close reactions picker when clicking outside
    document.addEventListener('click', (e) => {
        if (!elements.reactionsPicker.classList.contains('hidden')) {
            if (!elements.reactionsPicker.contains(e.target) && !elements.reactionsBtn.contains(e.target)) {
                elements.reactionsPicker.classList.add('hidden');
            }
        }
    });

    elements.toggleFullscreenBtn.addEventListener('click', handleToggleFullscreen);

    // Double-click tile to toggle Fullscreen
    document.addEventListener('dblclick', (e) => {
        const tile = e.target.closest('.participant-tile');
        if (tile) {
            toggleElementFullscreen(tile);
        }
    });

    // Delegated click for tile-fullscreen-btn
    document.addEventListener('click', (e) => {
        const fullBtn = e.target.closest('.tile-fullscreen-btn');
        if (fullBtn) {
            const tile = fullBtn.closest('.participant-tile');
            if (tile) {
                toggleElementFullscreen(tile);
            }
        }
    });

    // Listen for browser fullscreen change events
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);

    elements.copyLinkBtn.addEventListener('click', handleCopyInviteLink);
    elements.leaveBtn.addEventListener('click', handleLeaveRoom);

    /**
     * Check backend health and Twilio credential status
     */
    async function checkBackendHealth() {
        try {
            const res = await fetch('/api/health');
            const data = await res.json();
            if (!data.twilio_configured) {
                elements.twilioWarning.classList.remove('hidden');
            }
        } catch (err) {
            console.warn('Backend health check failed:', err);
        }
    }

    /**
     * Start local camera and microphone preview in Lobby
     */
    async function startLocalPreview() {
        try {
            if (localPreviewStream) {
                localPreviewStream.getTracks().forEach(track => track.stop());
            }

            localPreviewStream = await navigator.mediaDevices.getUserMedia({
                video: { width: 640, height: 480 },
                audio: true
            });

            elements.localPreviewVideo.srcObject = localPreviewStream;
            elements.localPreviewVideo.style.display = 'block';
            elements.previewPlaceholder.style.display = 'none';

            showToast('Camera and microphone ready', 'success', 3000);
        } catch (err) {
            console.warn('Camera/Mic permission error:', err);
            elements.localPreviewVideo.style.display = 'none';
            elements.previewPlaceholder.style.display = 'flex';
            showToast('Camera/Microphone permission denied or device not found.', 'error', 5000);
        }
    }

    /**
     * Toggle Preview Mic
     */
    function togglePreviewMic() {
        if (!localPreviewStream) return;
        const audioTracks = localPreviewStream.getAudioTracks();
        if (audioTracks.length > 0) {
            isPreviewMicOn = !isPreviewMicOn;
            audioTracks[0].enabled = isPreviewMicOn;
            elements.previewMicBtn.classList.toggle('active', isPreviewMicOn);
            elements.previewMicBtn.classList.toggle('muted', !isPreviewMicOn);
            elements.previewMicBtn.querySelector('i').className = isPreviewMicOn ? 'fa-solid fa-microphone' : 'fa-solid fa-microphone-slash';
        }
    }

    /**
     * Toggle Preview Camera
     */
    function togglePreviewCam() {
        if (!localPreviewStream) return;
        const videoTracks = localPreviewStream.getVideoTracks();
        if (videoTracks.length > 0) {
            isPreviewCamOn = !isPreviewCamOn;
            videoTracks[0].enabled = isPreviewCamOn;
            elements.previewCamBtn.classList.toggle('active', isPreviewCamOn);
            elements.previewCamBtn.classList.toggle('off', !isPreviewCamOn);
            elements.previewCamBtn.querySelector('i').className = isPreviewCamOn ? 'fa-solid fa-video' : 'fa-solid fa-video-slash';
            elements.localPreviewVideo.style.display = isPreviewCamOn ? 'block' : 'none';
            elements.previewPlaceholder.style.display = isPreviewCamOn ? 'none' : 'flex';
        }
    }

    /**
     * Form submit handler for joining room
     */
    async function handleJoinRoomSubmit(e) {
        e.preventDefault();

        const username = elements.usernameInput.value.trim();
        const roomName = elements.roomInput.value.trim();

        if (!username || !roomName) {
            showToast('Please enter both your name and room name.', 'error');
            return;
        }

        // Stop lobby preview stream before room connection
        if (localPreviewStream) {
            localPreviewStream.getTracks().forEach(track => track.stop());
            localPreviewStream = null;
        }

        currentUsername = username;
        showLoading(true, 'Connecting to Twilio Room...');

        try {
            // Instantiate Room Manager with callbacks
            roomManager = new TwilioRoomManager({
                onParticipantJoined: handleRemoteParticipantJoined,
                onParticipantLeft: handleRemoteParticipantLeft,
                onTrackSubscribed: handleRemoteTrackSubscribed,
                onTrackUnsubscribed: handleRemoteTrackUnsubscribed,
                onDataMessage: handleIncomingDataMessage,
                onScreenShareEnded: handleScreenShareEnded,
                onDominantSpeakerChanged: handleDominantSpeakerChanged,
                onDisconnected: handleRoomDisconnected
            });

            // 1. Fetch JWT Token from Flask API
            const tokenData = await roomManager.fetchToken(username, roomName);

            // 2. Connect to Twilio Room
            const room = await roomManager.connectRoom(tokenData.token, roomName);

            // Host determination: First participant in room becomes Host
            isHost = (room.participants.size === 0);

            // 3. Setup Local Participant UI
            setupLocalUserUI(username, room.localParticipant);

            // 4. Transition Views
            elements.lobbyContainer.classList.add('hidden');
            elements.roomContainer.classList.remove('hidden');
            elements.currentRoomName.textContent = roomName;

            if (isHost) {
                elements.muteAllBtn.classList.remove('hidden');
            } else {
                elements.muteAllBtn.classList.add('hidden');
            }
            
            updateConnectionStatus(true, `Connected to ${roomName}`);
            startCallTimer();
            updateParticipantCount();

            showToast(isHost ? `Joined room "${roomName}" as HOST 👑` : `Joined room "${roomName}"`, 'success');

        } catch (err) {
            console.error('Failed to join room:', err);
            showToast(err.message || 'Failed to join video room.', 'error', 6000);
            // Restart preview if connection fails
            startLocalPreview();
        } finally {
            showLoading(false);
        }
    }

    /**
     * Setup Local Participant Video & UI Controls
     */
    function setupLocalUserUI(username, localParticipant) {
        elements.localUserName.textContent = username;
        elements.localAvatarInitials.textContent = getInitials(username);

        // Attach local video track
        localParticipant.videoTracks.forEach(publication => {
            if (publication.track) {
                publication.track.attach(elements.localVideo);
                elements.localVideo.style.display = 'block';
                elements.localVideoFallback.classList.add('hidden');
            }
        });

        // Append Host Badge if local user is host
        if (isHost) {
            const identityContainer = elements.localParticipantTile.querySelector('.user-identity');
            if (identityContainer && !identityContainer.querySelector('.badge-host')) {
                const hostBadge = document.createElement('span');
                hostBadge.className = 'badge-host';
                hostBadge.innerHTML = '<i class="fa-solid fa-crown"></i> HOST';
                identityContainer.appendChild(hostBadge);
            }
        }

        // Apply initial mic/cam preview choices if needed
        if (!isPreviewMicOn) {
            roomManager.toggleAudio();
            updateMicButtonUI(true);
        }
        if (!isPreviewCamOn) {
            roomManager.toggleVideo();
            updateCamButtonUI(true);
        }
    }

    /**
     * Remote Participant Joined
     */
    function handleRemoteParticipantJoined(participant) {
        showToast(`${participant.identity} joined the room.`, 'info');

        // Check if tile already exists
        if (document.getElementById(`tile-${participant.sid}`)) return;

        // Create Remote Participant Tile
        const tile = document.createElement('div');
        tile.id = `tile-${participant.sid}`;
        tile.className = 'participant-tile';

        const hostActionsHTML = isHost ? `
            <div class="host-tile-actions">
                <button type="button" class="host-action-btn host-mute-btn" data-sid="${participant.sid}" title="Mute Participant">
                    <i class="fa-solid fa-microphone-slash"></i>
                </button>
                <button type="button" class="host-action-btn host-kick-btn" data-sid="${participant.sid}" data-name="${escapeHtml(participant.identity)}" title="Kick Participant">
                    <i class="fa-solid fa-user-xmark"></i>
                </button>
            </div>
        ` : '';

        tile.innerHTML = `
            <div class="video-wrapper" id="wrapper-${participant.sid}">
                <div id="fallback-${participant.sid}" class="avatar-fallback">
                    <div class="avatar-circle">${getInitials(participant.identity)}</div>
                </div>
            </div>
            <div class="tile-bar">
                <div class="user-identity">
                    <span>${escapeHtml(participant.identity)}</span>
                    ${hostActionsHTML}
                </div>
                <div class="media-indicators">
                    <span id="mic-indicator-${participant.sid}" class="indicator mic-on">
                        <i class="fa-solid fa-microphone"></i>
                    </span>
                    <button type="button" class="indicator tile-fullscreen-btn" title="Toggle Tile Fullscreen">
                        <i class="fa-solid fa-expand"></i>
                    </button>
                </div>
            </div>
        `;

        elements.videoGrid.appendChild(tile);
        activeParticipants.set(participant.sid, tile);

        // Bind Host Action Buttons if present
        if (isHost) {
            const muteBtn = tile.querySelector('.host-mute-btn');
            const kickBtn = tile.querySelector('.host-kick-btn');
            if (muteBtn) muteBtn.addEventListener('click', () => handleHostMuteUser(participant.sid, participant.identity));
            if (kickBtn) kickBtn.addEventListener('click', () => handleHostKickUser(participant.sid, participant.identity));
        }

        updateParticipantCount();
        updateGridLayout();
    }

    /**
     * Remote Participant Left
     */
    function handleRemoteParticipantLeft(participant) {
        showToast(`${participant.identity} left the room.`, 'info');

        const tile = document.getElementById(`tile-${participant.sid}`);
        if (tile) {
            tile.remove();
            activeParticipants.delete(participant.sid);
            updateParticipantCount();
            updateGridLayout();
        }
    }

    /**
     * Remote Track Subscribed (Video / Audio attached)
     */
    function handleRemoteTrackSubscribed(track, participant) {
        const wrapper = document.getElementById(`wrapper-${participant.sid}`);
        const fallback = document.getElementById(`fallback-${participant.sid}`);

        if (track.kind === 'video') {
            const videoEl = track.attach();
            videoEl.id = `video-${track.sid}`;
            if (wrapper) {
                wrapper.appendChild(videoEl);
                if (fallback) fallback.classList.add('hidden');
            }
        } else if (track.kind === 'audio') {
            const audioEl = track.attach();
            audioEl.id = `audio-${track.sid}`;
            if (wrapper) wrapper.appendChild(audioEl);
        }
    }

    /**
     * Remote Track Unsubscribed (Removed)
     */
    function handleRemoteTrackUnsubscribed(track, participant) {
        const element = document.getElementById(`${track.kind}-${track.sid}`);
        if (element) {
            element.remove();
        }

        if (track.kind === 'video') {
            const fallback = document.getElementById(`fallback-${participant.sid}`);
            if (fallback) fallback.classList.remove('hidden');
        }
    }

    /**
     * Mute / Unmute Microphone Button Click
     */
    function handleToggleMic() {
        if (!roomManager) return;
        const isMuted = roomManager.toggleAudio();
        updateMicButtonUI(isMuted);
    }

    function updateMicButtonUI(isMuted) {
        elements.toggleMicBtn.classList.toggle('muted', isMuted);
        elements.toggleMicBtn.querySelector('i').className = isMuted ? 'fa-solid fa-microphone-slash' : 'fa-solid fa-microphone';
        elements.localAudioIndicator.className = `indicator ${isMuted ? 'mic-off' : 'mic-on'}`;
        elements.localAudioIndicator.querySelector('i').className = isMuted ? 'fa-solid fa-microphone-slash' : 'fa-solid fa-microphone';
    }

    /**
     * Toggle Camera On / Off Button Click
     */
    function handleToggleCam() {
        if (!roomManager) return;
        const isOff = roomManager.toggleVideo();
        updateCamButtonUI(isOff);
    }

    function updateCamButtonUI(isOff) {
        elements.toggleCamBtn.classList.toggle('off', isOff);
        elements.toggleCamBtn.querySelector('i').className = isOff ? 'fa-solid fa-video-slash' : 'fa-solid fa-video';
        elements.localVideoFallback.classList.toggle('hidden', !isOff);
    }

    /**
     * Copy Room Invite Link
     */
    function handleCopyInviteLink() {
        const roomName = elements.currentRoomName.textContent;
        const inviteUrl = `${window.location.origin}/?room=${encodeURIComponent(roomName)}`;

        navigator.clipboard.writeText(inviteUrl).then(() => {
            showToast('Room link copied to clipboard!', 'success');
        }).catch(() => {
            showToast(`Room Name: ${roomName}`, 'info');
        });
    }

    /**
     * Leave Video Room
     */
    function handleLeaveRoom() {
        if (roomManager) {
            roomManager.disconnect();
            roomManager = null;
        }

        cleanupCallUI();
        startLocalPreview();
        showToast('You left the room.', 'info');
    }

    /**
     * Room Disconnected Callback
     */
    function handleRoomDisconnected(error) {
        cleanupCallUI();
        startLocalPreview();
        if (error) {
            showToast(`Room disconnected: ${error.message}`, 'error');
        }
    }

    /**
     * Clean up Call UI & state
     */
    function cleanupCallUI() {
        stopCallTimer();
        elements.roomContainer.classList.add('hidden');
        elements.lobbyContainer.classList.remove('hidden');
        updateConnectionStatus(false, 'Disconnected');

        // Clear remote tiles from video grid
        activeParticipants.forEach((tile) => tile.remove());
        activeParticipants.clear();

        // Reset local video element
        elements.localVideo.srcObject = null;
        elements.localVideoFallback.classList.add('hidden');
        
        // Reset Phase 3 state
        stopSpeechRecognition();
        isCaptionsOn = false;
        elements.toggleCaptionsBtn.classList.remove('active');
        elements.captionOverlay.classList.add('hidden');
        
        isBackgroundBlurred = false;
        elements.toggleBlurBtn.classList.remove('active');
        elements.localVideo.classList.remove('video-blurred');
        elements.localPreviewVideo.classList.remove('video-blurred');

        // Reset control bar buttons
        updateMicButtonUI(false);
        updateCamButtonUI(false);

        updateGridLayout();
    }

    /**
     * Dynamic Grid Layout CSS Selector Update (Grid View vs Speaker View)
     */
    function updateGridLayout() {
        const count = activeParticipants.size + 1; // Remote + Local
        elements.videoGrid.className = 'video-grid';

        if (isSpeakerView) {
            elements.videoGrid.classList.add('speaker-mode');
            
            // Clean up sidebar if present
            let sidebar = elements.videoGrid.querySelector('.thumbnails-sidebar');
            if (!sidebar) {
                sidebar = document.createElement('div');
                sidebar.className = 'thumbnails-sidebar';
                elements.videoGrid.appendChild(sidebar);
            }

            // Determine spotlight tile
            let spotlightTile = null;
            if (currentSpotlightSid && document.getElementById(`tile-${currentSpotlightSid}`)) {
                spotlightTile = document.getElementById(`tile-${currentSpotlightSid}`);
            } else if (activeParticipants.size > 0) {
                spotlightTile = activeParticipants.values().next().value;
            } else {
                spotlightTile = elements.localParticipantTile;
            }

            // Move spotlight tile to main area and rest to sidebar
            const allTiles = [elements.localParticipantTile, ...Array.from(activeParticipants.values())];
            allTiles.forEach(tile => {
                tile.classList.remove('spotlight-tile');
                if (tile === spotlightTile) {
                    tile.classList.add('spotlight-tile');
                    elements.videoGrid.appendChild(tile);
                } else {
                    sidebar.appendChild(tile);
                }
            });

        } else {
            // Restore Grid Mode
            const sidebar = elements.videoGrid.querySelector('.thumbnails-sidebar');
            if (sidebar) {
                const childTiles = Array.from(sidebar.children);
                childTiles.forEach(tile => elements.videoGrid.appendChild(tile));
                sidebar.remove();
            }

            const allTiles = [elements.localParticipantTile, ...Array.from(activeParticipants.values())];
            allTiles.forEach(tile => tile.classList.remove('spotlight-tile'));

            if (count === 1) elements.videoGrid.classList.add('grid-1');
            else if (count === 2) elements.videoGrid.classList.add('grid-2');
            else if (count <= 4) elements.videoGrid.classList.add('grid-4');
            else if (count <= 6) elements.videoGrid.classList.add('grid-6');
            else if (count <= 9) elements.videoGrid.classList.add('grid-9');
            else elements.videoGrid.classList.add('grid-many');
        }
    }

    /**
     * Update Participant Counter Badge
     */
    function updateParticipantCount() {
        const count = activeParticipants.size + 1;
        elements.participantCount.textContent = `${count} ${count === 1 ? 'Participant' : 'Participants'}`;
    }

    /**
     * Call Timer Functions
     */
    function startCallTimer() {
        callStartTime = Date.now();
        elements.callTimer.textContent = '00:00';
        callTimerInterval = setInterval(() => {
            const elapsed = Math.floor((Date.now() - callStartTime) / 1000);
            const mins = String(Math.floor(elapsed / 60)).padStart(2, '0');
            const secs = String(elapsed % 60).padStart(2, '0');
            elements.callTimer.textContent = `${mins}:${secs}`;
        }, 1000);
    }

    function stopCallTimer() {
        if (callTimerInterval) {
            clearInterval(callTimerInterval);
            callTimerInterval = null;
        }
        elements.callTimer.textContent = '00:00';
    }

    /**
     * Update Connection Status Badge
     */
    function updateConnectionStatus(isConnected, text) {
        elements.connectionStatusBadge.className = `status-badge ${isConnected ? 'connected' : 'disconnected'}`;
        elements.statusText.textContent = text;
    }

    /**
     * Show Toast Notification Banner
     */
    function showToast(message, type = 'info', duration = 4000) {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        
        let iconClass = 'fa-circle-info';
        if (type === 'error') iconClass = 'fa-circle-exclamation';
        if (type === 'success') iconClass = 'fa-circle-check';

        toast.innerHTML = `
            <i class="fa-solid ${iconClass} toast-icon"></i>
            <div class="toast-content">
                <div class="toast-title">${type.toUpperCase()}</div>
                <div>${message}</div>
            </div>
        `;

        elements.toastContainer.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(20px)';
            toast.style.transition = 'all 0.3s ease-out';
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }

    /**
     * Toggle Global Loading Overlay
     */
    function showLoading(show, message = 'Loading...') {
        elements.loadingMessage.textContent = message;
        elements.loadingOverlay.classList.toggle('hidden', !show);
    }

    /**
     * Handle Screen Sharing Toggle
     */
    async function handleToggleScreenShare() {
        if (!roomManager) return;

        if (!isSharingScreen) {
            try {
                const screenTrack = await roomManager.startScreenShare();
                if (screenTrack) {
                    isSharingScreen = true;
                    elements.toggleScreenBtn.classList.add('btn-action');
                    showToast('Screen sharing started', 'success');
                }
            } catch (err) {
                showToast('Failed to start screen share.', 'error');
            }
        } else {
            roomManager.stopScreenShare();
            handleScreenShareEnded();
        }
    }

    function handleScreenShareEnded() {
        isSharingScreen = false;
        elements.toggleScreenBtn.classList.remove('btn-action');
        showToast('Screen sharing stopped', 'info');
    }

    /**
     * Toggle In-Call Chat Side Drawer
     */
    function toggleChatDrawer() {
        isChatOpen = !isChatOpen;
        elements.chatPanel.classList.toggle('hidden', !isChatOpen);
        elements.toggleChatBtn.classList.toggle('active', isChatOpen);

        if (isChatOpen) {
            unreadCount = 0;
            elements.unreadBadge.classList.add('hidden');
            elements.unreadBadge.textContent = '0';
            elements.chatInput.focus();
        }
    }

    /**
     * Handle Sending Chat Message
     */
    function handleSendChatMessage(e) {
        e.preventDefault();
        const text = elements.chatInput.value.trim();
        if (!text || !roomManager) return;

        const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        // Broadcast via WebRTC DataTrack
        roomManager.sendDataMessage({
            type: 'chat',
            text: text,
            sender: currentUsername,
            time: timeStr
        });

        // Append to local chat UI
        appendChatMessage(text, currentUsername, timeStr, true);
        elements.chatInput.value = '';
    }

    /**
     * Append message bubble to chat container
     */
    function appendChatMessage(text, sender, time, isSelf = false) {
        const msgBubble = document.createElement('div');
        msgBubble.className = `chat-msg-bubble ${isSelf ? 'chat-msg-self' : ''}`;
        msgBubble.innerHTML = `
            <span class="chat-msg-sender">${escapeHtml(sender)}</span>
            <span>${escapeHtml(text)}</span>
            <span class="chat-msg-time">${time}</span>
        `;
        elements.chatMessages.appendChild(msgBubble);
        elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
    }

    /**
     * Toggle Reactions Picker Menu
     */
    function toggleReactionsPicker() {
        elements.reactionsPicker.classList.toggle('hidden');
    }

    /**
     * Send Emoji Reaction
     */
    function sendEmojiReaction(emoji) {
        elements.reactionsPicker.classList.add('hidden');

        // Broadcast reaction to room participants if connected
        if (roomManager) {
            roomManager.sendDataMessage({
                type: 'reaction',
                emoji: emoji,
                sender: currentUsername || 'You'
            });
        }

        // Animate floating emoji on local tile
        showFloatingEmoji(emoji, elements.localParticipantTile);
    }

    /**
     * Handle Hand Raise Toggle
     */
    function handleToggleHandRaise() {
        if (!roomManager) return;

        isHandRaised = !isHandRaised;
        elements.handRaiseBtn.classList.toggle('hand-active', isHandRaised);

        // Update local tile UI
        updateHandRaisedUI(elements.localParticipantTile, isHandRaised, 'You');

        // Broadcast hand raise event
        roomManager.sendDataMessage({
            type: 'hand_raise',
            raised: isHandRaised,
            sender: currentUsername
        });

        showToast(isHandRaised ? 'Hand raised ✋' : 'Hand lowered', 'info', 2000);
    }

    /**
     * Handle Incoming WebRTC DataTrack Messages
     */
    function handleIncomingDataMessage(payload, participant) {
        const senderName = payload.sender || participant.identity;
        const mySid = roomManager && roomManager.room && roomManager.room.localParticipant ? roomManager.room.localParticipant.sid : null;

        if (payload.type === 'chat') {
            appendChatMessage(payload.text, senderName, payload.time || 'Now', false);

            if (!isChatOpen) {
                unreadCount++;
                elements.unreadBadge.textContent = unreadCount > 9 ? '9+' : unreadCount;
                elements.unreadBadge.classList.remove('hidden');
                showToast(`💬 New message from ${senderName}`, 'info', 3000);
            }
        } else if (payload.type === 'reaction') {
            const tile = document.getElementById(`tile-${participant.sid}`) || elements.localParticipantTile;
            showFloatingEmoji(payload.emoji, tile);
        } else if (payload.type === 'hand_raise') {
            const tile = document.getElementById(`tile-${participant.sid}`) || elements.localParticipantTile;
            updateHandRaisedUI(tile, payload.raised, senderName);
            if (payload.raised) {
                showToast(`✋ ${senderName} raised their hand!`, 'info', 4000);
            }
        } else if (payload.type === 'caption') {
            displayLiveCaption(senderName, payload.text);
        } else if (payload.type === 'host_mute_user') {
            if (payload.targetSid === mySid) {
                if (!roomManager.isAudioMuted) {
                    roomManager.toggleAudio();
                    updateMicButtonUI(true);
                    showToast('🔇 The host muted your microphone.', 'error', 5000);
                }
            }
        } else if (payload.type === 'host_mute_all') {
            if (!isHost && !roomManager.isAudioMuted) {
                roomManager.toggleAudio();
                updateMicButtonUI(true);
                showToast('🔇 The host muted all participants.', 'error', 5000);
            }
        } else if (payload.type === 'host_kick_user') {
            if (payload.targetSid === mySid) {
                showToast('🚪 You were removed from the room by the host.', 'error', 6000);
                setTimeout(() => {
                    handleLeaveRoom();
                }, 1000);
            }
        }
    }

    /**
     * Phase 3: Toggle AI Live Subtitles & Closed Captions
     */
    function toggleCaptions() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

        if (!SpeechRecognition) {
            showToast('Live captions not supported on this browser (supported on Chrome/Edge/Safari).', 'error', 5000);
            return;
        }

        isCaptionsOn = !isCaptionsOn;
        elements.toggleCaptionsBtn.classList.toggle('active', isCaptionsOn);

        if (isCaptionsOn) {
            startSpeechRecognition();
            showToast('AI Live Closed Captions ON', 'success');
        } else {
            stopSpeechRecognition();
            elements.captionOverlay.classList.add('hidden');
            showToast('Closed Captions OFF', 'info');
        }
    }

    /**
     * Start Web Speech API Recognition Engine
     */
    function startSpeechRecognition() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) return;

        speechRecognizer = new SpeechRecognition();
        speechRecognizer.continuous = true;
        speechRecognizer.interimResults = true;
        speechRecognizer.lang = 'en-US';

        speechRecognizer.onresult = (event) => {
            let interimTranscript = '';
            let finalTranscript = '';

            for (let i = event.resultIndex; i < event.results.length; i++) {
                const transcript = event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                    finalTranscript += transcript;
                } else {
                    interimTranscript += transcript;
                }
            }

            const currentText = finalTranscript || interimTranscript;
            if (currentText.trim()) {
                // Render locally
                displayLiveCaption(currentUsername || 'You', currentText);

                // Broadcast transcript to room via WebRTC DataTrack
                if (roomManager) {
                    roomManager.sendDataMessage({
                        type: 'caption',
                        text: currentText,
                        sender: currentUsername
                    });
                }
            }
        };

        speechRecognizer.onerror = (err) => {
            console.warn('Speech recognition error:', err);
        };

        speechRecognizer.onend = () => {
            // Auto restart if captions remain enabled
            if (isCaptionsOn) {
                try { speechRecognizer.start(); } catch (e) {}
            }
        };

        try {
            speechRecognizer.start();
        } catch (e) {
            console.warn('Speech recognition start failed:', e);
        }
    }

    /**
     * Stop Web Speech API Recognition Engine
     */
    function stopSpeechRecognition() {
        if (speechRecognizer) {
            try {
                speechRecognizer.stop();
            } catch (e) {}
            speechRecognizer = null;
        }
    }

    /**
     * Render Live Caption Overlay Banner
     */
    function displayLiveCaption(speakerName, text) {
        elements.captionSpeaker.textContent = `${speakerName}:`;
        elements.captionText.textContent = text;
        elements.captionOverlay.classList.remove('hidden');

        if (captionHideTimeout) clearTimeout(captionHideTimeout);
        captionHideTimeout = setTimeout(() => {
            elements.captionOverlay.classList.add('hidden');
        }, 4000);
    }

    /**
     * Phase 3: Toggle Camera Background Blur
     */
    function toggleBackgroundBlur() {
        isBackgroundBlurred = !isBackgroundBlurred;
        elements.toggleBlurBtn.classList.toggle('active', isBackgroundBlurred);

        elements.localVideo.classList.toggle('video-blurred', isBackgroundBlurred);
        elements.localPreviewVideo.classList.toggle('video-blurred', isBackgroundBlurred);

        showToast(isBackgroundBlurred ? 'AI Background Blur ON ✨' : 'Background Blur OFF', 'info');
    }

    /**
     * Phase 2: Toggle Speaker View vs Grid View
     */
    function toggleSpeakerView() {
        isSpeakerView = !isSpeakerView;
        elements.toggleViewBtn.classList.toggle('btn-primary', isSpeakerView);
        elements.viewModeLabel.textContent = isSpeakerView ? 'Grid View' : 'Speaker View';
        elements.toggleViewBtn.querySelector('i').className = isSpeakerView ? 'fa-solid fa-user-large' : 'fa-solid fa-border-all';
        updateGridLayout();
    }

    /**
     * Phase 2: Handle Dominant Speaker Changes
     */
    function handleDominantSpeakerChanged(participant) {
        // Remove active class from all tiles
        document.querySelectorAll('.participant-tile').forEach(tile => tile.classList.remove('dominant-speaker'));

        if (!participant) return;

        const speakerTile = document.getElementById(`tile-${participant.sid}`);
        if (speakerTile) {
            speakerTile.classList.add('dominant-speaker');
            currentSpotlightSid = participant.sid;
            if (isSpeakerView) {
                updateGridLayout();
            }
        }
    }

    /**
     * Phase 2 Host Moderation: Mute Remote User
     */
    function handleHostMuteUser(targetSid, targetName) {
        if (!isHost || !roomManager) return;
        roomManager.sendDataMessage({
            type: 'host_mute_user',
            targetSid: targetSid
        });
        showToast(`Sent mute request to ${targetName}.`, 'info', 2000);
    }

    /**
     * Phase 2 Host Moderation: Kick Remote User
     */
    function handleHostKickUser(targetSid, targetName) {
        if (!isHost || !roomManager) return;
        if (confirm(`Are you sure you want to remove ${targetName} from the room?`)) {
            roomManager.sendDataMessage({
                type: 'host_kick_user',
                targetSid: targetSid,
                targetName: targetName
            });
            showToast(`Removed ${targetName} from the room.`, 'info', 3000);
        }
    }

    /**
     * Phase 2 Host Moderation: Mute All Participants
     */
    function handleHostMuteAll() {
        if (!isHost || !roomManager) return;
        roomManager.sendDataMessage({
            type: 'host_mute_all'
        });
        showToast('Muted all participants in the room.', 'info', 3000);
    }

    /**
     * Animate Floating Emoji Over Participant Video Tile (Screen position calculation)
     */
    function showFloatingEmoji(emoji, tileElement) {
        const target = tileElement || elements.localParticipantTile || document.body;
        const rect = target.getBoundingClientRect();

        const emojiEl = document.createElement('div');
        emojiEl.className = 'floating-emoji';
        emojiEl.textContent = emoji;

        // Position emoji at tile center on screen
        const leftPos = rect.left + (rect.width / 2);
        const topPos = rect.top + (rect.height / 2);

        emojiEl.style.left = `${leftPos}px`;
        emojiEl.style.top = `${topPos}px`;

        document.body.appendChild(emojiEl);

        setTimeout(() => {
            emojiEl.remove();
        }, 2500);
    }

    /**
     * Update Hand Raised Badge on Participant Tile
     */
    function updateHandRaisedUI(tileElement, isRaised, name) {
        if (!tileElement) return;
        const identityContainer = tileElement.querySelector('.user-identity');
        if (!identityContainer) return;

        let badge = identityContainer.querySelector('.hand-raised-badge');
        if (isRaised) {
            if (!badge) {
                badge = document.createElement('span');
                badge.className = 'hand-raised-badge';
                badge.innerHTML = '<i class="fa-solid fa-hand"></i> ✋';
                identityContainer.appendChild(badge);
            }
        } else if (badge) {
            badge.remove();
        }
    }

    /**
     * Handle Global Room Fullscreen Toggle
     */
    function handleToggleFullscreen() {
        toggleElementFullscreen(elements.roomContainer);
    }

    /**
     * Toggle HTML5 Fullscreen for any target element (Room Container or Video Tile)
     */
    function toggleElementFullscreen(targetEl) {
        if (!targetEl) return;

        const fsElement = document.fullscreenElement || document.webkitFullscreenElement;

        if (!fsElement) {
            if (targetEl.requestFullscreen) {
                targetEl.requestFullscreen().catch(err => console.warn('Fullscreen denied:', err));
            } else if (targetEl.webkitRequestFullscreen) {
                targetEl.webkitRequestFullscreen();
            }
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen();
            }
        }
    }

    /**
     * Listen for Fullscreen State Change to Update Control Button Icons
     */
    function handleFullscreenChange() {
        const fsElement = document.fullscreenElement || document.webkitFullscreenElement;
        const icon = elements.toggleFullscreenBtn.querySelector('i');

        if (fsElement) {
            elements.toggleFullscreenBtn.classList.add('btn-primary');
            if (icon) icon.className = 'fa-solid fa-compress';
        } else {
            elements.toggleFullscreenBtn.classList.remove('btn-primary');
            if (icon) icon.className = 'fa-solid fa-expand';
        }
    }

    /**
     * Helper: Escape HTML strings to prevent XSS
     */
    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    /**
     * Helper: Extract initials from username
     */
    function getInitials(name) {
        if (!name) return 'U';
        const parts = name.trim().split(' ');
        if (parts.length >= 2) {
            return (parts[0][0] + parts[1][0]).toUpperCase();
        }
        return name.slice(0, 2).toUpperCase();
    }
});
