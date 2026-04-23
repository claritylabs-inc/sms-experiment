"use client";

import { useEffect } from "react";

const SMS_URL = "sms:+19294430153?&body=Hey%20Spot";

export function MessageRedirect() {
  useEffect(() => {
    window.location.href = SMS_URL;
  }, []);

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-6 text-center">
      <p className="text-lg mb-6">Opening Messages...</p>
      <a href={SMS_URL} className="underline underline-offset-4">
        Tap to text Spot
      </a>
      <p className="text-sm text-muted-foreground mt-8">
        Or text (929) 443-0153
      </p>
    </div>
  );
}
