"use client";

import { BrowserMultiFormatReader, IScannerControls } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType, Result } from "@zxing/library";
import { useEffect, useRef, useState } from "react";
import { validateVin } from "../lib/vin";

type VinCameraScannerProps = {
  onCancel: () => void;
  onDetected: (vin: string) => void;
  onCaptured: (file: File) => void;
};

const SCAN_FORMATS = [
  BarcodeFormat.CODE_39, BarcodeFormat.CODE_128, BarcodeFormat.DATA_MATRIX,
  BarcodeFormat.PDF_417, BarcodeFormat.QR_CODE,
];
const INNER_GUIDE = { left: 0.18, top: 0.39, right: 0.82, bottom: 0.61 };

type FrameMetrics = {
  blob: Blob; brightness: number; glare: number; sharpness: number; signature: number[];
};

async function measureFrame(video: HTMLVideoElement, canvas: HTMLCanvasElement): Promise<FrameMetrics | null> {
  if (!video.videoWidth || !video.videoHeight) return null;
  canvas.width = video.videoWidth; canvas.height = video.videoHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(video, 0, 0);
  const sample = document.createElement("canvas");
  sample.width = 96; sample.height = 60;
  const sampleContext = sample.getContext("2d", { willReadFrequently: true });
  if (!sampleContext) return null;
  sampleContext.drawImage(video, 0, 0, sample.width, sample.height);
  const pixels = sampleContext.getImageData(0, 0, sample.width, sample.height).data;
  const signature: number[] = [];
  let brightness = 0; let glarePixels = 0; let sharpness = 0; let previous = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    const luminance = pixels[index] * 0.299 + pixels[index + 1] * 0.587 + pixels[index + 2] * 0.114;
    brightness += luminance;
    if (luminance > 247) glarePixels += 1;
    if (index > 0) sharpness += Math.abs(luminance - previous);
    if (index % (4 * 48) === 0) signature.push(luminance);
    previous = luminance;
  }
  const pixelCount = pixels.length / 4;
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
  if (!blob) return null;
  return { blob, brightness: brightness / pixelCount, glare: glarePixels / pixelCount, sharpness: sharpness / pixelCount, signature };
}

function frameMovement(current: number[], previous: number[] | null) {
  if (!previous || previous.length !== current.length) return Number.POSITIVE_INFINITY;
  return current.reduce((sum, value, index) => sum + Math.abs(value - previous[index]), 0) / current.length;
}

