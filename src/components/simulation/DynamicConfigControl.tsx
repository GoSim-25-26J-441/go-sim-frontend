"use client";

import { useState, useEffect, useMemo } from "react";
import { SimulationRun } from "@/types/simulation";
import { updateWorkloadRate } from "@/lib/api-client/simulation";
import { Sliders, Loader2, CheckCircle2, AlertCircle } from "lucide-react";

interface DynamicConfigControlProps {
  run: SimulationRun;
  onUpdate?: () => void;
}

export function DynamicConfigControl({ run, onUpdate }: DynamicConfigControlProps) {
  const initialRate = useMemo(
    () => run.config.workload.rps_target || run.config.workload.concurrent_users * 0.5,
    [run.config.workload.rps_target, run.config.workload.concurrent_users]
  );

  const [rpsRate, setRpsRate] = useState<number>(initialRate);
  const [updating, setUpdating] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<{ success: boolean; message?: string } | null>(null);

  // Update local state when initial rate changes
  useEffect(() => {
    setRpsRate(initialRate);
  }, [initialRate]);

  // Generate pattern key from config
  // Pattern key format: "{from}:{to}" (e.g., "client:svc1:/test")
  // For our simplified config, we'll construct it based on available data
  // TODO: This should come from the simulation config's workload patterns when available
  const getPatternKey = (): string => {
    // If the config has scenario info, use it; otherwise use a default pattern
    if (run.config.scenario) {
      // Try to infer service name from scenario or use a generic one
      return `client:${run.config.scenario}:default`;
    }
    // Default pattern key format
    return `client:default:/api`;
  };

  const patternKey = getPatternKey();

  const isRunning = run.status === "running";

  const handleRateUpdate = async (newRate: number) => {
    if (!isRunning) return;

    setRpsRate(newRate);
    setUpdating(true);
    setLastUpdate(null);

    try {
      await updateWorkloadRate(run.id, patternKey, newRate);
      setLastUpdate({ success: true });
      onUpdate?.();
      
      // Clear success message after 3 seconds
      setTimeout(() => setLastUpdate(null), 3000);
    } catch (error) {
      console.error("Failed to update workload rate:", error);
      setLastUpdate({
        success: false,
        message: error instanceof Error ? error.message : "Failed to update workload rate",
      });
    } finally {
      setUpdating(false);
    }
  };

  // Calculate stable min/max rates based on initial rate
  const minRate = 1;
  const maxRate = useMemo(() => {
    // Use a reasonable max based on initial rate (at least 1000, or 5x initial if larger)
    return Math.max(1000, Math.ceil(initialRate * 5));
  }, [initialRate]);

  // Clamp current rate to valid range
  const clampedRpsRate = Math.max(minRate, Math.min(maxRate, rpsRate));
  const isRateChanged = Math.abs(clampedRpsRate - initialRate) > 0.1; // Use small threshold for float comparison

  const handleSliderChange = (value: number) => {
    // Clamp value to valid range
    const clampedValue = Math.max(minRate, Math.min(maxRate, value));
    setRpsRate(clampedValue);
  };

  const handleNumericInputChange = (value: string) => {
    const numValue = parseFloat(value);
    if (!isNaN(numValue) && numValue >= minRate && numValue <= maxRate) {
      setRpsRate(numValue);
    } else if (value === "" || isNaN(numValue)) {
      // Allow empty input temporarily
      const clampedValue = parseFloat(value) || minRate;
      setRpsRate(Math.max(minRate, Math.min(maxRate, clampedValue)));
    }
  };

  const handleApplyRate = () => {
    // Ensure value is within bounds before applying
    const clampedRate = Math.max(minRate, Math.min(maxRate, rpsRate));
    setRpsRate(clampedRate);
    handleRateUpdate(clampedRate);
  };

  if (!isRunning) {
    return (
      <div className="bg-card rounded-lg p-6 border border-border">
        <div className="flex items-center gap-3 text-white/60">
          <Sliders className="w-5 h-5" />
          <div>
            <h3 className="text-lg font-semibold text-white mb-1">Dynamic Configuration</h3>
            <p className="text-sm">Available only for running simulations</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-lg p-6 border border-border">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Sliders className="w-5 h-5 text-blue-400" />
          <div>
            <h3 className="text-lg font-semibold text-white">Dynamic Configuration</h3>
            <p className="text-sm text-white/60">
              Adjust workload rate during simulation execution
            </p>
          </div>
        </div>

        {lastUpdate && (
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm ${
              lastUpdate.success
                ? "bg-green-500/20 text-green-400"
                : "bg-red-500/20 text-red-400"
            }`}
          >
            {lastUpdate.success ? (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>Rate updated</span>
              </>
            ) : (
              <>
                <AlertCircle className="w-4 h-4" />
                <span>{lastUpdate.message || "Update failed"}</span>
              </>
            )}
          </div>
        )}
      </div>

      <div className="space-y-4">
        {/* Workload Rate Control */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <label className="text-sm font-medium text-white">
              Request Rate (RPS)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={minRate}
                max={maxRate}
                step={10}
                value={Math.round(clampedRpsRate)}
                onChange={(e) => handleNumericInputChange(e.target.value)}
                onBlur={(e) => {
                  // On blur, ensure value is valid
                  const value = parseFloat(e.target.value);
                  if (isNaN(value) || value < minRate) {
                    setRpsRate(minRate);
                  } else if (value > maxRate) {
                    setRpsRate(maxRate);
                  } else {
                    setRpsRate(value);
                  }
                }}
                className="w-24 px-3 py-1.5 bg-white/10 border border-white/20 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-sm text-white/60">RPS</span>
            </div>
          </div>

          <div className="relative">
            <input
              type="range"
              min={minRate}
              max={maxRate}
              step={10}
              value={Math.max(minRate, Math.min(maxRate, rpsRate))}
              onChange={(e) => {
                const value = parseFloat(e.target.value);
                if (!isNaN(value)) {
                  handleSliderChange(value);
                }
              }}
              className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-500 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-blue-500 [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:border-none"
              style={{
                background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${((Math.max(minRate, Math.min(maxRate, rpsRate)) - minRate) / (maxRate - minRate)) * 100}%, rgba(255,255,255,0.1) ${((Math.max(minRate, Math.min(maxRate, rpsRate)) - minRate) / (maxRate - minRate)) * 100}%, rgba(255,255,255,0.1) 100%)`,
              }}
            />
            <div className="flex justify-between mt-1 text-xs text-white/40">
              <span>{minRate}</span>
              <span>{maxRate}</span>
            </div>
          </div>

          {/* Current vs Target Display */}
          <div className="mt-3 flex items-center gap-4 text-sm">
            <div>
              <span className="text-white/60">Initial Rate:</span>
              <span className="text-white ml-2 font-medium">
                {Math.round(initialRate)} RPS
              </span>
            </div>
            <div>
              <span className="text-white/60">Current Rate:</span>
              <span className="text-blue-400 ml-2 font-medium">
                {Math.round(clampedRpsRate)} RPS
              </span>
            </div>
          </div>

          {/* Apply Button */}
          <button
            onClick={handleApplyRate}
            disabled={updating || !isRateChanged}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-600 disabled:cursor-not-allowed disabled:opacity-50 flex items-center gap-2"
          >
            {updating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Updating...</span>
              </>
            ) : (
              <span>Apply Rate Change</span>
            )}
          </button>
        </div>

        {/* Info */}
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
          <p className="text-xs text-blue-300">
            <strong>Note:</strong> Rate changes take effect immediately and affect future event
            generation. The simulation will continue with the new rate until changed again or the
            simulation completes.
          </p>
        </div>
      </div>
    </div>
  );
}

