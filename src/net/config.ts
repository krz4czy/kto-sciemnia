import type { PeerOptions } from 'peerjs';

/**
 * Signaling: public PeerJS broker at wss://0.peerjs.com/peerjs (key `peerjs`).
 * ICE: public STUN only. No TURN server is configured.
 * Symmetric NAT, guest Wi-Fi isolation and some mobile networks can fail.
 * Same Wi-Fi as the host screen is the reliable setup.
 */
export const PEER_OPTIONS: PeerOptions = {
  host: '0.peerjs.com',
  port: 443,
  path: '/',
  secure: true,
  debug: 0,
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun.cloudflare.com:3478' },
    ],
    sdpSemantics: 'unified-plan',
  },
};

export const APP_VERSION = 1;
