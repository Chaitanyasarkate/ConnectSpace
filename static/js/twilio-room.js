/**
 * TwilioRoomManager
 * Manages Twilio Video SDK room connection, track publishing, and participant events.
 */
class TwilioRoomManager {
    constructor(options = {}) {
        this.room = null;
        this.localTracks = [];
        this.options = options;
        this.isAudioMuted = false;
        this.isVideoOff = false;
        
        this.screenTrack = null;
        this.dataTrack = null;

        // Event callbacks
        this.onParticipantJoined = options.onParticipantJoined || (() => {});
        this.onParticipantLeft = options.onParticipantLeft || (() => {});
        this.onTrackSubscribed = options.onTrackSubscribed || (() => {});
        this.onTrackUnsubscribed = options.onTrackUnsubscribed || (() => {});
        this.onDataMessage = options.onDataMessage || (() => {});
        this.onScreenShareEnded = options.onScreenShareEnded || (() => {});
        this.onDominantSpeakerChanged = options.onDominantSpeakerChanged || (() => {});
        this.onError = options.onError || (() => {});
        this.onDisconnected = options.onDisconnected || (() => {});
    }

    /**
     * Request JWT Token from Flask Backend
     * @param {string} identity - User name
     * @param {string} roomName - Room identifier
     * @returns {Promise<Object>} Token response JSON
     */
    async fetchToken(identity, roomName) {
        const response = await fetch('/api/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ identity, room: roomName })
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || 'Failed to authenticate video session.');
        }

