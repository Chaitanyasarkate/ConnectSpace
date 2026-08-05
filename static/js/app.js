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

        // Control Bar
        toggleMicBtn: document.getElementById('toggle-mic-btn'),
        toggleCamBtn: document.getElementById('toggle-cam-btn'),
        toggleScreenBtn: document.getElementById('toggle-screen-btn'),
        toggleChatBtn: document.getElementById('toggle-chat-btn'),
        unreadBadge: document.getElementById('unread-badge'),
        handRaiseBtn: document.getElementById('hand-raise-btn'),
        reactionsBtn: document.getElementById('reactions-btn'),
        reactionsPicker: document.getElementById('reactions-picker'),
        copyLinkBtn: document.getElementById('copy-link-btn'),
        leaveBtn: document.getElementById('leave-btn'),

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
    
    // Reaction Emoji Buttons
    document.querySelectorAll('.reaction-emoji-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const emoji = e.target.getAttribute('data-emoji');
            sendEmojiReaction(emoji);
        });
    });

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
                onDisconnected: handleRoomDisconnected
            });

            // 1. Fetch JWT Token from Flask API
            const tokenData = await roomManager.fetchToken(username, roomName);

            // 2. Connect to Twilio Room
            const room = await roomManager.connectRoom(tokenData.token, roomName);

            // 3. Setup Local Participant UI
            setupLocalUserUI(username, room.localParticipant);

            // 4. Transition Views
            elements.lobbyContainer.classList.add('hidden');
            elements.roomContainer.classList.remove('hidden');
            elements.currentRoomName.textContent = roomName;
            
            updateConnectionStatus(true, `Connected to ${roomName}`);
            startCallTimer();
            updateParticipantCount();

            showToast(`Joined room "${roomName}" successfully!`, 'success');

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
            }
        });

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

        tile.innerHTML = `
            <div class="video-wrapper" id="wrapper-${participant.sid}">
                <div id="fallback-${participant.sid}" class="avatar-fallback">
                    <div class="avatar-circle">${getInitials(participant.identity)}</div>
                </div>
            </div>
            <div class="tile-bar">
                <div class="user-identity">
                    <span>${participant.identity}</span>
                </div>
                <div class="media-indicators">
                    <span id="mic-indicator-${participant.sid}" class="indicator mic-on">
                        <i class="fa-solid fa-microphone"></i>
                    </span>
                </div>
            </div>
        `;

        elements.videoGrid.appendChild(tile);
        activeParticipants.set(participant.sid, tile);
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
        
        // Reset control bar buttons
        updateMicButtonUI(false);
        updateCamButtonUI(false);

        updateGridLayout();
    }

    /**
     * Dynamic Grid Layout CSS Selector Update
     */
    function updateGridLayout() {
        const count = activeParticipants.size + 1; // Remote + Local
        elements.videoGrid.className = 'video-grid';

        if (count === 1) elements.videoGrid.classList.add('grid-1');
        else if (count === 2) elements.videoGrid.classList.add('grid-2');
        else if (count <= 4) elements.videoGrid.classList.add('grid-4');
        else if (count <= 6) elements.videoGrid.classList.add('grid-6');
        else if (count <= 9) elements.videoGrid.classList.add('grid-9');
        else elements.videoGrid.classList.add('grid-many');
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
        if (!roomManager) return;
        elements.reactionsPicker.classList.add('hidden');

        // Broadcast reaction to room participants
        roomManager.sendDataMessage({
            type: 'reaction',
            emoji: emoji,
            sender: currentUsername
        });

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
        }
    }

    /**
     * Animate Floating Emoji Over Participant Video Tile
     */
    function showFloatingEmoji(emoji, tileElement) {
        if (!tileElement) return;

        const emojiEl = document.createElement('div');
        emojiEl.className = 'floating-emoji';
        emojiEl.textContent = emoji;

        tileElement.appendChild(emojiEl);

        setTimeout(() => {
            emojiEl.remove();
        }, 2200);
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
