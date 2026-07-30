import { Button } from '@/components/ui/button';

export interface FormatBarProps {
  visible: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onFormatPara: (marker: string) => void;
}

const PARA_MARKERS = [
  ['p', '¶ p'],
  ['m', 'm'],
  ['q1', 'q1'],
  ['q2', 'q2'],
] as const;

/**
 * The on-demand format bar (requirements: no permanent toolbar). Toggled by
 * Ctrl+/ or the "Format" button; floats over the editor while visible.
 */
export function FormatBar({
  visible,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onFormatPara,
}: FormatBarProps) {
  if (!visible) return null;

  return (
    <div className='bg-popover absolute top-2 right-2 z-10 flex items-center gap-1 rounded-md border p-1 shadow-md'>
      <Button disabled={!canUndo} size='sm' variant='ghost' onClick={onUndo}>
        Undo
      </Button>
      <Button disabled={!canRedo} size='sm' variant='ghost' onClick={onRedo}>
        Redo
      </Button>
      <div className='bg-border mx-1 h-5 w-px' />
      {PARA_MARKERS.map(([marker, label]) => (
        <Button key={marker} size='sm' variant='ghost' onClick={() => onFormatPara(marker)}>
          {label}
        </Button>
      ))}
    </div>
  );
}