export default function VinCameraScanner({ onCancel, onDetected, onCaptured }: VinCameraScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const acceptedRef = useRef(false);
  const evidenceTimerRef = useRef<number | null>(null);
  const previousSignatureRef = useRef<number[] | null>(null);
  const stableFramesRef = useRef(0);
  const measuringRef = useRef(false);
  const captureFinalizedRef = useRef(false);
  const barcodeBoundsRef = useRef<{ left: number; top: number; right: number; bottom: number } | null>(null);
  const [status, setStatus] = useState("Starting rear camera…");
  const [cameraError, setCameraError] = useState("");
  const [vinFound, setVinFound] = useState(false);
  const [captured, setCaptured] = useState(false);

  useEffect(() => {
    let mounted = true;
    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, SCAN_FORMATS);
    hints.set(DecodeHintType.TRY_HARDER, true);
    const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 120, delayBetweenScanSuccess: 500 });
    async function start() {
      try {
        if (!videoRef.current) return;
        controlsRef.current = await reader.decodeFromConstraints(
          { audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } } },
          videoRef.current,
          (result: Result | undefined) => {
            if (!result) return;
            const validation = validateVin(result.getText());
            if (!validation.valid) {
              if (!acceptedRef.current) setStatus("Barcode found, but it was not a valid VIN. Keep scanning.");
              return;
            }
            const points = result.getResultPoints();
            const video = videoRef.current;
            if (video && points.length) {
              const xs = points.map((point) => point.getX() / video.videoWidth);
              const ys = points.map((point) => point.getY() / video.videoHeight);
              barcodeBoundsRef.current = { left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) };
            }
            if (acceptedRef.current) return;
            acceptedRef.current = true;
            setVinFound(true);
            setStatus("VIN found — fit the full label inside the outer guide.");
            onDetected(validation.vin);
          },
        );
        if (mounted) setStatus("Center the VIN barcode inside the guide.");
      } catch (caught) {
        if (!mounted) return;
        setCameraError(caught instanceof DOMException && caught.name === "NotAllowedError"
          ? "Camera access was denied. Allow camera access or enter the VIN manually."
          : caught instanceof Error ? caught.message : "Unable to start the camera.");
      }
    }
    void start();
    return () => {
      mounted = false; controlsRef.current?.stop(); controlsRef.current = null;
      if (evidenceTimerRef.current) window.clearInterval(evidenceTimerRef.current);
    };
  }, [onDetected]);

  useEffect(() => {
    if (!vinFound || captured) return;
    evidenceTimerRef.current = window.setInterval(() => {
      void (async () => {
        if (measuringRef.current || captureFinalizedRef.current) return;
        measuringRef.current = true;
        const video = videoRef.current; const canvas = canvasRef.current;
        if (!video || !canvas) { measuringRef.current = false; return; }
        const metrics = await measureFrame(video, canvas);
        measuringRef.current = false;
        if (!metrics || captureFinalizedRef.current) return;
        const bounds = barcodeBoundsRef.current;
        const width = bounds ? bounds.right - bounds.left : 0;
        if (bounds && width < 0.14) { stableFramesRef.current = 0; setStatus("Move closer while keeping the full label inside the outer guide."); return; }
        if (bounds && (bounds.left < INNER_GUIDE.left || bounds.right > INNER_GUIDE.right || bounds.top < INNER_GUIDE.top || bounds.bottom > INNER_GUIDE.bottom)) {
          stableFramesRef.current = 0; setStatus("Fit the barcode inside the inner guide and the full label inside the outer guide."); return;
        }
        if (metrics.glare > 0.16 || metrics.brightness > 220) { stableFramesRef.current = 0; setStatus("Reduce glare by tilting the phone slightly."); return; }
        if (metrics.brightness < 42) { stableFramesRef.current = 0; setStatus("The label is too dark. Add light or use the vehicle interior light."); return; }
        if (metrics.sharpness < 9) { stableFramesRef.current = 0; setStatus("Move closer and let the camera focus."); return; }
        const movement = frameMovement(metrics.signature, previousSignatureRef.current);
        previousSignatureRef.current = metrics.signature;
        if (movement > 5.5) { stableFramesRef.current = 0; setStatus("Hold steady for the evidence image."); return; }
        stableFramesRef.current += 1;
        if (stableFramesRef.current < 2) { setStatus("Ready — hold steady."); return; }
        const file = new File([metrics.blob], `vin-label-${Date.now()}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
        captureFinalizedRef.current = true;
        if (evidenceTimerRef.current) window.clearInterval(evidenceTimerRef.current);
        controlsRef.current?.stop(); setCaptured(true); setStatus("VIN and evidence image captured."); onCaptured(file);
      })();
    }, 160);
    return () => { if (evidenceTimerRef.current) window.clearInterval(evidenceTimerRef.current); };
  }, [captured, onCaptured, vinFound]);

  return (
    <section aria-label="VIN camera scanner" className={`vin-camera${vinFound ? " is-vin-found" : ""}${captured ? " is-captured" : ""}`}>
      <div className="vin-camera__viewport">
        <video autoPlay muted playsInline ref={videoRef} />
        <div aria-hidden="true" className="vin-camera__shade" />
        <div aria-hidden="true" className="vin-camera__evidence-guide"><span>Full label</span></div>
        <div aria-hidden="true" className="vin-camera__scan-guide"><small>Barcode / VIN</small><span /><span /><span /><span /></div>
        <canvas className="vin-camera__capture-canvas" ref={canvasRef} />
      </div>
      <div className="vin-camera__status" role="status">
        <strong>{cameraError ? "Camera unavailable" : captured ? "Captured" : vinFound ? "VIN found" : "Scan VIN"}</strong>
        <span>{cameraError || status}</span>
      </div>
      <button className="button" onClick={onCancel} type="button">Use manual entry</button>
    </section>
  );
}
