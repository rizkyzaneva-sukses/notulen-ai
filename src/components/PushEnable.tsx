"use client";

import { useEffect, useState } from "react";
import { Bell } from "lucide-react";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export function PushEnable() {
  const [supported, setSupported] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setSupported(
      typeof window !== "undefined" &&
        "serviceWorker" in navigator &&
        "PushManager" in window
    );
  }, []);

  async function enable() {
    setBusy(true);
    try {
      const res = await fetch("/api/push/subscribe");
      const { publicKey } = await res.json();
      if (!publicKey) {
        alert("VAPID belum dikonfigurasi di server");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      const json = sub.toJSON();
      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(json),
      });
      setEnabled(true);
    } catch (e) {
      console.error(e);
      alert("Gagal mengaktifkan notifikasi");
    } finally {
      setBusy(false);
    }
  }

  if (!supported || enabled) return null;

  return (
    <button
      type="button"
      onClick={enable}
      disabled={busy}
      className="btn-ghost text-xs"
      title="Aktifkan push notification"
    >
      <Bell className="h-3.5 w-3.5" />
      Notif
    </button>
  );
}
