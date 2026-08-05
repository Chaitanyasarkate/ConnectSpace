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
        
        // Event callbacks
        this.onParticipantJoined = options.onParticipantJoined || (() => {});
        this.onParticipantLeft = options.onParticipantLeft || (() => {});
        this.onTrackSubscribed = options.onTrackSubscribed || (() => {});
        this.onTrackUnsubscribed = options.onTrackUnsubscribed || (() => {});
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
            // Connect to Twilio Room with audio and video options
            this.room = await Twilio.Video.connect(token, {
                name: roomName,
                audio: true,
                video: { width: 640, height: 480, frameRate: 24 },
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
                this.onTrackSubscribed(publication.track, participant);
            }
        });

        // Listen for new tracks subscribed
        participant.on('trackSubscribed', track => {
            this.onTrackSubscribed(track, participant);
        });

        // Listen for tracks unsubscribed
        participant.on('trackUnsubscribed', track => {
            this.onTrackUnsubscribed(track, participant);
        });
    }

    /**
     * Handle Remote Participant Disconnection
     * @param {Object} participant - Twilio RemoteParticipant
     */
    handleParticipantDisconnected(participant) {
        this.onParticipantLeft(participant);
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
        this.localTracks.forEach(track => {
            if (track.stop) {
                track.stop();
            }
        });
        this.localTracks = [];
        this.isAudioMuted = false;
        this.isVideoOff = false;
    }
}
