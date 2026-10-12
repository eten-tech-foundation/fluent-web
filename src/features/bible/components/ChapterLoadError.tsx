import { Button } from '@/components/ui/button';

/** The failed loader must not expose an empty, editable chapter. */
export function ChapterLoadError() {
  return (
    <div className='flex flex-col items-center gap-4 p-8' role='alert'>
      <p>Refresh the page to try again.</p>
      <Button onClick={() => window.location.reload()}>Refresh</Button>
    </div>
  );
}
