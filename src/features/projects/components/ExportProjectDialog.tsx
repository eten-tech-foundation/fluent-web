import { useEffect, useMemo, useState } from 'react';

import { Loader2, TriangleAlert } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useExportUsfm } from '@/features/projects/hooks/useExportUsfm';
import { Logger } from '@/lib/services/logger';

interface Book {
  bookId: number;
  engDisplayName: string;
  code: string;
  completedChapters: number;
  totalChapters: number;
}

interface ExportProjectDialogProps {
  isOpen: boolean;
  onClose: () => void;
  books: Book[];
  isLoading?: boolean;
  projectUnitId: number | null;
  projectName: string;
}

export const ExportProjectDialog: React.FC<ExportProjectDialogProps> = ({
  isOpen,
  onClose,
  books,
  isLoading = false,
  projectUnitId,
  projectName,
}) => {
  const [selectedBooks, setSelectedBooks] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const exportUsfm = useExportUsfm();
  const filteredBooks = useMemo(() => books.filter(book => book.totalChapters > 0), [books]);

  useEffect(() => {
    if (isOpen && filteredBooks.length > 0) {
      setSelectedBooks(filteredBooks.map(book => book.bookId));
      setError(null);
    }
  }, [isOpen, filteredBooks]);

  const isAllSelected = useMemo(
    () => filteredBooks.length > 0 && selectedBooks.length === filteredBooks.length,
    [filteredBooks.length, selectedBooks.length]
  );

  const isIndeterminate = useMemo(
    () => selectedBooks.length > 0 && selectedBooks.length < filteredBooks.length,
    [selectedBooks.length, filteredBooks.length]
  );

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedBooks(filteredBooks.map(book => book.bookId));
    } else {
      setSelectedBooks([]);
    }
  };

  const handleBookSelection = (bookId: number, checked: boolean) => {
    setSelectedBooks(prev => (checked ? [...prev, bookId] : prev.filter(id => id !== bookId)));
  };

  const handleExport = async () => {
    if (selectedBooks.length === 0 || !projectUnitId) return;

    setError(null);
    setIsExporting(true);

    try {
      const zipBlob = await exportUsfm.mutateAsync({
        projectUnitId,
        bookIds: selectedBooks,
      });

      const url = window.URL.createObjectURL(zipBlob);
      const link = document.createElement('a');
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const hour = String(now.getHours()).padStart(2, '0');
      const minute = String(now.getMinutes()).padStart(2, '0');
      const timestamp = `${year}-${month}-${day}-${hour}-${minute}`;
      const filename = `${timestamp} ${projectName}.zip`;

      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      onClose();
    } catch (err) {
      setError('Export Failed');
      Logger.logException(err, {
        context: 'Export failed',
        projectUnitId,
        projectName,
        bookCount: selectedBooks.length,
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleClose = () => {
    if (!isExporting) {
      setSelectedBooks([]);
      setError(null);
      onClose();
    }
  };

  const formatProgress = (completed: number, total: number) => `${completed} of ${total}`;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className='flex max-h-[80vh] flex-col sm:max-w-2xl'>
        <DialogHeader className='flex-shrink-0'>
          <DialogTitle className='flex items-center justify-between'>Export Project</DialogTitle>
        </DialogHeader>

        <div className='flex flex-1 flex-col overflow-hidden'>
          {isLoading ? (
            <div className='flex items-center justify-center gap-2 py-8'>
              <Loader2 className='h-5 w-5 animate-spin text-gray-500' />
              <span className='text-gray-500'>Loading books...</span>
            </div>
          ) : filteredBooks.length === 0 ? (
            <div className='flex items-center justify-center py-8'>
              <span className='text-gray-500'>No books found in this project</span>
            </div>
          ) : (
            <div className='bg-background flex-1 overflow-hidden rounded-lg border'>
              <div className='h-full max-h-[50vh] overflow-y-auto'>
                <Table>
                  <TableHeader className='sticky top-0 z-10'>
                    <TableRow>
                      <TableHead className='bg-popover w-12 px-4 py-3'>
                        <Checkbox
                          checked={isAllSelected}
                          className={
                            isIndeterminate
                              ? 'data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground [&>svg]:opacity-50'
                              : ''
                          }
                          disabled={isExporting}
                          onCheckedChange={handleSelectAll}
                        />
                      </TableHead>
                      <TableHead className='bg-popover px-4 py-3 text-left text-sm font-semibold'>
                        Book
                      </TableHead>
                      <TableHead className='bg-popover px-4 py-3 text-left text-sm font-semibold'>
                        Completed Chapters
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredBooks.map(book => (
                      <TableRow
                        key={book.bookId}
                        className='hover cursor-pointer'
                        onClick={() => {
                          if (!isExporting) {
                            const isSelected = selectedBooks.includes(book.bookId);
                            handleBookSelection(book.bookId, !isSelected);
                          }
                        }}
                      >
                        <TableCell className='w-12 px-4 py-3'>
                          <Checkbox
                            checked={selectedBooks.includes(book.bookId)}
                            disabled={isExporting}
                            onCheckedChange={checked => handleBookSelection(book.bookId, !!checked)}
                            onClick={e => e.stopPropagation()}
                          />
                        </TableCell>
                        <TableCell className='px-4 py-3 text-sm font-medium'>
                          {book.engDisplayName}
                        </TableCell>
                        <TableCell className='px-4 py-3 text-sm'>
                          {formatProgress(book.completedChapters, book.totalChapters)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className='flex flex-shrink-0 justify-end gap-2 pt-4'>
          {error && (
            <div className='mr-4 flex w-full items-center justify-center gap-2'>
              <TriangleAlert className='h-4 w-4 text-red-500' />
              <p className='text-sm font-medium text-red-600'>{error}</p>
            </div>
          )}
          <Button
            className='min-w-[100px]'
            disabled={selectedBooks.length === 0 || isExporting || isLoading}
            onClick={handleExport}
          >
            {isExporting ? (
              <>
                <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                Exporting...
              </>
            ) : (
              <>Export</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
