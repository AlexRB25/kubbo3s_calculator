"use client";

import { useEffect, useRef, useState } from "react";
import {
  advise,
  angleBetween,
  cameraDirection,
  covered,
  finished,
  lightFromPixels,
  newCapture,
  record,
  RINGS,
  SECTOR_DEG,
  SECTORS,
  type Advice,
  type Capture,
  type Direction,
  type Light,
  type Mode,
  type Reading,
} from "@/lib/scan-guide";

const MIN_PHOTOS = 20;
const MAX_PHOTOS = 300;
const ARROWS = { left: "←", right: "→", up: "↑", down: "↓" } as const;

type OrientationWithPermission = typeof DeviceOrientationEvent & { requestPermission?: () => Promise<"granted" | "denied"> };

/** The 24 parts of the current lap, filled when they have a photo. */
function LapRing({ capture }: { capture: Capture }) {
  const ring = Math.min(capture.ring, RINGS.length - 1);
  const [size, radius] = [76, 30];
  const center = size / 2;
  return (
    <svg width={size} height={size} aria-hidden>
      {Array.from({ length: SECTORS }, (_, index) => {
        const taken = capture.mode === "turntable" ? index < capture.turntableShots[ring] : capture.done[ring][index];
        const from = ((index * SECTOR_DEG + 1.5 - 90) * Math.PI) / 180;
        const to = (((index + 1) * SECTOR_DEG - 1.5 - 90) * Math.PI) / 180;
        const d = `M ${center + radius * Math.cos(from)} ${center + radius * Math.sin(from)} A ${radius} ${radius} 0 0 1 ${center + radius * Math.cos(to)} ${center + radius * Math.sin(to)}`;
        return <path key={index} d={d} stroke={taken ? "#35C5D6" : "rgba(255,255,255,0.25)"} strokeWidth={8} fill="none" />;
      })}
    </svg>
  );
}

function speak(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "es-MX";
  utterance.rate = 1.05;
  window.speechSynthesis.speak(utterance);
}

/**
 * Guided capture in the browser (phone browser or a webcam): the camera takes the photos by itself when the view is
 * steady and pointing at a part of the lap without a photo, and says where to go next. With motion sensors (phones)
 * both modes work; without them (a PC webcam) only "turn the object", and steadiness comes from the picture itself.
 */
