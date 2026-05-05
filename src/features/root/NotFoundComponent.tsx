import { Link } from '@tanstack/react-router';

export function NotFoundComponent(): React.JSX.Element {
  return (
    <div className='flex h-screen items-center justify-center'>
      <div className='text-center'>
        <h1 className='mb-2 text-2xl font-bold'>Page not found</h1>
        <p className='mb-4 text-gray-600 dark:text-gray-400'>
          The page you are looking for does not exist.
        </p>
        <Link className='text-primary underline' to='/'>
          Go home
        </Link>
      </div>
    </div>
  );
}
