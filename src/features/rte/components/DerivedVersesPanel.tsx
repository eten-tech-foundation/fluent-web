import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import type { SaveSettings, SaveState } from '../hooks/useRtePoc';
import type { DerivedVerse } from '../lib/usj-verses';

export interface DerivedVersesPanelProps {
  verses: DerivedVerse[];
  changedKeys: ReadonlySet<string>;
  sliceKeys: ReadonlySet<string>;
  canPost: boolean;
  saveState: SaveState;
  onSave: (settings: SaveSettings) => void;
}

/**
 * The save-path proof: verse rows derived live from the chapter USJ — exactly
 * what POST /translated-verses stores today. Posting is a deliberate opt-in.
 */
export function DerivedVersesPanel({
  verses,
  changedKeys,
  sliceKeys,
  canPost,
  saveState,
  onSave,
}: DerivedVersesPanelProps) {
  const [projectUnitId, setProjectUnitId] = useState('');
  const [assignedUserId, setAssignedUserId] = useState('');
  const changedCount = changedKeys.size;
  const settingsReady = projectUnitId !== '' && assignedUserId !== '';

  return (
    <div className='space-y-3'>
      <ul className='max-h-64 space-y-1 overflow-y-auto pr-1'>
        {verses.map(verse => {
          const key = `${verse.chapterNumber}:${verse.verseNumber}`;
          const changed = changedKeys.has(key);
          const inSlice = sliceKeys.has(key);
          return (
            <li
              key={key}
              className={`flex items-start gap-2 rounded px-1.5 py-1 text-sm ${
                inSlice ? 'bg-accent/50' : ''
              }`}
            >
              <span className='text-muted-foreground w-10 shrink-0 font-mono text-xs leading-5'>
                {key}
              </span>
              <span
                className={`min-w-0 flex-1 ${verse.text === '' ? 'text-muted-foreground italic' : ''}`}
              >
                {verse.text === '' ? '(empty)' : verse.text}
              </span>
              {changed && <Badge variant='primary'>changed</Badge>}
            </li>
          );
        })}
      </ul>

      <div className='space-y-2 border-t pt-3'>
        <div className='flex flex-wrap items-end gap-2'>
          <div className='space-y-1'>
            <Label className='text-xs' htmlFor='rte-project-unit'>
              Project unit
            </Label>
            <Input
              className='h-8 w-24'
              id='rte-project-unit'
              value={projectUnitId}
              onChange={event => setProjectUnitId(event.target.value)}
            />
          </div>
          <div className='space-y-1'>
            <Label className='text-xs' htmlFor='rte-assigned-user'>
              User id
            </Label>
            <Input
              className='h-8 w-20'
              id='rte-assigned-user'
              value={assignedUserId}
              onChange={event => setAssignedUserId(event.target.value)}
            />
          </div>
          <Button
            disabled={
              !canPost || !settingsReady || changedCount === 0 || saveState.status === 'saving'
            }
            size='sm'
            onClick={() =>
              onSave({
                projectUnitId: Number(projectUnitId),
                assignedUserId: Number(assignedUserId),
              })
            }
          >
            {saveState.status === 'saving' ? 'Saving…' : `Save ${changedCount} changed`}
          </Button>
        </div>
        <p className='text-muted-foreground text-xs'>
          {canPost
            ? 'Posts each changed verse to /translated-verses (same call the drafting editor makes).'
            : 'Load a chapter from the API to enable posting (the sample has no bibleTextIds).'}
        </p>
        {saveState.detail != null && (
          <p
            className={`text-xs ${saveState.status === 'error' ? 'text-destructive' : 'text-muted-foreground'}`}
          >
            {saveState.detail}
          </p>
        )}
      </div>
    </div>
  );
}