        return data;
    }

    /**
     * Connect to Twilio Programmable Video Room
     * @param {string} token - Twilio JWT Token
     * @param {string} roomName - Room Name
     */
    async connectRoom(token, roomName) {
        if (typeof Twilio === 'undefined' || !Twilio.Video) {
            throw new Error('Twilio Video SDK failed to load from CDN.');
        }

        try {
            // 1. Create local Audio & Video media tracks from camera and mic
            let localMediaTracks = [];
            try {
                localMediaTracks = await Twilio.Video.createLocalTracks({
                    audio: true,
                    video: { width: 640, height: 480, frameRate: 24 }
                });
            } catch (mediaErr) {
                console.warn('Could not create local audio/video tracks:', mediaErr);
            }

            // 2. Initialize WebRTC DataTrack for chat, captions, and reactions
            this.dataTrack = new Twilio.Video.LocalDataTrack();

            // 3. Combine audio, video, and data tracks
            const allTracks = [...localMediaTracks, this.dataTrack];

            // 4. Connect to Twilio Room with all local tracks
            this.room = await Twilio.Video.connect(token, {
                name: roomName,
                tracks: allTracks,
                dominantSpeaker: true,
                maxAudioBitrate: 16000,
                networkQuality: { local: 1, remote: 1 }
            });

            console.log(`Successfully connected to room: ${this.room.name}`);

            // Setup local participant
            this.setupLocalParticipant();

            // Subscribe to existing participants already in room
            this.room.participants.forEach(participant => {
                this.handleParticipantConnected(participant);
            });

            // Listen for new participant connections
            this.room.on('participantConnected', participant => {
                console.log(`Participant connected: ${participant.identity}`);
                this.handleParticipantConnected(participant);
            });

            // Listen for participant disconnections
            this.room.on('participantDisconnected', participant => {
                console.log(`Participant disconnected: ${participant.identity}`);
                this.handleParticipantDisconnected(participant);
            });

            // Listen for dominant speaker changes
            this.room.on('dominantSpeakerChanged', participant => {
                if (this.onDominantSpeakerChanged) {
                    this.onDominantSpeakerChanged(participant);
                }
            });

            // Handle room disconnection (e.g. kicked or network dropped)
            this.room.on('disconnected', (room, error) => {
                console.log('Room disconnected', error);
                this.cleanup();
                this.onDisconnected(error);
            });

            return this.room;
        } catch (err) {
            console.error('Error connecting to Twilio Room:', err);
            this.cleanup();
            throw err;
        }
    }

    /**
     * Setup Local Participant Tracks
     */
    setupLocalParticipant() {
        if (!this.room || !this.room.localParticipant) return;

        const localParticipant = this.room.localParticipant;
        
        localParticipant.tracks.forEach(publication => {
            if (publication.track) {
                this.localTracks.push(publication.track);
            }
        });

        // Track publications added asynchronously
        localParticipant.on('trackPublished', publication => {
            if (publication.track && !this.localTracks.includes(publication.track)) {
                this.localTracks.push(publication.track);
            }
        });
    }

    /**
     * Handle Remote Participant Connection
     * @param {Object} participant - Twilio RemoteParticipant
     */
    handleParticipantConnected(participant) {
        this.onParticipantJoined(participant);

        // Attach existing tracks
        participant.tracks.forEach(publication => {
            if (publication.isSubscribed && publication.track) {
                this.bindRemoteTrack(publication.track, participant);
            }
        });

        // Listen for new tracks subscribed
        participant.on('trackSubscribed', track => {
            this.bindRemoteTrack(track, participant);
        });

        // Listen for tracks unsubscribed
        participant.on('trackUnsubscribed', track => {
            this.onTrackUnsubscribed(track, participant);
        });
    }

    /**
     * Bind Remote Track (Audio, Video, or Data)
     */
    bindRemoteTrack(track, participant) {
        if (track.kind === 'data') {
            track.on('message', data => {
                try {
                    const parsed = JSON.parse(data);
                    this.onDataMessage(parsed, participant);
                } catch (e) {
                    this.onDataMessage({ type: 'chat', text: data }, participant);
                }
            });
        } else {
            this.onTrackSubscribed(track, participant);
        }
    }

    /**
     * Handle Remote Participant Disconnection
     * @param {Object} participant - Twilio RemoteParticipant
     */
    handleParticipantDisconnected(participant) {
        this.onParticipantLeft(participant);
    }

    /**
     * Broadcast Data Track Message to all Room Participants
     * @param {Object} payload - Data payload
     */
    sendDataMessage(payload) {
        if (!this.dataTrack) return;
        try {
            this.dataTrack.send(JSON.stringify(payload));
        } catch (err) {
            console.warn('Twilio DataTrack broadcast skipped (peer data channel not yet ready/open):', err);
        }
    }

    /**
     * Start Screen Share Session
     */
    async startScreenShare() {
        if (!this.room || !this.room.localParticipant) return null;
        if (this.screenTrack) return this.screenTrack;

        try {
            const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
            const mediaStreamTrack = stream.getVideoTracks()[0];

            this.screenTrack = new Twilio.Video.LocalVideoTrack(mediaStreamTrack, {
                name: 'screen'
            });

            // Listen for native browser "Stop sharing" button
            mediaStreamTrack.onended = () => {
                this.stopScreenShare();
            };

            await this.room.localParticipant.publishTrack(this.screenTrack);
            return this.screenTrack;
        } catch (err) {
            console.warn('Screen share canceled or denied:', err);
            throw err;
        }
    }

    /**
     * Stop Screen Share Session
     */
    stopScreenShare() {
        if (this.screenTrack && this.room && this.room.localParticipant) {
            this.room.localParticipant.unpublishTrack(this.screenTrack);
            this.screenTrack.stop();
            this.screenTrack = null;
            this.onScreenShareEnded();
        }
    }

    /**
     * Toggle Local Audio (Mute / Unmute)
     * @returns {boolean} Is Audio Currently Muted
     */
    toggleAudio() {
        if (!this.room || !this.room.localParticipant) return false;

        this.isAudioMuted = !this.isAudioMuted;

        this.room.localParticipant.audioTracks.forEach(publication => {
            if (publication.track) {
                if (this.isAudioMuted) {
                    publication.track.disable();
                } else {
                    publication.track.enable();
                }
            }
        });

        return this.isAudioMuted;
    }

    /**
     * Toggle Local Video (On / Off)
     * @returns {boolean} Is Video Currently Off
     */
    toggleVideo() {
        if (!this.room || !this.room.localParticipant) return false;

        this.isVideoOff = !this.isVideoOff;

        this.room.localParticipant.videoTracks.forEach(publication => {
            if (publication.track) {
                if (this.isVideoOff) {
                    publication.track.disable();
                } else {
                    publication.track.enable();
                }
            }
        });

        return this.isVideoOff;
    }

    /**
     * Leave and Disconnect from Room cleanly
     */
    disconnect() {
        if (this.screenTrack) {
            this.stopScreenShare();
        }
        if (this.room) {
            this.room.disconnect();
            this.room = null;
        }
        this.cleanup();
    }

    /**
     * Stop all local tracks and release camera/mic resources
     */
    cleanup() {
        if (this.screenTrack) {
            this.screenTrack.stop();
            this.screenTrack = null;
        }
        this.localTracks.forEach(track => {
            if (track.stop) {
                track.stop();
            }
        });
        this.localTracks = [];
        this.dataTrack = null;
        this.isAudioMuted = false;
        this.isVideoOff = false;
    }
}
