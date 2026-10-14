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
        chatRecipientSelect: document.getElementById('chat-recipient-select'),
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
    if (elements.chatRecipientSelect) {
        elements.chatRecipientSelect.addEventListener('change', updateChatInputPlaceholder);
    }
    elements.handRaiseBtn.addEventListener('click', handleToggleHandRaise);
    elements.reactionsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleReactionsPicker(e);
    });

    // Phase 2 Listeners
    elements.toggleViewBtn.addEventListener('click', toggleSpeakerView);
    elements.muteAllBtn.addEventListener('click', handleHostMuteAll);

    // Phase 3 Listeners
    elements.toggleCaptionsBtn.addEventListener('click', toggleCaptions);
    elements.toggleBlurBtn.addEventListener('click', toggleBackgroundBlur);

    // Reaction Emoji Event Delegation & Direct Binding
    window.sendEmojiReaction = function(emoji, event) {
        if (event) {
            if (event.preventDefault) event.preventDefault();
            if (event.stopPropagation) event.stopPropagation();
        }
        sendEmojiReaction(emoji);
    };

    if (elements.reactionsPicker) {
        elements.reactionsPicker.addEventListener('click', (e) => {
            e.stopPropagation();
            const btn = e.target.closest('.reaction-emoji-btn');
            if (btn) {
                const emoji = btn.getAttribute('data-emoji') || btn.dataset.emoji || btn.textContent.trim();
                if (emoji) {
                    sendEmojiReaction(emoji);
                }
            }
        });

        elements.reactionsPicker.querySelectorAll('.reaction-emoji-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const emoji = btn.getAttribute('data-emoji') || btn.dataset.emoji || btn.textContent.trim();
                if (emoji) sendEmojiReaction(emoji);
            });
            btn.addEventListener('pointerdown', (e) => {
                e.stopPropagation();
            });
        });
    }

    // Close reactions picker when clicking outside
    document.addEventListener('click', (e) => {
        if (!elements.reactionsPicker.classList.contains('hidden')) {
            if (!elements.reactionsPicker.contains(e.target) && !elements.reactionsBtn.contains(e.target)) {
                elements.reactionsPicker.classList.add('hidden');
            }
        }
    });

    // Fullscreen Listeners
    if (elements.toggleFullscreenBtn) {
        elements.toggleFullscreenBtn.addEventListener('click', toggleAppFullscreen);
    }
    
    // Bind Local Tile Fullscreen Button
    const localFullscreenBtn = elements.localParticipantTile.querySelector('.tile-fullscreen-btn');
    if (localFullscreenBtn) {
        localFullscreenBtn.addEventListener('click', () => toggleTileFullscreen(elements.localParticipantTile));
    }

    // Sync fullscreen button icon on native ESC key or change
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
                    <button type="button" class="icon-btn-sm whisper-tile-btn" data-sid="${participant.sid}" data-name="${escapeHtml(participant.identity)}" title="Whisper Privately to ${escapeHtml(participant.identity)}">
                        <i class="fa-solid fa-lock"></i>
                    </button>
                    <button type="button" class="icon-btn-sm tile-fullscreen-btn" title="Expand Fullscreen">
                        <i class="fa-solid fa-expand"></i>
                    </button>
                    <span id="mic-indicator-${participant.sid}" class="indicator mic-on">
                        <i class="fa-solid fa-microphone"></i>
                    </span>
                </div>
            </div>
        `;

        elements.videoGrid.appendChild(tile);
        activeParticipants.set(participant.sid, tile);

        // Bind Whisper Button
        const whisperBtn = tile.querySelector('.whisper-tile-btn');
        if (whisperBtn) {
            whisperBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                startPrivateWhisper(participant.sid, participant.identity);
            });
        }

        // Bind Fullscreen Button
        const fsBtn = tile.querySelector('.tile-fullscreen-btn');
        if (fsBtn) {
            fsBtn.addEventListener('click', () => toggleTileFullscreen(tile));
        }

        // Bind Host Action Buttons if present
        if (isHost) {
            const muteBtn = tile.querySelector('.host-mute-btn');
            const kickBtn = tile.querySelector('.host-kick-btn');
            if (muteBtn) muteBtn.addEventListener('click', () => handleHostMuteUser(participant.sid, participant.identity));
            if (kickBtn) kickBtn.addEventListener('click', () => handleHostKickUser(participant.sid, participant.identity));
        }

        updateParticipantCount();
        updateGridLayout();
        updateChatRecipients();
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
            updateChatRecipients();
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

        // Reset Chat Recipient Selection
        if (elements.chatRecipientSelect) {
            elements.chatRecipientSelect.innerHTML = '<option value="everyone">🌐 Everyone (Public)</option>';
            updateChatInputPlaceholder();
        }
        elements.unreadBadge.classList.remove('badge-whisper');

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
            elements.unreadBadge.classList.remove('badge-whisper');
            elements.unreadBadge.textContent = '0';
            updateChatRecipients();
            elements.chatInput.focus();
        }
    }

    /**
     * Update recipient dropdown with current remote participants
     */
    function updateChatRecipients() {
        if (!elements.chatRecipientSelect) return;
        const currentVal = elements.chatRecipientSelect.value;
        
        elements.chatRecipientSelect.innerHTML = '<option value="everyone">🌐 Everyone (Public)</option>';

        if (roomManager && roomManager.room && roomManager.room.participants) {
            roomManager.room.participants.forEach((participant) => {
                const opt = document.createElement('option');
                opt.value = participant.sid;
                opt.textContent = `🔒 ${participant.identity} (Private)`;
                opt.setAttribute('data-name', participant.identity);
                elements.chatRecipientSelect.appendChild(opt);
            });
        }

        // Keep selection if participant is still in room, else default to 'everyone'
        const matching = elements.chatRecipientSelect.querySelector(`option[value="${currentVal}"]`);
        if (matching) {
            elements.chatRecipientSelect.value = currentVal;
        } else {
            elements.chatRecipientSelect.value = 'everyone';
        }

        updateChatInputPlaceholder();
    }

    /**
     * Update chat input placeholder and styling based on selected recipient
     */
    function updateChatInputPlaceholder() {
        if (!elements.chatRecipientSelect || !elements.chatInput) return;
        const val = elements.chatRecipientSelect.value;

        if (val === 'everyone') {
            elements.chatRecipientSelect.classList.remove('whisper-active');
            if (elements.chatForm) elements.chatForm.classList.remove('whisper-mode');
            elements.chatInput.placeholder = 'Type a message to Everyone...';
        } else {
            elements.chatRecipientSelect.classList.add('whisper-active');
            if (elements.chatForm) elements.chatForm.classList.add('whisper-mode');
            const selectedOpt = elements.chatRecipientSelect.options[elements.chatRecipientSelect.selectedIndex];
            const targetName = selectedOpt ? (selectedOpt.getAttribute('data-name') || selectedOpt.textContent.replace(/^🔒\s*/, '').replace(/\s*\(Private\)$/, '')) : 'User';
            elements.chatInput.placeholder = `🔒 Whisper privately to ${targetName}...`;
        }
    }

    /**
     * Start a 1-on-1 private whisper session with a specific participant
     */
    function startPrivateWhisper(participantSid, participantName) {
        if (!isChatOpen) {
            toggleChatDrawer();
        }
        updateChatRecipients();
        if (elements.chatRecipientSelect) {
            elements.chatRecipientSelect.value = participantSid;
            updateChatInputPlaceholder();
        }
        if (elements.chatInput) {
            elements.chatInput.focus();
        }
        showToast(`🔒 Whisper mode enabled with ${participantName}`, 'info', 2500);
    }

    /**
     * Handle Sending Chat Message (Supports both public broadcast and private whispers)
     */
    function handleSendChatMessage(e) {
        e.preventDefault();
        const text = elements.chatInput.value.trim();
        if (!text || !roomManager) return;

        const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const recipientSid = elements.chatRecipientSelect ? elements.chatRecipientSelect.value : 'everyone';

        if (recipientSid && recipientSid !== 'everyone') {
            const selectedOpt = elements.chatRecipientSelect.options[elements.chatRecipientSelect.selectedIndex];
            const targetName = selectedOpt ? (selectedOpt.getAttribute('data-name') || selectedOpt.textContent.replace(/^🔒\s*/, '').replace(/\s*\(Private\)$/, '')) : 'User';

            // Send private whisper payload via WebRTC DataTrack
            roomManager.sendDataMessage({
                type: 'whisper',
                text: text,
                sender: currentUsername,
                time: timeStr,
                targetSid: recipientSid,
                targetName: targetName
            });

            // Append to local chat UI with whisper styling
            appendChatMessage(text, currentUsername, timeStr, true, true, targetName);
        } else {
            // Broadcast public chat via WebRTC DataTrack
            roomManager.sendDataMessage({
                type: 'chat',
                text: text,
                sender: currentUsername,
                time: timeStr
            });

            // Append to local chat UI
            appendChatMessage(text, currentUsername, timeStr, true, false);
        }

        elements.chatInput.value = '';
    }

    /**
     * Append message bubble to chat container
     */
    function appendChatMessage(text, sender, time, isSelf = false, isWhisper = false, whisperTargetName = '') {
        const msgBubble = document.createElement('div');
        msgBubble.className = `chat-msg-bubble ${isSelf ? 'chat-msg-self' : ''} ${isWhisper ? 'chat-msg-whisper' : ''}`;
        
        let whisperTagHtml = '';
        if (isWhisper) {
            if (isSelf) {
                whisperTagHtml = `<div class="chat-whisper-tag"><i class="fa-solid fa-lock"></i> Whisper to ${escapeHtml(whisperTargetName || 'User')}</div>`;
            } else {
                whisperTagHtml = `<div class="chat-whisper-tag"><i class="fa-solid fa-lock"></i> Whisper from ${escapeHtml(sender)}</div>`;
            }
        }

        msgBubble.innerHTML = `
            ${whisperTagHtml}
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
    function toggleReactionsPicker(e) {
        if (e) e.stopPropagation();
        elements.reactionsPicker.classList.toggle('hidden');
    }

    /**
     * Send Emoji Reaction
     */
    function sendEmojiReaction(emoji) {
        if (!emoji) return;

        // Immediately close reactions picker
        if (elements.reactionsPicker) {
            elements.reactionsPicker.classList.add('hidden');
        }

        // 1. Animate celebratory floating emoji burst from the React button / bottom area
        try {
            triggerEmojiStream(emoji, elements.reactionsBtn || elements.localParticipantTile);
        } catch (streamErr) {
            console.warn('Emoji stream error:', streamErr);
        }

        // 2. Show animated reaction badge on local video tile
        try {
            showTileReactionBadge(elements.localParticipantTile, emoji);
        } catch (badgeErr) {
            console.warn('Tile badge error:', badgeErr);
        }

        // 3. Feedback toast confirmation
        try {
            showToast(`Reacted with ${emoji}`, 'info', 1800);
        } catch (toastErr) {
            console.warn('Toast error:', toastErr);
        }

        // 4. Broadcast reaction to room participants if connected
        try {
            if (roomManager && typeof roomManager.sendDataMessage === 'function') {
                roomManager.sendDataMessage({
                    type: 'reaction',
                    emoji: emoji,
                    sender: currentUsername || 'You'
                });
            }
        } catch (err) {
            console.warn('Could not broadcast emoji reaction:', err);
        }
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
            appendChatMessage(payload.text, senderName, payload.time || 'Now', false, false);

            if (!isChatOpen) {
                unreadCount++;
                elements.unreadBadge.textContent = unreadCount > 9 ? '9+' : unreadCount;
                elements.unreadBadge.classList.remove('hidden');
                showToast(`💬 New message from ${senderName}`, 'info', 3000);
            }
        } else if (payload.type === 'whisper') {
            // Only process whisper if this client is the designated target
            if (mySid && payload.targetSid === mySid) {
                appendChatMessage(payload.text, senderName, payload.time || 'Now', false, true);

                if (!isChatOpen) {
                    unreadCount++;
                    elements.unreadBadge.textContent = unreadCount > 9 ? '9+' : unreadCount;
                    elements.unreadBadge.classList.add('badge-whisper');
                    elements.unreadBadge.classList.remove('hidden');
                    showToast(`🔒 Private whisper from ${senderName}: ${payload.text.substring(0, 35)}...`, 'info', 4500);
                } else {
                    showToast(`🔒 Private whisper from ${senderName}`, 'info', 2500);
                }
            }
            // If targetSid !== mySid, silently drop (privacy guarantee)
        } else if (payload.type === 'reaction') {
            const remoteTile = (participant && participant.sid) ? document.getElementById(`tile-${participant.sid}`) : null;
            const targetTile = remoteTile || elements.localParticipantTile;
            showFloatingEmoji(payload.emoji, targetTile);
            showToast(`${senderName} reacted with ${payload.emoji}`, 'info', 2500);
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
     * Fullscreen Mode Handler for Entire App / Meeting View
     */
    function toggleAppFullscreen() {
        const fsElement = document.fullscreenElement || document.webkitFullscreenElement;
        const targetContainer = elements.roomContainer || document.documentElement;

        if (!fsElement) {
            if (targetContainer.requestFullscreen) {
                targetContainer.requestFullscreen();
            } else if (targetContainer.webkitRequestFullscreen) {
                targetContainer.webkitRequestFullscreen();
            }
            showToast('Entered Fullscreen Mode', 'info', 2000);
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen();
            }
        }
    }

    /**
     * Fullscreen Mode Handler for Individual Participant Video Tile
     */
    function toggleTileFullscreen(tileElement) {
        if (!tileElement) return;
        const fsElement = document.fullscreenElement || document.webkitFullscreenElement;

        if (!fsElement) {
            if (tileElement.requestFullscreen) {
                tileElement.requestFullscreen();
            } else if (tileElement.webkitRequestFullscreen) {
                tileElement.webkitRequestFullscreen();
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
     * Sync Fullscreen Icons when entering or exiting Fullscreen mode
     */
    function handleFullscreenChange() {
        const fsElement = document.fullscreenElement || document.webkitFullscreenElement;
        const isFS = Boolean(fsElement);

        if (elements.toggleFullscreenBtn) {
            elements.toggleFullscreenBtn.classList.toggle('active', isFS);
            elements.toggleFullscreenBtn.querySelector('i').className = isFS ? 'fa-solid fa-compress' : 'fa-solid fa-expand';
            elements.toggleFullscreenBtn.querySelector('.btn-label').textContent = isFS ? 'Exit Full' : 'Full Screen';
        }

        document.querySelectorAll('.tile-fullscreen-btn i').forEach(icon => {
            icon.className = isFS ? 'fa-solid fa-compress' : 'fa-solid fa-expand';
        });
    }

    /**
     * Trigger a burst of floating emojis streaming upwards
     * @param {string} emoji - Emoji character to display
     * @param {HTMLElement} [anchorElement] - Element to spawn emojis from (defaults to reactionsBtn or screen bottom center)
     */
    function triggerEmojiStream(emoji, anchorElement) {
        if (!emoji) return;

        let originX = window.innerWidth / 2;
        let originY = window.innerHeight - 120;

        if (anchorElement && typeof anchorElement.getBoundingClientRect === 'function') {
            const rect = anchorElement.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
                originX = rect.left + (rect.width / 2);
                originY = rect.top;
            }
        }

        // Spawn a burst of 5 floating emojis with organic horizontal drift and staggered timings
        const burstCount = 5;
        for (let i = 0; i < burstCount; i++) {
            setTimeout(() => {
                const emojiEl = document.createElement('div');
                emojiEl.className = 'floating-emoji';
                emojiEl.textContent = emoji;

                // Organic horizontal drift between -45px and +45px
                const driftX = (Math.random() - 0.5) * 90;
                // Random animation duration between 1.8s and 2.3s
                const duration = (1.8 + Math.random() * 0.5).toFixed(2);
                // Slight initial scale variation
                const scale = (0.9 + Math.random() * 0.35).toFixed(2);

                emojiEl.style.left = `${originX}px`;
                emojiEl.style.top = `${originY}px`;
                emojiEl.style.setProperty('--drift-x', `${driftX}px`);
                emojiEl.style.setProperty('--duration', `${duration}s`);
                emojiEl.style.fontSize = `${(2.6 * scale).toFixed(2)}rem`;

                document.body.appendChild(emojiEl);

                setTimeout(() => {
                    emojiEl.remove();
                }, parseFloat(duration) * 1000 + 100);
            }, i * 75);
        }
    }

    /**
     * Show a temporary animated reaction badge on a participant's tile
     */
    function showTileReactionBadge(tileElement, emoji) {
        if (!tileElement || !emoji) return;
        const identityContainer = tileElement.querySelector('.user-identity');
        if (!identityContainer) return;

        // Remove any existing reaction badge
        const existing = identityContainer.querySelector('.reaction-tile-badge');
        if (existing) existing.remove();

        const badge = document.createElement('span');
        badge.className = 'reaction-tile-badge';
        badge.textContent = emoji;
        badge.title = `Reacted with ${emoji}`;
        identityContainer.appendChild(badge);

        // Auto remove badge after 3 seconds with smooth fade
        setTimeout(() => {
            badge.classList.add('badge-fade-out');
            setTimeout(() => badge.remove(), 300);
        }, 3000);
    }

    /**
     * Animate Floating Emoji Over Participant Video Tile (Screen position calculation)
     */
    function showFloatingEmoji(emoji, tileElement) {
        triggerEmojiStream(emoji, tileElement);
        showTileReactionBadge(tileElement, emoji);
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
