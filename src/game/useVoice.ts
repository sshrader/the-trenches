import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

// Opt-in team voice chat. Audio goes directly between teammates' browsers (WebRTC); the game server only relays the setup messages
// and only between teammates who both chose to join. Free STUN servers help browsers find each other.
const ICE = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }];

type Send = (msg: object) => void;
type Peer = { pc: RTCPeerConnection; queue: RTCIceCandidateInit[]; audio: HTMLAudioElement; stop?: () => void };

export type VoiceState = { on: boolean; error: string; openMic: boolean; talking: boolean; speaking: number[]; peers: number };

export function useVoice(send: Send) {
  const [on, setOn] = useState(false);
  const [error, setError] = useState('');
  const [openMic, setOpenMicState] = useState(false);
  const [talking, setTalking] = useState(false);
  const [speaking, setSpeaking] = useState<number[]>([]);
  const [peerCount, setPeerCount] = useState(0);

  const sendRef = useRef(send);
  sendRef.current = send;
  const stream = useRef<MediaStream | null>(null);
  const peers = useRef(new Map<number, Peer>());
  const openRef = useRef(false);
  const pttRef = useRef(false);
  const onRef = useRef(false);
  const levels = useRef(new Map<number | 'me', number>()); // latest loudness per speaker
  const ctxRef = useRef<AudioContext | null>(null);

  const applyMic = useCallback(() => {
    const open = openRef.current || pttRef.current;
    stream.current?.getAudioTracks().forEach((t) => (t.enabled = open));
    setTalking(open && !!stream.current);
  }, []);

  /** Watch a stream's loudness so we can show who is speaking. */
  const watch = useCallback((key: number | 'me', ms: MediaStream) => {
    try {
      const ctx = (ctxRef.current ??= new AudioContext());
      const an = ctx.createAnalyser();
      an.fftSize = 256;
      ctx.createMediaStreamSource(ms).connect(an);
      const buf = new Uint8Array(an.frequencyBinCount);
      const timer = window.setInterval(() => {
        an.getByteFrequencyData(buf);
        let sum = 0;
        for (const v of buf) sum += v;
        levels.current.set(key, sum / buf.length);
      }, 120);
      return () => {
        clearInterval(timer);
        levels.current.delete(key);
        try {
          an.disconnect();
        } catch {
          /* already gone */
        }
      };
    } catch {
      return undefined;
    }
  }, []);

  const closePeer = useCallback((id: number) => {
    const p = peers.current.get(id);
    if (!p) return;
    p.stop?.();
    p.pc.close();
    p.audio.srcObject = null;
    p.audio.remove();
    peers.current.delete(id);
    setPeerCount(peers.current.size);
  }, []);

  const makePeer = useCallback(
    (id: number, initiator: boolean) => {
      const existing = peers.current.get(id);
      if (existing) return existing;
      const pc = new RTCPeerConnection({ iceServers: ICE });
      const audio = new Audio();
      audio.autoplay = true;
      const peer: Peer = { pc, queue: [], audio };
      peers.current.set(id, peer);
      setPeerCount(peers.current.size);
      stream.current?.getTracks().forEach((t) => pc.addTrack(t, stream.current!));
      pc.onicecandidate = (e) => {
        if (e.candidate) sendRef.current({ t: 'vsig', to: id, data: { ice: e.candidate.toJSON() } });
      };
      pc.ontrack = (e) => {
        audio.srcObject = e.streams[0];
        void audio.play().catch(() => undefined);
        peer.stop = watch(id, e.streams[0]);
      };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed' || pc.connectionState === 'closed') closePeer(id);
      };
      if (initiator) {
        void (async () => {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          sendRef.current({ t: 'vsig', to: id, data: { sdp: pc.localDescription } });
        })().catch(() => closePeer(id));
      }
      return peer;
    },
    [closePeer, watch],
  );

  const leave = useCallback(
    (tell = true) => {
      if (!onRef.current) return;
      onRef.current = false;
      if (tell) sendRef.current({ t: 'vleave' });
      for (const id of [...peers.current.keys()]) closePeer(id);
      stream.current?.getTracks().forEach((t) => t.stop());
      stream.current = null;
      levels.current.delete('me');
      setOn(false);
      setTalking(false);
      setSpeaking([]);
    },
    [closePeer],
  );

  const join = useCallback(async () => {
    if (onRef.current) return;
    setError('');
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Voice needs a secure (https) page and a browser with microphone access.');
      return;
    }
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
    } catch (e) {
      const name = (e as DOMException)?.name;
      setError(
        name === 'NotFoundError'
          ? 'No microphone found. Plug one in and try again.'
          : name === 'NotAllowedError'
            ? 'Microphone blocked. Click the lock icon in the address bar, allow the microphone for this site, then try again.'
            : `Could not start the microphone (${name || 'unknown error'}).`,
      );
      return;
    }
    onRef.current = true;
    setOn(true);
    applyMic();
    watch('me', stream.current);
    sendRef.current({ t: 'vjoin' });
  }, [applyMic, watch]);

  /** Setup messages from the server. Returns true when it was a voice message. */
  const handle = useCallback(
    (m: { t: string; [k: string]: unknown }) => {
      if (m.t === 'vpeers') {
        for (const id of m.ids as number[]) makePeer(id, true); // we are new: we make the offers
        return true;
      }
      if (m.t === 'vjoined') return true; // the newcomer will offer to us
      if (m.t === 'vleft') {
        closePeer(m.id as number);
        return true;
      }
      if (m.t === 'vkick') {
        leave(false);
        setError('You changed sides, so you left voice. Join again to talk with your new team.');
        return true;
      }
      if (m.t === 'vsig') {
        if (!onRef.current) return true;
        const from = m.from as number;
        const data = m.data as { sdp?: RTCSessionDescriptionInit; ice?: RTCIceCandidateInit };
        const peer = makePeer(from, false);
        void (async () => {
          if (data.sdp) {
            await peer.pc.setRemoteDescription(data.sdp);
            for (const c of peer.queue.splice(0)) await peer.pc.addIceCandidate(c).catch(() => undefined);
            if (data.sdp.type === 'offer') {
              const answer = await peer.pc.createAnswer();
              await peer.pc.setLocalDescription(answer);
              sendRef.current({ t: 'vsig', to: from, data: { sdp: peer.pc.localDescription } });
            }
          } else if (data.ice) {
            if (peer.pc.remoteDescription) await peer.pc.addIceCandidate(data.ice).catch(() => undefined);
            else peer.queue.push(data.ice);
          }
        })().catch(() => undefined);
        return true;
      }
      return false;
    },
    [closePeer, leave, makePeer],
  );

  const setOpenMic = useCallback(
    (v: boolean) => {
      openRef.current = v;
      setOpenMicState(v);
      applyMic();
    },
    [applyMic],
  );
  const push = useCallback(
    (down: boolean) => {
      if (pttRef.current === down) return;
      pttRef.current = down;
      applyMic();
    },
    [applyMic],
  );

  // Who is speaking right now (a few times a second).
  useEffect(() => {
    if (!on) return;
    const t = setInterval(() => {
      const ids: number[] = [];
      for (const [k, v] of levels.current) if (v > 12 && (k !== 'me' || (stream.current?.getAudioTracks()[0]?.enabled ?? false))) ids.push(k === 'me' ? -1 : k);
      setSpeaking((prev) => (prev.length === ids.length && prev.every((x, i) => x === ids[i]) ? prev : ids));
    }, 200);
    return () => clearInterval(t);
  }, [on]);

  useEffect(() => () => leave(false), [leave]);

  return useMemo(
    () => ({ on, error, openMic, talking, speaking, peers: peerCount, join, leave, handle, setOpenMic, push }),
    [on, error, openMic, talking, speaking, peerCount, join, leave, handle, setOpenMic, push],
  );
}
