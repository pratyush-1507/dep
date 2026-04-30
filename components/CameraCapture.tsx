"use client";

import { useState, useRef, useEffect, useCallback } from "react";

interface CameraCaptureProps {
  onCapture: (file: File) => void;
  onCancel: () => void;
}

export default function CameraCapture({ onCapture, onCancel }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState("");

  const startCamera = useCallback(async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        videoRef.current.play().catch(console.error);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError("Could not start camera: " + msg);
    }
  }, []);

  useEffect(() => {
    startCamera();
    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const takePhoto = () => {
    if (!videoRef.current || !stream) return;
    const canvas = document.createElement("canvas");
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    
    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], "capture.jpg", { type: "image/jpeg" });
      
      // Stop the camera
      stream.getTracks().forEach((track) => track.stop());
      onCapture(file);
    }, "image/jpeg", 0.85);
  };

  return (
    <div className="camera-capture-container" style={{ position: "relative", width: "100%", maxWidth: "500px", margin: "0 auto", borderRadius: "12px", overflow: "hidden", backgroundColor: "#000" }}>
      {error ? (
        <div style={{ padding: "2rem", color: "#ef4444", textAlign: "center" }}>{error}</div>
      ) : (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          style={{ width: "100%", display: "block" }}
        />
      )}
      <div style={{ position: "absolute", bottom: "1rem", left: "0", right: "0", display: "flex", justifyContent: "center", gap: "1rem" }}>
        <button type="button" className="btn" style={{ backgroundColor: "rgba(0,0,0,0.6)", color: "white" }} onClick={onCancel}>
          Cancel
        </button>
        {!error && (
          <button type="button" className="btn btn-primary" onClick={takePhoto}>
            📸 Capture
          </button>
        )}
      </div>
    </div>
  );
}
