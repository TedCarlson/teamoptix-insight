"use client";

import { BrowserMultiFormatReader, IScannerControls } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType, Result } from "@zxing/library";
import { useEffect, useRef, useState } from "react";
import { validateVin } from "../lib/vin";

type VinCameraScannerProps = {
  onCancel: () => void;
  onDetected: (vin: string) => void;
};

const SCAN_FORMATS = [
  BarcodeFormat.CODE_39,
  BarcodeFormat.CODE_128,
  BarcodeFormat.DATA_MATRIX,
  BarcodeFormat.PDF_417,
  BarcodeFormat.QR_CODE,
];

export default function VinCameraScanner({ onCancel, onDetected }: VinCameraScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const acceptedRef = useRef(false);
  const [status, setStatus] = useState("Starting rear camera…");
  const [cameraError, setCameraError] = useState("");

  useEffect(() => {
    let mounted = true;
    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, SCAN_FORMATS);
    hints.set(DecodeHintType.TRY_HARDER, true);
    const reader = new BrowserMultiFormatReader(hints, {
      delayBetweenScanAttempts: 120,
      delayBetweenScanSuccess: 500,
    });

    async function start() {
      try {
        if (!videoRef.current) return;
        controlsRef.current = await reader.decodeFromConstraints(
          {
            audio: false,
            video: {
              facingMode: { ideal: "environment" },
              width: { ideal: 1920 },
              height: { ideal: 1080 },
            },
          },
          videoRef.current,
          (result: Result | undefined) => {
            if (!result || acceptedRef.current) return;
            const validation = validateVin(result.getText());
            if (!validation.valid) {
              setStatus("Barcode found, but it was not a valid VIN. Keep scanning.");
              return;
            }
            acceptedRef.current = true;
            controlsRef.current?.stop();
            setStatus(`VIN captured: ${validation.vin}`);
            onDetected(validation.vin);
          },
        );
        if (mounted) setStatus("Center the VIN barcode inside the guide.");
      } catch (caught) {
        if (!mounted) return;
        const message = caught instanceof DOMException && caught.name === "NotAllowedError"
          ? "Camera access was denied. Allow camera access or enter the VIN manually."
          : caught instanceof Error ? caught.message : "Unable to start the camera.";
        setCameraError(message);
      }
    }

    void start();
    return () => {
      mounted = false;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, [onDetected]);

  return (
    <section aria-label="VIN camera scanner" className="vin-camera">
      <div className="vin-camera__viewport">
        <video autoPlay muted playsInline ref={videoRef} />
        <div aria-hidden="true" className="vin-camera__shade" />
        <div aria-hidden="true" className="vin-camera__target">
          <span />
          <span />
          <span />
          <span />
        </div>
      </div>
      <div className="vin-camera__status" role="status">
        <strong>{cameraError ? "Camera unavailable" : "Scan VIN"}</strong>
        <span>{cameraError || status}</span>
      </div>
      <button className="button" onClick={onCancel} type="button">Use manual entry</button>
    </section>
  );
}
