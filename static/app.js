/**
 * VISIONMEET - ENTERPRISE TWILIO PROGRAMMABLE VIDEO ENGINE
 * Features:
 * - Local Audio & Video Track hardware controls & Background Blur
 * - Screen Sharing (getDisplayMedia)
 * - Twilio LocalDataTrack Real-time Messaging (Chat, File Sharing, Typing Indicators)
 * - Animated Emoji Reactions & Raise Hand Signaling
 * - Recording Toggle & Call Duration Timer
 * - Picture in Picture (PiP)
 * - Admin Controls (Host Mute All & Mute Individual)
 * - Unread Message Badges & Notification Toasts
 * - Memory leak prevention & Track Detachment Auto Cleanup
 */

document.addEventListener("DOMContentLoaded", () => {
    // ==========================================================================
    // 1. GLOBAL STATE & REGISTRIES
    // ==========================================================================

    let localAudioTrack = null;
    let localVideoTrack = null;
    let localDataTrack = null;
    let screenTrack = null;
    let activeRoom = null;
    
    // Registry of active participants: Map<sid, { participant, cardElement, tracks: Set<Track> }>
    const participantRegistry = new Map();

    let isMicMuted = false;
    let isCamDisabled = false;
    let isBlurEnabled = false;
    let isScreenSharing = false;
    let isHandRaised = false;
    let isRecording = false;
    let isHost = false;

    let callTimerInterval = null;
    let recTimerInterval = null;
    let callSeconds = 0;
    let recSeconds = 0;
    let unreadCount = 0;
    let typingTimeout = null;

    // ==========================================================================
    // 2. DOM ELEMENT REFERENCES
    // ==========================================================================

    const toastContainer = document.getElementById("toastContainer");
    const reactionCanvas = document.getElementById("reactionCanvas");
    const statusBadge = document.getElementById("statusBadge");
    const statusText = document.getElementById("statusText");
    const recordingBadge = document.getElementById("recordingBadge");
    const recTimer = document.getElementById("recTimer");
    const onlineCounter = document.getElementById("onlineCounter");
    const onlineCountText = document.getElementById("onlineCountText");

    // Lobby Elements
    const lobbyContainer = document.getElementById("lobbyContainer");
    const previewVideo = document.getElementById("previewVideo");
    const previewAvatar = document.getElementById("previewAvatar");
    const previewAvatarInitials = document.getElementById("previewAvatarInitials");
    const previewMicBtn = document.getElementById("previewMicBtn");
    const previewCamBtn = document.getElementById("previewCamBtn");
    const previewBlurBtn = document.getElementById("previewBlurBtn");
    const joinForm = document.getElementById("joinForm");
    const usernameInput = document.getElementById("usernameInput");
    const roomInput = document.getElementById("roomInput");
    const passwordInput = document.getElementById("passwordInput");
    const isHostCheckbox = document.getElementById("isHostCheckbox");
    const roomPresets = document.getElementById("roomPresets");
    const joinBtn = document.getElementById("joinBtn");
    const joinSpinner = document.getElementById("joinSpinner");

    // Active Meeting Elements
    const roomContainer = document.getElementById("roomContainer");
    const currentRoomName = document.getElementById("currentRoomName");
    const callTimer = document.getElementById("callTimer");
    const participantCountText = document.getElementById("participantCountText");
    const participantGrid = document.getElementById("participantGrid");

    // Side Drawer Elements
    const sideDrawer = document.getElementById("sideDrawer");
    const tabChatBtn = document.getElementById("tabChatBtn");
    const tabParticipantsBtn = document.getElementById("tabParticipantsBtn");
    const closeDrawerBtn = document.getElementById("closeDrawerBtn");
    const chatTabContent = document.getElementById("chatTabContent");
    const participantsTabContent = document.getElementById("participantsTabContent");
    const chatFeed = document.getElementById("chatFeed");
    const typingIndicator = document.getElementById("typingIndicator");
    const typingUserText = document.getElementById("typingUserText");
    const chatForm = document.getElementById("chatForm");
    const messageInput = document.getElementById("messageInput");
    const fileInput = document.getElementById("fileInput");
    const attachFileBtn = document.getElementById("attachFileBtn");
    const adminControlsPanel = document.getElementById("adminControlsPanel");
    const muteAllBtn = document.getElementById("muteAllBtn");
    const drawerParticipantCount = document.getElementById("drawerParticipantCount");
    const participantsList = document.getElementById("participantsList");

    // Floating Dock Elements
    const micBtn = document.getElementById("micBtn");
    const camBtn = document.getElementById("camBtn");
    const blurBtn = document.getElementById("blurBtn");
    const screenShareBtn = document.getElementById("screenShareBtn");
    const handRaiseBtn = document.getElementById("handRaiseBtn");
    const emojiBtn = document.getElementById("emojiBtn");
    const emojiBar = document.getElementById("emojiBar");
    const recordBtn = document.getElementById("recordBtn");
    const pipBtn = document.getElementById("pipBtn");
    const shareBtn = document.getElementById("shareBtn");
    const chatToggleBtn = document.getElementById("chatToggleBtn");
    const unreadBadge = document.getElementById("unreadBadge");
    const leaveBtn = document.getElementById("leaveBtn");

    // ==========================================================================
    // 3. TOAST NOTIFICATIONS & EMOJI ANIMATIONS
    // ==========================================================================

    function showToast(message, type = "info", duration = 4000) {
        if (!toastContainer) return;
        const toast = document.createElement("div");
        toast.className = `toast toast-${type}`;
        const icons = { info: "fa-circle-info", success: "fa-circle-check", warning: "fa-triangle-exclamation", error: "fa-circle-xmark" };
        toast.innerHTML = `<i class="fa-solid ${icons[type] || icons.info}"></i><span>${escapeHTML(message)}</span>`;
        toastContainer.appendChild(toast);
        setTimeout(() => {
            toast.classList.add("toast-out");
            toast.addEventListener("animationend", () => toast.remove());
        }, duration);
    }

    function spawnFloatingEmoji(emoji) {
        if (!reactionCanvas) return;
        const el = document.createElement("div");
        el.className = "floating-emoji";
        el.textContent = emoji;
        el.style.left = `${Math.floor(Math.random() * 80) + 10}%`;
        reactionCanvas.appendChild(el);
        setTimeout(() => el.remove(), 3000);
    }

    function escapeHTML(str) {
        const div = document.createElement("div");
        div.textContent = str || "";
        return div.innerHTML;
    }

    function getInitials(name) {
        if (!name || typeof name !== "string") return "VM";
        const clean = name.trim();
        if (!clean) return "VM";
        const parts = clean.split(/\s+/);
        if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
        return clean.slice(0, 2).toUpperCase();
    }

    // ==========================================================================
    // 4. LOCAL MEDIA TRACKS & PREVIEW INITIALIZATION
    // ==========================================================================

    async function initLocalPreview() {
        try {
            if (typeof Twilio === "undefined" || !Twilio.Video) {
                showToast("Twilio Video SDK failed to load.", "error");
                return;
            }

            // Create Local DataTrack for real-time chat & signals
            localDataTrack = new Twilio.Video.LocalDataTrack();

            try {
                localVideoTrack = await Twilio.Video.createLocalVideoTrack({ width: { ideal: 1280 }, height: { ideal: 720 } });
            } catch (vErr) {
                console.warn("Camera fallback:", vErr);
                showToast("Camera device unavailable.", "warning");
            }

            try {
                localAudioTrack = await Twilio.Video.createLocalAudioTrack({ echoCancellation: true, noiseSuppression: true });
            } catch (aErr) {
                console.warn("Mic fallback:", aErr);
                showToast("Microphone device unavailable.", "warning");
            }

            if (localVideoTrack && previewVideo) {
                localVideoTrack.attach(previewVideo);
                hidePreviewAvatar();
            } else {
                showPreviewAvatar(usernameInput ? usernameInput.value : "User");
            }

            showToast("Camera & Microphone ready.", "success");
        } catch (err) {
            console.error("Local media init error:", err);
            showPreviewAvatar(usernameInput ? usernameInput.value : "User");
        }
    }

    function showPreviewAvatar(name) {
        if (previewAvatar && previewAvatarInitials) {
            previewAvatarInitials.textContent = getInitials(name);
            previewAvatar.classList.remove("hidden");
        }
    }

    function hidePreviewAvatar() {
        if (previewAvatar) previewAvatar.classList.add("hidden");
    }

    // Preview Mic / Cam / Blur Buttons
    if (previewMicBtn) {
        previewMicBtn.addEventListener("click", () => {
            isMicMuted = !isMicMuted;
            if (localAudioTrack) {
                if (isMicMuted) {
                    localAudioTrack.disable();
                    previewMicBtn.classList.add("btn-off");
                    previewMicBtn.innerHTML = `<i class="fa-solid fa-microphone-slash"></i>`;
                } else {
                    localAudioTrack.enable();
                    previewMicBtn.classList.remove("btn-off");
                    previewMicBtn.innerHTML = `<i class="fa-solid fa-microphone"></i>`;
                }
            }
        });
    }

    if (previewCamBtn) {
        previewCamBtn.addEventListener("click", () => {
            isCamDisabled = !isCamDisabled;
            if (localVideoTrack) {
                if (isCamDisabled) {
                    localVideoTrack.disable();
                    previewCamBtn.classList.add("btn-off");
                    previewCamBtn.innerHTML = `<i class="fa-solid fa-video-slash"></i>`;
                    showPreviewAvatar(usernameInput.value);
                } else {
                    localVideoTrack.enable();
                    previewCamBtn.classList.remove("btn-off");
                    previewCamBtn.innerHTML = `<i class="fa-solid fa-video"></i>`;
                    hidePreviewAvatar();
                }
            }
        });
    }

    if (previewBlurBtn) {
        previewBlurBtn.addEventListener("click", () => {
            isBlurEnabled = !isBlurEnabled;
            if (previewVideo) previewVideo.classList.toggle("blurred", isBlurEnabled);
            previewBlurBtn.classList.toggle("btn-active", isBlurEnabled);
            showToast(isBlurEnabled ? "Background blur preview enabled" : "Background blur disabled", "info");
        });
    }

    if (roomPresets) {
        roomPresets.addEventListener("click", (e) => {
            const chip = e.target.closest(".preset-chip");
            if (chip) {
                document.querySelectorAll(".preset-chip").forEach((c) => c.classList.remove("active"));
                chip.classList.add("active");
                roomInput.value = chip.getAttribute("data-room");
            }
        });
    }

    initLocalPreview();

    // ==========================================================================
    // 5. JOIN ROOM & AUTHENTICATION
    // ==========================================================================

    joinForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        const username = usernameInput.value.trim();
        const roomName = roomInput.value.trim() || "general-room";
        const password = passwordInput ? passwordInput.value.trim() : "";
        isHost = isHostCheckbox ? isHostCheckbox.checked : false;

        if (!username) {
            showToast("Please enter a display name.", "warning");
            return;
        }

        setJoinLoading(true);
        updateStatus("connecting", "Authenticating token...");

        try {
            // 1. Fetch Token from Flask API
            const res = await fetch("/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username, room: roomName, password, is_host: isHost })
            });

            const data = await res.json();
            if (!res.ok || !data.success) {
                throw new Error(data.error || data.message || "Authentication failed.");
            }

            const token = data.data.token;
            updateStatus("connecting", `Joining room: ${roomName}...`);

            // 2. Prepare tracks to publish
            const tracksToPublish = [];
            if (localAudioTrack) tracksToPublish.push(localAudioTrack);
            if (localVideoTrack) tracksToPublish.push(localVideoTrack);
            if (localDataTrack) tracksToPublish.push(localDataTrack);

            // 3. Connect to Twilio Video Room
            const room = await Twilio.Video.connect(token, {
                name: roomName,
                tracks: tracksToPublish,
                dominantSpeaker: true,
                networkQuality: { local: 1, remote: 1 }
            });

            setupRoom(room, username);
        } catch (err) {
            console.error("Room Join Error:", err);
            showToast(err.message || "Failed to join video room.", "error");
            updateStatus("disconnected", "Disconnected");
            setJoinLoading(false);
        }
    });

    function setJoinLoading(loading) {
        if (!joinBtn) return;
        joinBtn.disabled = loading;
        if (joinSpinner) joinSpinner.classList.toggle("hidden", !loading);
        joinBtn.querySelector(".btn-text").textContent = loading ? "Connecting..." : "Enter Meeting";
    }

    // ==========================================================================
    // 6. ROOM LIFECYCLE & DATATRACK SIGNALING
    // ==========================================================================

    function setupRoom(room, localUsername) {
        activeRoom = room;
        console.log(`Connected to room '${room.name}' as '${localUsername}'`);

        updateStatus("connected", `Connected: ${room.name}`);
        showToast(`Joined meeting "${room.name}"`, "success");

        // View Transition
        lobbyContainer.classList.add("hidden");
        roomContainer.classList.remove("hidden");
        if (onlineCounter) onlineCounter.classList.remove("hidden");
        if (currentRoomName) currentRoomName.textContent = room.name;

        if (isHost && adminControlsPanel) {
            adminControlsPanel.classList.remove("hidden");
        }

        participantGrid.innerHTML = "";
        participantRegistry.clear();

        // Render Local Participant
        renderParticipant(room.localParticipant, localUsername, true);

        // Render Existing Remote Participants
        room.participants.forEach((p) => renderParticipant(p, p.identity, false));

        // Event: Participant Connected
        room.on("participantConnected", (p) => {
            showToast(`${p.identity} joined the meeting`, "info");
            renderParticipant(p, p.identity, false);
            updateParticipantCounts();
            updateGrid();
        });

        // Event: Participant Disconnected
        room.on("participantDisconnected", (p) => {
            showToast(`${p.identity} left the meeting`, "warning");
            cleanupParticipant(p.sid);
            updateParticipantCounts();
            updateGrid();
        });

        // Event: Dominant Speaker Highlight
        room.on("dominantSpeakerChanged", (p) => {
            document.querySelectorAll(".video-card").forEach((c) => c.classList.remove("speaking"));
            if (p) {
                const card = document.getElementById(`participant-${p.sid}`);
                if (card) card.classList.add("speaking");
            }
        });

        // Event: Reconnect Lifecycle
        room.on("reconnecting", () => updateStatus("connecting", "Reconnecting..."));
        room.on("reconnected", () => updateStatus("connected", `Connected: ${room.name}`));
        room.on("disconnected", (r, err) => onRoomDisconnected(err));

        updateParticipantCounts();
        updateGrid();
        startCallTimer();
        setJoinLoading(false);
    }

    // ==========================================================================
    // 7. PARTICIPANT RENDERING & TRACK SUBSCRIPTIONS
    // ==========================================================================

    function renderParticipant(participant, identity, isLocal = false) {
        const sid = participant.sid || "local";
        const cardId = `participant-${sid}`;
        if (document.getElementById(cardId)) return;

        const card = document.createElement("div");
        card.id = cardId;
        card.className = `video-card ${isLocal ? "local-card" : ""}`;

        card.innerHTML = `
            <div class="video-container" id="video-container-${cardId}"></div>
            <div class="video-avatar-fallback hidden" id="avatar-${cardId}">
                <div class="avatar-circle">${getInitials(identity)}</div>
            </div>
            <div class="card-user-label">
                <i class="fa-solid fa-user"></i>
                <span>${escapeHTML(identity)} ${isLocal ? "(You)" : ""}</span>
            </div>
            <div class="card-audio-status" id="audio-status-${cardId}">
                <i class="fa-solid fa-microphone"></i>
            </div>
            <div class="card-hand-indicator hidden" id="hand-${cardId}">
                ✋ Raised Hand
            </div>
        `;

        participantGrid.appendChild(card);
        const container = card.querySelector(`#video-container-${cardId}`);
        const avatarEl = card.querySelector(`#avatar-${cardId}`);
        const attachedTracks = new Set();

        participantRegistry.set(sid, { participant, cardElement: card, tracks: attachedTracks });

        // Function to subscribe to Media & DataTracks
        const subscribeTrack = (track) => {
            if (!track) return;

            if (track.kind === "data") {
                // Listen for DataTrack Signals (Chat, Emojis, Raise Hand, Admin)
                track.on("message", (data) => {
                    try {
                        const signal = JSON.parse(data);
                        handleIncomingSignal(signal, participant);
                    } catch (e) {
                        console.warn("Failed to parse DataTrack signal:", e);
                    }
                });
                return;
            }

            const mediaEl = track.attach();
            container.appendChild(mediaEl);
            attachedTracks.add(track);

            if (track.kind === "video") {
                avatarEl.classList.add("hidden");
                if (isBlurEnabled && isLocal) mediaEl.classList.add("blurred");
                if (mediaEl.play) mediaEl.play().catch(() => {});
            }
        };

        const unsubscribeTrack = (track) => {
            if (!track || track.kind === "data") return;
            const elements = track.detach();
            elements.forEach((el) => { el.pause(); el.srcObject = null; el.remove(); });
            attachedTracks.delete(track);
            if (track.kind === "video") avatarEl.classList.remove("hidden");
        };

        // Attach existing published tracks
        participant.tracks.forEach((pub) => {
            if (pub.isSubscribed && pub.track) subscribeTrack(pub.track);
        });

        participant.on("trackSubscribed", (track) => subscribeTrack(track));
        participant.on("trackUnsubscribed", (track) => unsubscribeTrack(track));

        participant.on("trackDisabled", (pub) => {
            const kind = pub.kind || (pub.track && pub.track.kind);
            if (kind === "audio") updateAudioIndicator(cardId, false);
            else if (kind === "video") avatarEl.classList.remove("hidden");
        });

        participant.on("trackEnabled", (pub) => {
            const kind = pub.kind || (pub.track && pub.track.kind);
            if (kind === "audio") updateAudioIndicator(cardId, true);
            else if (kind === "video") avatarEl.classList.add("hidden");
        });

        if (isLocal && isMicMuted) updateAudioIndicator(cardId, false);

        updateParticipantCounts();
        updateDrawerList();
        updateGrid();
    }

    function cleanupParticipant(sid) {
        const record = participantRegistry.get(sid);
        if (record) {
            record.tracks.forEach((track) => {
                try {
                    track.detach().forEach((el) => { el.pause(); el.srcObject = null; el.remove(); });
                } catch (e) {}
            });
            if (record.cardElement) record.cardElement.remove();
            participantRegistry.delete(sid);
        }
        updateDrawerList();
    }

    function updateAudioIndicator(cardId, isEnabled) {
        const audioStatus = document.getElementById(`audio-status-${cardId}`);
        if (audioStatus) {
            audioStatus.classList.toggle("muted", !isEnabled);
            audioStatus.innerHTML = `<i class="fa-solid fa-microphone${isEnabled ? "" : "-slash"}"></i>`;
        }
    }

    // ==========================================================================
    // 8. REAL-TIME SIGNALING ROUTER (DATATRACK)
    // ==========================================================================

    function sendSignal(type, payload = {}) {
        if (!localDataTrack || !activeRoom) return;
        const data = JSON.stringify({ type, sender: usernameInput.value, senderSid: activeRoom.localParticipant.sid, timestamp: new Date().toISOString(), ...payload });
        try {
            localDataTrack.send(data);
        } catch (e) {
            console.warn("Signal send error:", e);
        }
    }

    function handleIncomingSignal(signal, participant) {
        console.log("Received DataTrack signal:", signal);

        switch (signal.type) {
            case "chat":
                appendChatMessage(signal.sender, signal.text, false, signal.timestamp);
                if (sideDrawer.classList.contains("hidden") || !chatTabContent.classList.contains("hidden")) {
                    incrementUnreadBadge();
                }
                break;

            case "file":
                appendFileMessage(signal.sender, signal.fileName, signal.fileData, false);
                break;

            case "typing":
                showTypingIndicator(signal.sender);
                break;

            case "reaction":
                spawnFloatingEmoji(signal.emoji);
                break;

            case "hand_raise":
                toggleParticipantHand(signal.senderSid, signal.raised);
                showToast(`${signal.sender} ${signal.raised ? "raised their hand ✋" : "lowered their hand"}`, "info");
                break;

            case "admin_mute":
                if (signal.targetSid === activeRoom.localParticipant.sid || signal.targetSid === "all") {
                    muteLocalAudio();
                    showToast("You were muted by the meeting host.", "warning");
                }
                break;

            case "record_toggle":
                toggleRecordingUI(signal.isRecording);
                break;
        }
    }

    // ==========================================================================
    // 9. ADVANCED FEATURES: SCREEN SHARE, BLUR, PIP, RECORDING
    // ==========================================================================

    // Screen Sharing (getDisplayMedia)
    if (screenShareBtn) {
        screenShareBtn.addEventListener("click", async () => {
            if (!activeRoom) return;

            if (isScreenSharing) {
                stopScreenShare();
            } else {
                try {
                    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
                    const screenVideoTrack = stream.getVideoTracks()[0];
                    screenTrack = new Twilio.Video.LocalVideoTrack(screenVideoTrack);

                    await activeRoom.localParticipant.publishTrack(screenTrack);
                    isScreenSharing = true;
                    screenShareBtn.classList.add("btn-active");
                    showToast("Screen presentation started.", "success");

                    // Handle user clicking native browser 'Stop sharing' button
                    screenVideoTrack.onended = () => stopScreenShare();
                } catch (err) {
                    console.error("Screen Share error:", err);
                    showToast("Screen sharing was cancelled or denied.", "warning");
                }
            }
        });
    }

    function stopScreenShare() {
        if (screenTrack && activeRoom) {
            activeRoom.localParticipant.unpublishTrack(screenTrack);
            screenTrack.stop();
            screenTrack = null;
        }
        isScreenSharing = false;
        if (screenShareBtn) screenShareBtn.classList.remove("btn-active");
        showToast("Screen presentation stopped.", "info");
    }

    // Background Blur Toggle
    if (blurBtn) {
        blurBtn.addEventListener("click", () => {
            isBlurEnabled = !isBlurEnabled;
            blurBtn.classList.toggle("btn-active", isBlurEnabled);

            const localVideo = document.querySelector("#participant-local video");
            if (localVideo) localVideo.classList.toggle("blurred", isBlurEnabled);

            showToast(isBlurEnabled ? "Background blur enabled." : "Background blur disabled.", "info");
        });
    }

    // Picture in Picture (PiP)
    if (pipBtn) {
        pipBtn.addEventListener("click", async () => {
            try {
                const firstVideo = document.querySelector(".video-card video");
                if (firstVideo && document.pictureInPictureEnabled) {
                    if (document.pictureInPictureElement) {
                        await document.exitPictureInPicture();
                    } else {
                        await firstVideo.requestPictureInPicture();
                    }
                } else {
                    showToast("Picture in Picture not supported in this browser.", "warning");
                }
            } catch (err) {
                console.error("PiP Error:", err);
            }
        });
    }

    // Hand Raise Toggle
    if (handRaiseBtn) {
        handRaiseBtn.addEventListener("click", () => {
            isHandRaised = !isHandRaised;
            handRaiseBtn.classList.toggle("btn-active", isHandRaised);
            toggleParticipantHand("local", isHandRaised);
            sendSignal("hand_raise", { raised: isHandRaised });
        });
    }

    function toggleParticipantHand(sid, raised) {
        const handTag = document.getElementById(`hand-participant-${sid}`);
        if (handTag) handTag.classList.toggle("hidden", !raised);
        const card = document.getElementById(`participant-${sid}`);
        if (card) card.classList.toggle("hand-raised", raised);
    }

    // Emoji Reactions Menu
    if (emojiBtn && emojiBar) {
        emojiBtn.addEventListener("click", () => {
            emojiBar.classList.toggle("hidden");
        });

        emojiBar.addEventListener("click", (e) => {
            const chip = e.target.closest(".emoji-chip");
            if (chip) {
                const emoji = chip.getAttribute("data-emoji");
                spawnFloatingEmoji(emoji);
                sendSignal("reaction", { emoji });
                emojiBar.classList.add("hidden");
            }
        });
    }

    // Recording Toggle
    if (recordBtn) {
        recordBtn.addEventListener("click", () => {
            isRecording = !isRecording;
            toggleRecordingUI(isRecording);
            sendSignal("record_toggle", { isRecording });
        });
    }

    function toggleRecordingUI(recording) {
        isRecording = recording;
        if (recordBtn) recordBtn.classList.toggle("btn-muted", recording);
        if (recordingBadge) recordingBadge.classList.toggle("hidden", !recording);

        if (recording) {
            showToast("Meeting recording started.", "warning");
            startRecTimer();
        } else {
            showToast("Meeting recording stopped.", "info");
            stopRecTimer();
        }
    }

    // ==========================================================================
    // 10. CHAT, FILE SHARING, & DRAWER CONTROLS
    // ==========================================================================

    // Chat Drawer Toggle
    if (chatToggleBtn) {
        chatToggleBtn.addEventListener("click", () => {
            sideDrawer.classList.remove("hidden");
            switchTab("chat");
            resetUnreadBadge();
        });
    }

    if (closeDrawerBtn) {
        closeDrawerBtn.addEventListener("click", () => {
            sideDrawer.classList.add("hidden");
        });
    }

    if (tabChatBtn && tabParticipantsBtn) {
        tabChatBtn.addEventListener("click", () => switchTab("chat"));
        tabParticipantsBtn.addEventListener("click", () => switchTab("participants"));
    }

    function switchTab(tab) {
        if (tab === "chat") {
            tabChatBtn.classList.add("active");
            tabParticipantsBtn.classList.remove("active");
            chatTabContent.classList.remove("hidden");
            participantsTabContent.classList.add("hidden");
            resetUnreadBadge();
        } else {
            tabParticipantsBtn.classList.add("active");
            tabChatBtn.classList.remove("active");
            participantsTabContent.classList.remove("hidden");
            chatTabContent.classList.add("hidden");
        }
    }

    // Send Text Chat Message
    if (chatForm) {
        chatForm.addEventListener("submit", (e) => {
            e.preventDefault();
            const text = messageInput.value.trim();
            if (!text) return;

            appendChatMessage("You", text, true);
            sendSignal("chat", { text });
            messageInput.value = "";
        });

        // Typing Indicator Broadcast
        messageInput.addEventListener("input", () => {
            sendSignal("typing");
        });
    }

    function appendChatMessage(sender, text, isSelf = false, timestamp = null) {
        if (!chatFeed) return;
        const msg = document.createElement("div");
        msg.className = `chat-bubble ${isSelf ? "self" : "remote"}`;
        const timeStr = timestamp ? new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

        msg.innerHTML = `
            <span class="chat-meta">${escapeHTML(sender)} • ${timeStr}</span>
            <div class="chat-text">${escapeHTML(text)}</div>
        `;
        chatFeed.appendChild(msg);
        chatFeed.scrollTop = chatFeed.scrollHeight;
    }

    // File Sharing
    if (attachFileBtn && fileInput) {
        attachFileBtn.addEventListener("click", () => fileInput.click());

        fileInput.addEventListener("change", () => {
            const file = fileInput.files[0];
            if (!file) return;

            if (file.size > 5 * 1024 * 1024) {
                showToast("File size limit is 5MB.", "warning");
                return;
            }

            const reader = new FileReader();
            reader.onload = (e) => {
                const fileData = e.target.result;
                appendFileMessage("You", file.name, fileData, true);
                sendSignal("file", { fileName: file.name, fileData });
                fileInput.value = "";
            };
            reader.readAsDataURL(file);
        });
    }

    function appendFileMessage(sender, fileName, fileData, isSelf = false) {
        if (!chatFeed) return;
        const msg = document.createElement("div");
        msg.className = `chat-bubble ${isSelf ? "self" : "remote"}`;
        msg.innerHTML = `
            <span class="chat-meta">${escapeHTML(sender)} shared a file</span>
            <a href="${fileData}" download="${escapeHTML(fileName)}" class="chat-file-card">
                <i class="fa-solid fa-file-arrow-down"></i>
                <span>${escapeHTML(fileName)}</span>
            </a>
        `;
        chatFeed.appendChild(msg);
        chatFeed.scrollTop = chatFeed.scrollHeight;
    }

    function showTypingIndicator(username) {
        if (!typingIndicator || !typingUserText) return;
        typingUserText.textContent = `${username} is typing...`;
        typingIndicator.classList.remove("hidden");

        if (typingTimeout) clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => typingIndicator.classList.add("hidden"), 2500);
    }

    function incrementUnreadBadge() {
        unreadCount++;
        if (unreadBadge) {
            unreadBadge.textContent = unreadCount;
            unreadBadge.classList.remove("hidden");
        }
    }

    function resetUnreadBadge() {
        unreadCount = 0;
        if (unreadBadge) unreadBadge.classList.add("hidden");
    }

    // Admin Mute All & Mute Individual
    if (muteAllBtn) {
        muteAllBtn.addEventListener("click", () => {
            sendSignal("admin_mute", { targetSid: "all" });
            showToast("Mute signal sent to all participants.", "info");
        });
    }

    function updateDrawerList() {
        if (!participantsList) return;
        participantsList.innerHTML = "";
        let count = 0;

        participantRegistry.forEach((val, sid) => {
            count++;
            const row = document.createElement("div");
            row.className = "participant-row";
            const identity = val.participant.identity || "Participant";
            const isLocal = sid === "local";

            row.innerHTML = `
                <span>${escapeHTML(identity)} ${isLocal ? "(You)" : ""}</span>
                ${isHost && !isLocal ? `<button type="button" class="meet-btn meet-btn-secondary btn-sm" onclick="muteUser('${sid}')">Mute</button>` : ""}
            `;
            participantsList.appendChild(row);
        });

        if (drawerParticipantCount) drawerParticipantCount.textContent = count;
    }

    // ==========================================================================
    // 11. AUDIO & CAMERA TOGGLES & CLEANUP
    // ==========================================================================

    if (micBtn) {
        micBtn.addEventListener("click", () => {
            if (!activeRoom) return;
            if (isMicMuted) unmuteLocalAudio();
            else muteLocalAudio();
        });
    }

    function muteLocalAudio() {
        isMicMuted = true;
        if (activeRoom) {
            activeRoom.localParticipant.audioTracks.forEach((pub) => { if (pub.track) pub.track.disable(); });
        }
        if (micBtn) {
            micBtn.classList.add("btn-muted");
            micBtn.innerHTML = `<i class="fa-solid fa-microphone-slash"></i><span class="btn-tooltip">Unmute</span>`;
        }
        updateAudioIndicator("participant-local", false);
    }

    function unmuteLocalAudio() {
        isMicMuted = false;
        if (activeRoom) {
            activeRoom.localParticipant.audioTracks.forEach((pub) => { if (pub.track) pub.track.enable(); });
        }
        if (micBtn) {
            micBtn.classList.remove("btn-muted");
            micBtn.innerHTML = `<i class="fa-solid fa-microphone"></i><span class="btn-tooltip">Mute</span>`;
        }
        updateAudioIndicator("participant-local", true);
    }

    if (camBtn) {
        camBtn.addEventListener("click", () => {
            if (!activeRoom) return;
            isCamDisabled = !isCamDisabled;
            activeRoom.localParticipant.videoTracks.forEach((pub) => {
                if (pub.track) {
                    if (isCamDisabled) pub.track.disable();
                    else pub.track.enable();
                }
            });

            const localAvatar = document.getElementById("avatar-participant-local");
            if (isCamDisabled) {
                camBtn.classList.add("btn-muted");
                camBtn.innerHTML = `<i class="fa-solid fa-video-slash"></i><span class="btn-tooltip">Start Video</span>`;
                if (localAvatar) localAvatar.classList.remove("hidden");
            } else {
                camBtn.classList.remove("btn-muted");
                camBtn.innerHTML = `<i class="fa-solid fa-video"></i><span class="btn-tooltip">Stop Video</span>`;
                if (localAvatar) localAvatar.classList.add("hidden");
            }
        });
    }

    if (shareBtn) {
        shareBtn.addEventListener("click", () => {
            const roomName = roomInput.value.trim() || "general-room";
            const password = passwordInput ? passwordInput.value.trim() : "";
            const link = `${window.location.origin}/?room=${encodeURIComponent(roomName)}${password ? `&pw=${encodeURIComponent(password)}` : ""}`;
            if (navigator.clipboard) {
                navigator.clipboard.writeText(`Join VisionMeet call:\nRoom: ${roomName}\nLink: ${link}`);
                showToast("Invite link copied to clipboard!", "success");
            }
        });
    }

    if (leaveBtn) {
        leaveBtn.addEventListener("click", () => {
            if (activeRoom) activeRoom.disconnect();
        });
    }

    function onRoomDisconnected() {
        stopCallTimer();
        stopRecTimer();
        stopScreenShare();

        Array.from(participantRegistry.keys()).forEach((sid) => cleanupParticipant(sid));
        participantRegistry.clear();
        activeRoom = null;

        roomContainer.classList.add("hidden");
        sideDrawer.classList.add("hidden");
        lobbyContainer.classList.remove("hidden");
        if (onlineCounter) onlineCounter.classList.add("hidden");

        updateStatus("disconnected", "Disconnected");
        showToast("You left the meeting.", "info");

        if (localVideoTrack && previewVideo && !isCamDisabled) {
            localVideoTrack.attach(previewVideo);
            hidePreviewAvatar();
        }
    }

    function updateGrid() {
        const total = participantRegistry.size;
        if (!participantGrid) return;
        if (total <= 1) participantGrid.style.gridTemplateColumns = "minmax(320px, 850px)";
        else if (total === 2) participantGrid.style.gridTemplateColumns = "repeat(2, minmax(320px, 1fr))";
        else if (total <= 4) participantGrid.style.gridTemplateColumns = "repeat(2, minmax(300px, 1fr))";
        else participantGrid.style.gridTemplateColumns = "repeat(auto-fit, minmax(260px, 1fr))";
    }

    function updateStatus(state, text) {
        if (!statusBadge || !statusText) return;
        statusBadge.className = `status-pill status-${state}`;
        statusText.textContent = text;
    }

    function updateParticipantCounts() {
        if (!activeRoom) return;
        const total = activeRoom.participants.size + 1;
        const text = `${total} Participant${total > 1 ? "s" : ""}`;
        if (onlineCountText) onlineCountText.textContent = text;
        if (participantCountText) participantCountText.textContent = text;
    }

    function startCallTimer() {
        callSeconds = 0;
        if (callTimerInterval) clearInterval(callTimerInterval);
        callTimerInterval = setInterval(() => {
            callSeconds++;
            const m = String(Math.floor(callSeconds / 60)).padStart(2, "0");
            const s = String(callSeconds % 60).padStart(2, "0");
            if (callTimer) callTimer.textContent = `${m}:${s}`;
        }, 1000);
    }

    function stopCallTimer() {
        if (callTimerInterval) clearInterval(callTimerInterval);
        if (callTimer) callTimer.textContent = "00:00";
    }

    function startRecTimer() {
        recSeconds = 0;
        if (recTimerInterval) clearInterval(recTimerInterval);
        recTimerInterval = setInterval(() => {
            recSeconds++;
            const m = String(Math.floor(recSeconds / 60)).padStart(2, "0");
            const s = String(recSeconds % 60).padStart(2, "0");
            if (recTimer) recTimer.textContent = `${m}:${s}`;
        }, 1000);
    }

    function stopRecTimer() {
        if (recTimerInterval) clearInterval(recTimerInterval);
        if (recTimer) recTimer.textContent = "00:00";
    }

    function destroyMedia() {
        if (activeRoom) activeRoom.disconnect();
        if (localVideoTrack) { localVideoTrack.stop(); localVideoTrack = null; }
        if (localAudioTrack) { localAudioTrack.stop(); localAudioTrack = null; }
    }

    window.addEventListener("beforeunload", destroyMedia);
    window.addEventListener("pagehide", destroyMedia);
});
