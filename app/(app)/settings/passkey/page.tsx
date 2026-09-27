"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Lock, KeyRound, X } from "lucide-react";

const KEYPAD = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
  [".", "0", "⌫"],
];

export default function PasskeyPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [code, setCode] = useState("");
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const next = searchParams.get("next") || "/settings";

  // Auto-submit when all 4 digits entered
  useEffect(() => {
    if (code.length === 4 && !loading) {
      handleSubmit(code);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, code.length]);

  const handlePress = (digit: string) => {
    if (loading) return;
    setError(false);
    if (digit === "⌫") {
      setCode((prev) => prev.slice(0, -1));
    } else if (digit === "." || digit === "") {
      // ignore decimal point
    } else if (code.length < 4) {
      setCode((prev) => prev + digit);
    }
  };

  const handleSubmit = async (value: string) => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch("/api/settings/passkey", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passkey: value }),
      });
      if (res.ok) {
        router.replace(next);
      } else {
        setError(true);
        setCode("");
      }
    } catch {
      setError(true);
      setCode("");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center">
      <div className="w-full max-w-sm space-y-8 p-4">
        {/* Header */}
        <div className="text-center space-y-3">
          <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center mx-auto">
            <Lock className="w-7 h-7 text-accent" />
          </div>
          <h1 className="text-2xl font-bold text-text-primary">Admin Passkey</h1>
          <p className="text-sm text-text-muted">
            Enter the 4-digit passkey to access admin settings
          </p>
        </div>

        {/* Code display */}
        <div className="flex justify-center gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={`w-14 h-14 rounded-xl flex items-center justify-center text-3xl font-bold transition-all ${
                code[i]
                  ? "bg-accent/20 text-accent border-2 border-accent/40"
                  : "bg-surface border border-border text-text-muted"
              }`}
            >
              {code[i] ? "•" : ""}
            </div>
          ))}
        </div>

        {error && (
          <div className="flex items-center gap-2 text-center text-sm text-error bg-error/10 border border-error/20 rounded-lg px-3 py-2">
            <KeyRound className="w-4 h-4" />
            <span>Incorrect passkey. Try again.</span>
          </div>
        )}

        {/* Numeric keypad */}
        <div className="grid grid-cols-3 gap-2">
          {KEYPAD.flat().map((key) => {
            const isBackspace = key === "⌫";
            const isDot = key === ".";
            if (isDot) {
              // Render an empty invisible button to maintain grid layout
              return <div key="dot" className="h-14" />;
            }
            return (
              <button
                key={key}
                onClick={() => handlePress(key)}
                disabled={loading}
                className={`h-14 rounded-xl text-xl font-bold flex items-center justify-center transition-all disabled:opacity-50 ${
                  isBackspace
                    ? "bg-surface border border-border text-text-muted hover:bg-elevated"
                    : "bg-surface border border-border text-text-primary hover:bg-elevated hover:border-accent/30 hover:text-accent active:scale-95"
                }`}
              >
                {isBackspace ? (
                  <X className="w-5 h-5" />
                ) : (
                  key
                )}
              </button>
            );
          })}
        </div>

        <p className="text-center text-[10px] text-text-muted">
          Passkey: <code className="text-xs">5309</code>
        </p>
      </div>
    </div>
  );
}
