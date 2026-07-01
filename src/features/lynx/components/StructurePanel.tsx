import type { StructureSnapshot } from '../lib/verse-map';

interface StructurePanelProps {
  structure?: StructureSnapshot;
}

/**
 * Renders the parsed document twice, both purely from the typed node tree:
 * as reader-style formatted scripture, and as the raw node tree — the point
 * being that the front end now *understands* the USFM rather than storing it
 * as an opaque string.
 */
export function StructurePanel({ structure }: StructurePanelProps) {
  if (structure == null) {
    return <p className='text-muted-foreground text-sm'>Nothing parsed yet.</p>;
  }

  return (
    <div className='space-y-6'>
      <section>
        <h3 className='text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase'>
          Formatted preview (from the node tree)
        </h3>
        <div className='bg-card rounded-lg border-2 p-5 font-serif shadow-sm'>
          {structure.chapters.map(chapter => (
            <div key={chapter.number} className='mb-4 last:mb-0'>
              <div className='flex gap-3'>
                <span className='text-primary text-4xl leading-none font-bold'>
                  {chapter.number}
                </span>
                <p className='text-base leading-relaxed'>
                  {chapter.verses.map(verse => (
                    <span key={`${chapter.number}:${verse.number}`}>
                      <sup className='text-primary mr-0.5 text-[0.65rem] font-bold'>
                        {verse.number}
                      </sup>
                      {verse.text.trim()}{' '}
                    </span>
                  ))}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3 className='text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase'>
          Typed node tree ({structure.tree.length} nodes)
        </h3>
        <div className='bg-card max-h-80 overflow-auto rounded-lg border-2 p-3 shadow-sm'>
          {structure.tree.map((node, index) => (
            <div
              key={`${node.type}-${index}`}
              className='flex items-baseline gap-2 py-0.5 font-mono text-xs'
              style={{ paddingLeft: `${node.depth * 16}px` }}
            >
              <span className='text-primary shrink-0 font-semibold'>{node.type}</span>
              <span className='text-muted-foreground truncate'>{node.label}</span>
              <span className='text-muted-foreground/60 ml-auto shrink-0'>
                {node.range.start.line}:{node.range.start.character}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
