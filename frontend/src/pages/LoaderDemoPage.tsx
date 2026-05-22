import React, { useState, useEffect } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { DocumentAnalysisLoader } from '@/components/common/DocumentAnalysisLoader';
import { Play, Pause, RotateCcw } from 'lucide-react';

export default function LoaderDemoPage() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState<'extracting' | 'analyzing' | 'validating' | 'scoring'>('extracting');
  const [selectedSize, setSelectedSize] = useState<'sm' | 'md' | 'lg'>('lg');
  const [showTimeEstimate, setShowTimeEstimate] = useState(true);

  useEffect(() => {
    if (!isPlaying) return;

    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          setIsPlaying(false);
          return 100;
        }

        const newProgress = prev + 1;

        // Update stage based on progress
        if (newProgress < 25) {
          setStage('extracting');
        } else if (newProgress < 50) {
          setStage('analyzing');
        } else if (newProgress < 75) {
          setStage('validating');
        } else {
          setStage('scoring');
        }

        return newProgress;
      });
    }, 200); // 200ms per percent = ~20 seconds total

    return () => clearInterval(interval);
  }, [isPlaying]);

  const handleReset = () => {
    setProgress(0);
    setStage('extracting');
    setIsPlaying(false);
  };

  const handlePlayPause = () => {
    if (progress >= 100) {
      handleReset();
      setIsPlaying(true);
    } else {
      setIsPlaying(!isPlaying);
    }
  };

  return (
    <AppShell>
      <div className="flex-1 overflow-y-auto bg-bg-base p-8">
        <div className="max-w-5xl mx-auto space-y-8">
          {/* Header */}
          <div>
            <h1 className="text-3xl font-bold text-text-primary mb-2">Document Analysis Loader Demo</h1>
            <p className="text-text-muted">
              Interactive showcase of the Lottie-based loader component for panel evaluations
            </p>
          </div>

          {/* Controls */}
          <div className="bg-bg-card rounded-xl border border-white/[0.06] p-6 space-y-4">
            <h2 className="text-lg font-semibold text-text-primary">Controls</h2>

            <div className="flex flex-wrap gap-4">
              {/* Play/Pause/Reset */}
              <div className="flex gap-2">
                <button
                  onClick={handlePlayPause}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent-primary text-white hover:bg-accent-secondary transition-colors"
                >
                  {isPlaying ? (
                    <>
                      <Pause className="w-4 h-4" />
                      Pause
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4" />
                      {progress >= 100 ? 'Restart' : 'Start'}
                    </>
                  )}
                </button>

                <button
                  onClick={handleReset}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg border border-white/10 text-text-primary hover:bg-white/5 transition-colors"
                >
                  <RotateCcw className="w-4 h-4" />
                  Reset
                </button>
              </div>

              {/* Size Selector */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-text-muted">Size:</span>
                {(['sm', 'md', 'lg'] as const).map((size) => (
                  <button
                    key={size}
                    onClick={() => setSelectedSize(size)}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                      selectedSize === size
                        ? 'bg-accent-primary text-white'
                        : 'bg-white/5 text-text-muted hover:bg-white/10'
                    }`}
                  >
                    {size.toUpperCase()}
                  </button>
                ))}
              </div>

              {/* Time Estimate Toggle */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showTimeEstimate}
                  onChange={(e) => setShowTimeEstimate(e.target.checked)}
                  className="w-4 h-4 rounded border-white/10 bg-white/5 text-accent-primary focus:ring-accent-primary"
                />
                <span className="text-sm text-text-muted">Show time estimate</span>
              </label>
            </div>

            {/* Manual Progress Slider */}
            <div className="space-y-2">
              <label className="text-sm text-text-muted">Manual Progress Control</label>
              <input
                type="range"
                min="0"
                max="100"
                value={progress}
                onChange={(e) => {
                  setProgress(Number(e.target.value));
                  const newProgress = Number(e.target.value);
                  if (newProgress < 25) setStage('extracting');
                  else if (newProgress < 50) setStage('analyzing');
                  else if (newProgress < 75) setStage('validating');
                  else setStage('scoring');
                }}
                disabled={isPlaying}
                className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer
                  [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4
                  [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full
                  [&::-webkit-slider-thumb]:bg-accent-primary [&::-webkit-slider-thumb]:cursor-pointer"
              />
            </div>

            {/* Stage Info */}
            <div className="flex items-center gap-4 text-sm">
              <span className="text-text-muted">Current Stage:</span>
              <span className="px-3 py-1 rounded-full bg-accent-primary/20 text-accent-primary font-medium">
                {stage.charAt(0).toUpperCase() + stage.slice(1)}
              </span>
              <span className="text-text-muted">Progress:</span>
              <span className="font-bold text-accent-primary">{progress}%</span>
            </div>
          </div>

          {/* Loader Display */}
          <div className="bg-bg-card rounded-xl border border-white/[0.06] p-8">
            <DocumentAnalysisLoader
              stage={stage}
              progress={progress}
              showTimeEstimate={showTimeEstimate}
              size={selectedSize}
            />
          </div>

          {/* Usage Examples */}
          <div className="bg-bg-card rounded-xl border border-white/[0.06] p-6 space-y-4">
            <h2 className="text-lg font-semibold text-text-primary">Usage Examples</h2>

            <div className="space-y-3">
              <div className="bg-white/[0.02] rounded-lg p-4 border border-white/[0.06]">
                <p className="text-xs font-mono text-text-muted mb-2">Basic usage:</p>
                <code className="text-xs text-accent-primary font-mono block bg-black/20 p-3 rounded">
                  {'<DocumentAnalysisLoader />'}
                </code>
              </div>

              <div className="bg-white/[0.02] rounded-lg p-4 border border-white/[0.06]">
                <p className="text-xs font-mono text-text-muted mb-2">With progress:</p>
                <code className="text-xs text-accent-primary font-mono block bg-black/20 p-3 rounded">
                  {'<DocumentAnalysisLoader progress={45} />'}
                </code>
              </div>

              <div className="bg-white/[0.02] rounded-lg p-4 border border-white/[0.06]">
                <p className="text-xs font-mono text-text-muted mb-2">With stage:</p>
                <code className="text-xs text-accent-primary font-mono block bg-black/20 p-3 rounded">
                  {'<DocumentAnalysisLoader stage="analyzing" progress={60} />'}
                </code>
              </div>

              <div className="bg-white/[0.02] rounded-lg p-4 border border-white/[0.06]">
                <p className="text-xs font-mono text-text-muted mb-2">Full configuration:</p>
                <code className="text-xs text-accent-primary font-mono block bg-black/20 p-3 rounded whitespace-pre">
{`<DocumentAnalysisLoader
  stage="scoring"
  progress={85}
  showTimeEstimate={true}
  size="lg"
/>`}
                </code>
              </div>
            </div>
          </div>

          {/* Features */}
          <div className="bg-bg-card rounded-xl border border-white/[0.06] p-6 space-y-4">
            <h2 className="text-lg font-semibold text-text-primary">Features</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                {
                  title: '🎨 Animated Lottie',
                  desc: 'Beautiful document scanning animation',
                },
                {
                  title: '📊 Progress Tracking',
                  desc: 'Visual progress bar with percentage',
                },
                {
                  title: '⏱️ Time Estimation',
                  desc: 'Calculates remaining time dynamically',
                },
                {
                  title: '🎯 Stage Indicators',
                  desc: '4-stage evaluation flow visualization',
                },
                {
                  title: '💡 Rotating Tips',
                  desc: 'Educational tips every 8 seconds',
                },
                {
                  title: '📱 Responsive',
                  desc: 'Three size variants (sm, md, lg)',
                },
              ].map((feature, idx) => (
                <div key={idx} className="flex gap-3 p-4 bg-white/[0.02] rounded-lg border border-white/[0.06]">
                  <div>
                    <h3 className="text-sm font-semibold text-text-primary mb-1">{feature.title}</h3>
                    <p className="text-xs text-text-muted">{feature.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