export function ScanCamera({ onDone, onCancel }: { onDone: (files: File[]) => void; onCancel: () => void }) {
  const [mode, setMode] = useState<Mode | null>(null);
  const [capture, setCapture] = useState<Capture>(() => newCapture("walk"));
  const [advice, setAdvice] = useState<Advice | null>(null);
  const [banner, setBanner] = useState("");
  const [voice, setVoice] = useState(true);
  const [error, setError] = useState("");
  const [hasSensors, setHasSensors] = useState(false);

  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const reading = useRef<Reading | null>(null);
  const sensors = useRef(false);
  const captureRef = useRef(capture);
  const files = useRef<File[]>([]);
  const light = useRef<Light>("ok");
  const lastShot = useRef(0);
  const busy = useRef(false);
  const spoken = useRef({ key: "", at: 0 });
  const voiceRef = useRef(voice);
  const frameMotion = useRef(0);

  useEffect(() => {
    voiceRef.current = voice;
    if (!voice && typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
  }, [voice]);

  // Stop the camera and the voice when leaving.
  useEffect(
    () => () => {
      stream.current?.getTracks().forEach((track) => track.stop());
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    },
    [],
  );

  async function start(chosen: Mode) {
    setError("");
    // iPhone asks for the motion sensors only after a tap.
    const Orientation = (typeof DeviceOrientationEvent !== "undefined" ? DeviceOrientationEvent : null) as OrientationWithPermission | null;
    if (Orientation?.requestPermission) await Orientation.requestPermission().catch(() => "denied");
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1440 } },
      });
    } catch {
      return setError("No pudimos abrir la cámara. Da permiso de cámara en tu navegador (o conecta una webcam) y vuelve a intentar.");
    }
    const fresh = newCapture(chosen);
    captureRef.current = fresh;
    setCapture(fresh);
    files.current = [];
    lastShot.current = Date.now();
    setMode(chosen);
    if (voiceRef.current)
      speak(chosen === "walk" ? "Apunta al objeto y camina despacio a su alrededor. Yo tomo las fotos." : "Deja la cámara quieta apuntando al objeto. Yo te digo cuándo girarlo.");
    // Keep the screen on while scanning, where the browser allows it.
    const wake = (navigator as Navigator & { wakeLock?: { request(type: "screen"): Promise<unknown> } }).wakeLock;
    wake?.request("screen").catch(() => {});
  }

  // Attach the stream once the <video> exists.
  useEffect(() => {
    if (mode && video.current && stream.current) {
      video.current.srcObject = stream.current;
      video.current.play().catch(() => {});
    }
  }, [mode]);

  // Motion sensors (phones and tablets): where the camera points and how fast it turns.
  useEffect(() => {
    if (!mode) return;
    let previous: { direction: Direction; at: number } | null = null;
    const onOrientation = (event: DeviceOrientationEvent) => {
      if (event.alpha === null || event.beta === null || event.gamma === null) return;
      const r = Math.PI / 180;
      const direction = cameraDirection(event.alpha * r, event.beta * r, event.gamma * r);
      const now = Date.now();
      const raw = previous ? angleBetween(previous.direction, direction) / Math.max(0.03, (now - previous.at) / 1000) : 0;
      previous = { direction, at: now };
      reading.current = { direction, speed: reading.current ? reading.current.speed * 0.6 + raw * 0.4 : raw };
      if (!sensors.current) {
        sensors.current = true;
        setHasSensors(true);
      }
    };
    window.addEventListener("deviceorientation", onOrientation);
    return () => window.removeEventListener("deviceorientation", onOrientation);
  }, [mode]);

  function say(next: Advice) {
    const quiet = next.shoot || ["still", "wait", "first"].includes(next.key);
    const now = Date.now();
    if (quiet || next.key === spoken.current.key || (now - spoken.current.at < 2000 && next.tone !== "done")) return;
    spoken.current = { key: next.key, at: now };
    if (voiceRef.current) speak(next.text);
  }

  function finish() {
    stream.current?.getTracks().forEach((track) => track.stop());
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    onDone(files.current);
  }

  async function shoot(direction: Direction) {
    const element = video.current;
    if (!element || busy.current || !element.videoWidth) return;
    busy.current = true;
    try {
      const canvas = document.createElement("canvas");
      canvas.width = element.videoWidth;
      canvas.height = element.videoHeight;
      canvas.getContext("2d")!.drawImage(element, 0, 0);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
      if (!blob) return;
      files.current.push(new File([blob], `foto-${String(files.current.length + 1).padStart(3, "0")}.jpg`, { type: "image/jpeg" }));
      lastShot.current = Date.now();
      navigator.vibrate?.(30);
      const before = captureRef.current;
      const after = record(before, direction);
      captureRef.current = after;
      setCapture(after);
      if (after.ring !== before.ring) {
        const text = finished(after) ? "¡Listo! Ya tienes todas las fotos." : `¡Vuelta completa! ${RINGS[after.ring].hint}`;
        setBanner(text);
        spoken.current = { key: `ring-${after.ring}`, at: Date.now() };
        if (voiceRef.current) speak(text);
        setTimeout(() => setBanner(""), 4000);
        lastShot.current = Date.now() + 2500;
      }
      if (files.current.length >= MAX_PHOTOS) finish();
    } finally {
      busy.current = false;
    }
  }

  // Every quarter second: light and movement of the picture, what to say, and whether to take a photo now.
  useEffect(() => {
    if (!mode) return;
    const small = document.createElement("canvas");
    small.width = 64;
    small.height = 48;
    const context = small.getContext("2d", { willReadFrequently: true });
    let last: Uint8ClampedArray | null = null;
    const timer = setInterval(() => {
      const element = video.current;
      if (!element || !element.videoWidth || !context) return;
      context.drawImage(element, 0, 0, 64, 48);
      const pixels = context.getImageData(0, 0, 64, 48).data;
      light.current = lightFromPixels(pixels);
      // How much the picture changed since the last check (0–255): movement when there are no sensors.
      if (last) {
        let diff = 0;
        for (let index = 0; index < pixels.length; index += 16) diff += Math.abs(pixels[index + 1] - last[index + 1]);
        frameMotion.current = diff / (pixels.length / 16);
      }
      last = new Uint8ClampedArray(pixels);

      const current = captureRef.current;
      const ring = RINGS[Math.min(current.ring, RINGS.length - 1)];
      const now: Reading = sensors.current && reading.current
        ? { direction: reading.current.direction, speed: Math.max(reading.current.speed, frameMotion.current > 14 ? 40 : 0) }
        : { direction: { heading: 0, elevation: (ring.min + ring.max) / 2 }, speed: frameMotion.current > 14 ? 80 : frameMotion.current > 5 ? 40 : 0 };
      const next = advise(current, now, light.current, Date.now() - lastShot.current, true);
      setAdvice((old) => (old?.key === next.key && old.text === next.text ? old : next));
      say(next);
      if (next.shoot && !busy.current && !finished(current)) shoot(now.direction);
    }, 250);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const tone = advice?.tone === "warn" ? "text-[#F5B83D]" : advice?.tone === "done" ? "text-[#34D399]" : "text-white";
  const count = capture.photos;
  const ring = Math.min(capture.ring, RINGS.length - 1);

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-black text-white">
      {!mode ? (
        <div className="m-auto flex w-full max-w-md flex-col gap-3 overflow-y-auto p-4">
          <h2 className="text-center text-xl font-black">¿Cómo vas a escanear?</h2>
          <p className="text-center text-sm text-white/70">
            Pon el objeto en una mesa con luz pareja (sin sol directo), sobre algo con textura (un periódico sirve). Lo brillante o transparente no se escanea bien.
          </p>
          {error && <p className="rounded-lg bg-red-500/20 p-3 text-sm text-red-200">{error}</p>}
          <button className="rounded-xl bg-white/10 p-4 text-left hover:bg-white/15" onClick={() => start("walk")}>
            <p className="font-bold">🚶 Camino alrededor del objeto</p>
            <p className="text-sm text-white/70">Desde el navegador del celular. Das dos vueltas: de frente y desde arriba.</p>
          </button>
          <button className="rounded-xl bg-white/10 p-4 text-left hover:bg-white/15" onClick={() => start("turntable")}>
            <p className="font-bold">🔄 Giro el objeto</p>
            <p className="text-sm text-white/70">La cámara quieta (webcam, o el celular en un tripié) y tú giras el objeto poquito a poquito.</p>
          </button>
          <button className="btn" onClick={onCancel}>
            Cancelar
          </button>
        </div>
      ) : (
        <>
          <video ref={video} playsInline muted className="absolute inset-0 h-full w-full object-cover" />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-56 w-56 rounded-full border-2 border-dashed border-white/60" />
          </div>
          <div className="relative flex flex-1 flex-col gap-3 p-3">
            <div className="flex items-center gap-3 rounded-xl bg-black/55 p-2">
              <LapRing capture={capture} />
              <div className="min-w-0 flex-1">
                <p className="font-black">{finished(capture) ? "Terminado" : RINGS[ring].name}</p>
                <p className="text-sm text-white/80">
                  {count} fotos · {covered(capture, ring)} de {SECTORS} en esta vuelta
                </p>
                {mode === "walk" && !hasSensors && <p className="text-sm text-[#F5B83D]">Este dispositivo no tiene sensor de giro: cancela y usa «Giro el objeto».</p>}
              </div>
              <button className="px-2 text-2xl" aria-label={voice ? "Silenciar" : "Activar voz"} onClick={() => setVoice((value) => !value)}>
                {voice ? "🔊" : "🔇"}
              </button>
            </div>
            <div className="flex-1" />
            {banner && <p className="rounded-xl bg-black/65 p-3 text-center text-xl font-black text-[#34D399]">{banner}</p>}
            <div className="flex flex-col gap-2 rounded-xl bg-black/60 p-3">
              <p className={`flex min-h-14 items-center gap-2 text-xl font-black ${tone}`}>
                {advice?.arrow && <span className="text-3xl">{ARROWS[advice.arrow]}</span>}
                {advice?.text}
              </p>
              <p className="text-sm text-white/80">Mantén el objeto dentro del círculo, a unos 30–60 cm. Las fotos se toman solas.</p>
              <div className="flex gap-2">
                <button className="btn flex-1" onClick={() => (stream.current?.getTracks().forEach((track) => track.stop()), onCancel())}>
                  Cancelar
                </button>
                <button className="btn btn-primary flex-1" disabled={count < MIN_PHOTOS} onClick={finish}>
                  {count < MIN_PHOTOS ? `Faltan ${MIN_PHOTOS - count}` : "Terminar"}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
