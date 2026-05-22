# DocumentAnalysisLoader Component

A sophisticated Lottie-based loader component specifically designed for long-running panel evaluation processes (2+ minutes). Features animated document scanning visualization with progress tracking, stage indicators, and rotating educational tips.

## Features

- 🎨 **Animated Lottie Document Scanning** - Beautiful papers being scanned/processed animation
- 📊 **Progress Bar** - Visual progress indicator with percentage
- ⏱️ **Time Estimation** - Calculates and displays remaining time
- 🎯 **Stage Indicators** - Shows current evaluation stage (extracting → analyzing → validating → scoring)
- 💡 **Rotating Tips** - Educational tips that rotate every 8 seconds to keep users engaged
- 🎭 **Responsive Sizing** - Three size variants (sm, md, lg)
- 🎨 **Theme Matched** - Uses your app's orange accent colors (#FF6B4A)

## Installation

Already installed as part of the common components. The Lottie animation is loaded from `/public/document-analysis.json`.

## Usage

### Basic Usage

```tsx
import { DocumentAnalysisLoader } from '@/components/common/DocumentAnalysisLoader';

function MyComponent() {
  return <DocumentAnalysisLoader />;
}
```

### With Progress

```tsx
<DocumentAnalysisLoader 
  progress={45}
  showTimeEstimate={true}
/>
```

### With Stage Tracking

```tsx
<DocumentAnalysisLoader 
  stage="analyzing"
  progress={60}
/>
```

### With Custom Message

```tsx
<DocumentAnalysisLoader 
  message="Analyzing 24 panel evaluations..."
  progress={75}
  size="lg"
/>
```

### Full Example

```tsx
import { DocumentAnalysisLoader } from '@/components/common/DocumentAnalysisLoader';

function BulkEvaluationPage() {
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState<'extracting' | 'analyzing' | 'validating' | 'scoring'>('extracting');

  return (
    <div>
      {isProcessing && (
        <DocumentAnalysisLoader
          stage={stage}
          progress={progress}
          showTimeEstimate={true}
          size="lg"
        />
      )}
    </div>
  );
}
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `stage` | `'extracting' \| 'analyzing' \| 'validating' \| 'scoring'` | `undefined` | Current evaluation stage - shows stage-specific message and indicators |
| `progress` | `number` | `undefined` | Progress percentage (0-100) - shows progress bar when provided |
| `showTimeEstimate` | `boolean` | `true` | Whether to show estimated time remaining (requires `progress`) |
| `message` | `string` | `undefined` | Custom message to display (overrides stage message) |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | Size variant of the animation |

## Stage Messages

Each stage has a predefined message:

- **extracting**: "Extracting JD requirements..."
- **analyzing**: "Analyzing interview transcript..."
- **validating**: "Validating responses against L2..."
- **scoring**: "Computing final panel score..."

## Educational Tips

The component displays rotating tips to keep users engaged during long waits:

1. "Our AI analyzes 50+ dimensions to ensure fair panel evaluation"
2. "Each evaluation considers technical skills, behavioral traits, and communication quality"
3. "The system cross-references L1 transcripts with L2 rejection reasons for accuracy"
4. "Panel scores are calibrated using industry-standard frameworks"
5. "Our LLM processes thousands of data points to generate comprehensive insights"

Tips rotate every 8 seconds automatically.

## Time Estimation

When `progress` is provided and between 0-100, the component calculates estimated remaining time based on:
- Assumed average total time: 120 seconds (2 minutes)
- Formula: `remaining = (120 * (100 - progress)) / 100`

## Animation Details

The Lottie animation (`document-analysis.json`) features:
- **Background Circle**: Pulsing orange glow effect
- **Three Documents**: Floating and rotating papers with text lines
- **Scanner Beam**: Animated scanning line with gradient
- **Scan Lines**: Horizontal scan effect
- **Color Scheme**: Orange (#FF6B4A) matching your app's theme

## Size Variants

| Size | Dimensions | Use Case |
|------|------------|----------|
| `sm` | 128x128px | Inline or compact views |
| `md` | 192x192px | Default - balanced for most uses |
| `lg` | 256x256px | Full-screen or prominent displays |

## Integration Examples

### In BulkUploadForm

```tsx
{isRunning && (
  <DocumentAnalysisLoader
    progress={progress}
    showTimeEstimate={true}
    size="lg"
  />
)}
```

### In Modal/Dialog

```tsx
<Dialog open={isProcessing}>
  <DialogContent>
    <DocumentAnalysisLoader
      stage={currentStage}
      progress={progress}
      size="md"
    />
  </DialogContent>
</Dialog>
```

### With Real-time Updates

```tsx
useEffect(() => {
  const interval = setInterval(() => {
    // Update from backend
    fetchProgress().then(data => {
      setProgress(data.progress);
      setStage(data.stage);
    });
  }, 2000);

  return () => clearInterval(interval);
}, []);
```

## Testing

Unit tests are available in `__tests__/DocumentAnalysisLoader.test.tsx`:

```bash
npm test DocumentAnalysisLoader
```

## Performance

- **Animation**: Loads asynchronously from public folder
- **Fallback**: Shows spinning loader while animation loads
- **Bundle Size**: lottie-react adds ~17KB (gzipped)
- **Animation File**: ~8KB JSON

## Accessibility

- Uses semantic HTML
- Includes animated elements with appropriate ARIA attributes
- Text is readable and contrast-compliant
- Animation respects `prefers-reduced-motion` (handled by Lottie)

## Browser Support

- ✅ Chrome/Edge (latest)
- ✅ Firefox (latest)
- ✅ Safari (latest)
- ✅ Mobile browsers (iOS Safari, Chrome Android)

## Customization

To customize tips or stage messages, edit the constants in the component:

```tsx
const STAGE_MESSAGES = {
  extracting: 'Your custom message...',
  // ...
};

const TIPS = [
  'Your custom tip...',
  // ...
];
```

## Related Components

- `LoadingSpinner` - Simple spinner for quick operations
- `UploadStatus` - File upload progress indicator
- `ProgressRing` - Circular progress indicator

## Credits

- Lottie animation: Custom-built for Panel Pulse AI
- Library: lottie-react
- Design: Matches Panel Pulse AI brand guidelines
